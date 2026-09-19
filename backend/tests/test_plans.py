import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.models import User, WeeklyPlan, WeeklyPlanSlot, WorkoutTemplate

MONDAY = "2026-09-14"


def _create_template(auth_client, exercise, name="Upper A"):
    response = auth_client.post(
        "/api/templates",
        json={
            "name": name,
            "exercises": [{"exercise_id": exercise["id"], "position": 0, "target_sets": 1}],
        },
    )
    assert response.status_code == 201
    return response.json()


def _create_workout(auth_client, performed_at):
    response = auth_client.post(
        "/api/workouts", json={"performed_at": performed_at, "exercises": []}
    )
    assert response.status_code == 201
    return response.json()


def test_plan_crud_activate_and_calendar(auth_client, exercise):
    template = _create_template(auth_client, exercise, "Upper A")
    created = auth_client.post(
        "/api/plans",
        json={
            "name": "Upper/Lower",
            "slots": [
                {"day_of_week": 0, "template_id": template["id"]},
                {"day_of_week": 3, "template_id": None},
            ],
        },
    )
    assert created.status_code == 201
    plan = created.json()
    assert plan["is_active"] is False
    assert [slot["day_of_week"] for slot in plan["slots"]] == [0, 3]
    assert plan["slots"][0]["template_id"] == template["id"]
    assert plan["slots"][0]["template_name"] == "Upper A"
    assert plan["slots"][1]["template_id"] is None
    assert plan["slots"][1]["template_name"] is None

    fetched = auth_client.get(f"/api/plans/{plan['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == plan

    assert [p["id"] for p in auth_client.get("/api/plans").json()] == [plan["id"]]
    assert auth_client.post(f"/api/plans/{plan['id']}/activate").status_code == 200

    response = auth_client.get(f"/api/calendar?week_start={MONDAY}")
    assert response.status_code == 200
    cal = response.json()
    assert cal["week_start"] == "2026-09-14T00:00:00Z"
    assert cal["week_end"] == "2026-09-21T00:00:00Z"
    assert cal["plan"] == {"id": plan["id"], "name": "Upper/Lower"}
    assert len(cal["days"]) == 7
    assert [day["date"] for day in cal["days"]] == [
        f"2026-09-{14 + offset:02d}" for offset in range(7)
    ]
    assert [day["day_of_week"] for day in cal["days"]] == list(range(7))
    assert cal["days"][0]["template_name"] == "Upper A"
    assert cal["days"][1]["template_name"] is None
    assert cal["adherence"]["planned_days"] == 1

    auth_client.post("/api/workouts/from-template/" + template["id"])
    auth_client.post(f"/api/plans/{plan['id']}/activate")  # idempotent
    assert auth_client.get(f"/api/calendar?week_start={MONDAY}").status_code == 200
    assert auth_client.get("/api/calendar?week_start=2026-09-16").status_code == 422
    assert auth_client.get("/api/calendar?week_start=not-a-date").status_code == 422


def test_second_activate_deactivates_first(auth_client):
    a = auth_client.post("/api/plans", json={"name": "A", "slots": []}).json()
    b = auth_client.post("/api/plans", json={"name": "B", "slots": []}).json()
    assert auth_client.post(f"/api/plans/{a['id']}/activate").json()["is_active"] is True
    assert auth_client.post(f"/api/plans/{b['id']}/activate").status_code == 200
    active = [p for p in auth_client.get("/api/plans").json() if p["is_active"]]
    assert [p["id"] for p in active] == [b["id"]]

    assert auth_client.post(f"/api/plans/{b['id']}/activate").status_code == 200
    active = [p for p in auth_client.get("/api/plans").json() if p["is_active"]]
    assert [p["id"] for p in active] == [b["id"]]


def test_create_active_plan_deactivates_existing(auth_client):
    a = auth_client.post(
        "/api/plans", json={"name": "A", "slots": [], "is_active": True}
    ).json()
    assert a["is_active"] is True
    b = auth_client.post(
        "/api/plans", json={"name": "B", "slots": [], "is_active": True}
    ).json()
    assert b["is_active"] is True
    listed = {p["name"]: p["is_active"] for p in auth_client.get("/api/plans").json()}
    assert listed == {"A": False, "B": True}


def test_duplicate_plan_name_conflicts_409(auth_client):
    assert (
        auth_client.post("/api/plans", json={"name": "Push Pull", "slots": []}).status_code
        == 201
    )
    duplicate = auth_client.post("/api/plans", json={"name": "push pull", "slots": []})
    assert duplicate.status_code == 409

    second = auth_client.post("/api/plans", json={"name": "Legs", "slots": []}).json()
    renamed = auth_client.patch(f"/api/plans/{second['id']}", json={"name": "PUSH PULL"})
    assert renamed.status_code == 409
    assert auth_client.get(f"/api/plans/{second['id']}").json()["name"] == "Legs"


def test_flush_integrity_errors_map_to_409(auth_client, monkeypatch):
    assert (
        auth_client.post("/api/plans", json={"name": "Push Pull", "slots": []}).status_code
        == 201
    )
    second = auth_client.post("/api/plans", json={"name": "Legs", "slots": []}).json()

    monkeypatch.setattr("app.routers.plans._find_by_name", lambda *args: None)
    duplicate = auth_client.post("/api/plans", json={"name": "Push Pull", "slots": []})
    assert duplicate.status_code == 409
    renamed = auth_client.patch(f"/api/plans/{second['id']}", json={"name": "PUSH PULL"})
    assert renamed.status_code == 409


def test_patch_replaces_slots_and_rejects_is_active(auth_client, exercise):
    upper = _create_template(auth_client, exercise, "Upper A")
    lower = _create_template(auth_client, exercise, "Lower A")
    plan = auth_client.post(
        "/api/plans",
        json={
            "name": "P",
            "slots": [
                {"day_of_week": 0, "template_id": upper["id"]},
                {"day_of_week": 3, "template_id": None},
            ],
        },
    ).json()

    patched = auth_client.patch(
        f"/api/plans/{plan['id']}",
        json={"slots": [{"day_of_week": 2, "template_id": lower["id"]}]},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert [(s["day_of_week"], s["template_name"]) for s in body["slots"]] == [(2, "Lower A")]

    assert (
        auth_client.patch(f"/api/plans/{plan['id']}", json={"is_active": True}).status_code
        == 422
    )
    assert (
        auth_client.patch(f"/api/plans/{plan['id']}", json={"name": None}).status_code == 422
    )
    assert (
        auth_client.patch(f"/api/plans/{plan['id']}", json={"slots": None}).status_code == 422
    )
    duplicate_days = auth_client.patch(
        f"/api/plans/{plan['id']}",
        json={
            "slots": [
                {"day_of_week": 1, "template_id": None},
                {"day_of_week": 1, "template_id": upper["id"]},
            ]
        },
    )
    assert duplicate_days.status_code == 422
    out_of_range = auth_client.post(
        "/api/plans", json={"name": "Bad", "slots": [{"day_of_week": 7, "template_id": None}]}
    )
    assert out_of_range.status_code == 422

    renamed = auth_client.patch(f"/api/plans/{plan['id']}", json={"name": "Renamed"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"
    assert renamed.json()["slots"] == patched.json()["slots"]


def test_missing_and_foreign_plan_and_template_404(auth_client, db, exercise):
    missing = str(uuid.uuid4())
    assert auth_client.get(f"/api/plans/{missing}").status_code == 404
    assert auth_client.patch(f"/api/plans/{missing}", json={"name": "X"}).status_code == 404
    assert auth_client.delete(f"/api/plans/{missing}").status_code == 404
    assert auth_client.post(f"/api/plans/{missing}/activate").status_code == 404

    other = User(
        id=uuid.uuid4(), username="other", password_hash="x",
        unit_system="metric", timezone="UTC",
    )
    db.add(other)
    db.flush()
    foreign_plan = WeeklyPlan(
        id=uuid.uuid4(), user_id=other.id, name="Other", name_lower="other"
    )
    foreign_template = WorkoutTemplate(
        id=uuid.uuid4(), user_id=other.id, name="Other T", name_lower="other t"
    )
    db.add_all([foreign_plan, foreign_template])
    db.commit()

    foreign_plan_id = str(foreign_plan.id)
    assert auth_client.get(f"/api/plans/{foreign_plan_id}").status_code == 404
    assert auth_client.patch(
        f"/api/plans/{foreign_plan_id}", json={"name": "X"}
    ).status_code == 404
    assert auth_client.delete(f"/api/plans/{foreign_plan_id}").status_code == 404
    assert auth_client.post(f"/api/plans/{foreign_plan_id}/activate").status_code == 404

    foreign_slot = auth_client.post(
        "/api/plans",
        json={"name": "P", "slots": [{"day_of_week": 0, "template_id": str(foreign_template.id)}]},
    )
    assert foreign_slot.status_code == 404
    owned = auth_client.post("/api/plans", json={"name": "P", "slots": []}).json()
    patched = auth_client.patch(
        f"/api/plans/{owned['id']}",
        json={"slots": [{"day_of_week": 0, "template_id": str(foreign_template.id)}]},
    )
    assert patched.status_code == 404


def test_delete_active_plan_leaves_no_active_plan(auth_client):
    plan = auth_client.post("/api/plans", json={"name": "P", "slots": []}).json()
    auth_client.post(f"/api/plans/{plan['id']}/activate")

    assert auth_client.delete(f"/api/plans/{plan['id']}").status_code == 204
    assert auth_client.get(f"/api/plans/{plan['id']}").status_code == 404

    cal = auth_client.get(f"/api/calendar?week_start={MONDAY}").json()
    assert cal["plan"] is None
    assert all(day["template_name"] is None for day in cal["days"])
    assert cal["adherence"] == {"planned_days": 0, "completed_days": 0}


def test_calendar_without_active_plan_is_all_rest(auth_client):
    cal = auth_client.get(f"/api/calendar?week_start={MONDAY}").json()
    assert cal["plan"] is None
    assert len(cal["days"]) == 7
    assert [day["template_id"] for day in cal["days"]] == [None] * 7
    assert [day["completed"] for day in cal["days"]] == [False] * 7
    assert [day["workout_ids"] for day in cal["days"]] == [[] for _ in range(7)]
    assert cal["adherence"] == {"planned_days": 0, "completed_days": 0}


def test_deleting_template_makes_day_rest(auth_client, db, exercise):
    template = _create_template(auth_client, exercise)
    plan = auth_client.post(
        "/api/plans",
        json={"name": "P", "slots": [{"day_of_week": 0, "template_id": template["id"]}]},
    ).json()
    auth_client.post(f"/api/plans/{plan['id']}/activate")

    assert auth_client.delete(f"/api/templates/{template['id']}").status_code == 204

    persisted = db.scalar(
        select(WeeklyPlanSlot.template_id).where(
            WeeklyPlanSlot.plan_id == uuid.UUID(plan["id"])
        )
    )
    assert persisted is None

    body = auth_client.get(f"/api/plans/{plan['id']}").json()
    assert body["slots"][0]["template_id"] is None
    assert body["slots"][0]["template_name"] is None

    cal = auth_client.get(f"/api/calendar?week_start={MONDAY}").json()
    assert cal["days"][0]["template_name"] is None
    assert cal["adherence"]["planned_days"] == 0


def test_calendar_completion_by_local_date(auth_client, exercise):
    template = _create_template(auth_client, exercise)
    plan = auth_client.post(
        "/api/plans",
        json={
            "name": "P",
            "slots": [
                {"day_of_week": 0, "template_id": template["id"]},
                {"day_of_week": 2, "template_id": template["id"]},
                {"day_of_week": 4, "template_id": None},
            ],
        },
    ).json()
    auth_client.post(f"/api/plans/{plan['id']}/activate")

    first = _create_workout(auth_client, "2026-09-14T06:30:00Z")
    second = _create_workout(auth_client, "2026-09-14T18:00:00Z")
    _create_workout(auth_client, "2026-09-16T10:00:00Z")
    _create_workout(auth_client, "2026-09-21T10:00:00Z")  # next week, exclusive end

    cal = auth_client.get(f"/api/calendar?week_start={MONDAY}").json()
    assert set(cal["days"][0]["workout_ids"]) == {first["id"], second["id"]}
    assert cal["days"][0]["completed"] is True
    assert cal["days"][2]["completed"] is True
    assert cal["days"][1]["completed"] is False
    assert cal["days"][4]["completed"] is False  # rest day
    assert cal["adherence"] == {"planned_days": 2, "completed_days": 2}


def test_calendar_uses_user_timezone(auth_client, db, user, exercise):
    user.timezone = "Pacific/Kiritimati"  # UTC+14, no DST
    db.commit()

    template = _create_template(auth_client, exercise)
    plan = auth_client.post(
        "/api/plans",
        json={"name": "P", "slots": [{"day_of_week": 0, "template_id": template["id"]}]},
    ).json()
    auth_client.post(f"/api/plans/{plan['id']}/activate")

    # 2026-09-13T20:00:00Z is Monday 2026-09-14 10:00 local in UTC+14.
    workout = _create_workout(auth_client, "2026-09-13T20:00:00Z")

    cal = auth_client.get(f"/api/calendar?week_start={MONDAY}").json()
    assert cal["week_start"] == "2026-09-13T10:00:00Z"
    assert cal["week_end"] == "2026-09-20T10:00:00Z"
    assert cal["days"][0]["date"] == "2026-09-14"
    assert cal["days"][0]["completed"] is True
    assert cal["days"][0]["workout_ids"] == [workout["id"]]
    assert cal["adherence"]["completed_days"] == 1


def test_calendar_defaults_to_current_local_week_monday(auth_client, user):
    today_local = datetime.now(UTC).astimezone(ZoneInfo(user.timezone)).date()
    expected_monday = today_local - timedelta(days=today_local.weekday())
    cal = auth_client.get("/api/calendar").json()
    assert cal["week_start"] == f"{expected_monday.isoformat()}T00:00:00Z"
    assert cal["week_end"] == (
        datetime.combine(expected_monday, datetime.min.time(), tzinfo=UTC) + timedelta(days=7)
    ).strftime("%Y-%m-%dT00:00:00Z")
