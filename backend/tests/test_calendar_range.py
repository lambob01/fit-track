import uuid
from datetime import UTC, datetime

from app.models import User, WeeklyPlan, WeeklyPlanSlot, Workout, WorkoutTemplate

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


def _activate_plan(auth_client, slots, name="P"):
    plan = auth_client.post("/api/plans", json={"name": name, "slots": slots}).json()
    assert auth_client.post(f"/api/plans/{plan['id']}/activate").status_code == 200
    return plan


def test_calendar_range_validation(auth_client):
    assert auth_client.get("/api/calendar?from=2026-09-14").status_code == 422
    assert auth_client.get("/api/calendar?to=2026-09-20").status_code == 422
    assert (
        auth_client.get("/api/calendar?from=2026-09-20&to=2026-09-14").status_code == 422
    )
    assert (
        auth_client.get(
            "/api/calendar?week_start=2026-09-14&from=2026-09-14&to=2026-09-20"
        ).status_code
        == 422
    )
    assert (
        auth_client.get("/api/calendar?week_start=2026-09-14&from=2026-09-14").status_code
        == 422
    )
    assert auth_client.get("/api/calendar?from=2026-09-14&to=2026-09-14").status_code == 200
    # 62 dates inclusive ((to - from).days == 61) is allowed; one more is not.
    assert (
        auth_client.get("/api/calendar?from=2026-09-14&to=2026-11-14").status_code == 200
    )
    assert (
        auth_client.get("/api/calendar?from=2026-09-14&to=2026-11-15").status_code == 422
    )


def test_calendar_range_fields(auth_client, exercise):
    template = _create_template(auth_client, exercise)
    plan = _activate_plan(
        auth_client,
        [
            {"day_of_week": 0, "template_id": template["id"]},
            {"day_of_week": 2, "template_id": template["id"]},
            {"day_of_week": 4, "template_id": None},
        ],
    )
    _create_workout(auth_client, "2026-09-14T06:30:00Z")
    _create_workout(auth_client, "2026-09-16T10:00:00Z")

    cal = auth_client.get("/api/calendar?from=2026-09-14&to=2026-09-20").json()
    assert cal["week_start"] == "2026-09-14T00:00:00Z"
    assert cal["week_end"] == "2026-09-21T00:00:00Z"
    assert cal["plan"] == {"id": plan["id"], "name": "P"}
    assert len(cal["days"]) == 7
    assert [day["date"] for day in cal["days"]] == [
        f"2026-09-{14 + offset:02d}" for offset in range(7)
    ]
    assert [day["day_of_week"] for day in cal["days"]] == list(range(7))
    assert cal["days"][0]["template_name"] == "Upper A"
    assert cal["days"][1]["template_name"] is None
    assert cal["days"][4]["template_name"] is None
    assert [day["completed"] for day in cal["days"]] == [
        True, False, True, False, False, False, False
    ]
    assert cal["adherence"] == {"planned_days": 2, "completed_days": 2}
    assert cal["weeks"] == [
        {
            "week_start": "2026-09-14T00:00:00Z",
            "week_end": "2026-09-21T00:00:00Z",
            "planned_days": 2,
            "completed_days": 2,
        }
    ]


def test_calendar_range_three_weeks(auth_client, exercise):
    template = _create_template(auth_client, exercise)
    _activate_plan(
        auth_client,
        [
            {"day_of_week": 0, "template_id": template["id"]},
            {"day_of_week": 2, "template_id": template["id"]},
        ],
    )
    _create_workout(auth_client, "2026-09-14T08:00:00Z")
    _create_workout(auth_client, "2026-09-16T08:00:00Z")
    _create_workout(auth_client, "2026-09-21T08:00:00Z")

    cal = auth_client.get("/api/calendar?from=2026-09-14&to=2026-10-04").json()
    assert len(cal["days"]) == 21
    assert cal["week_start"] == "2026-09-14T00:00:00Z"
    assert cal["week_end"] == "2026-10-05T00:00:00Z"
    assert cal["adherence"] == {"planned_days": 6, "completed_days": 3}
    assert cal["weeks"] == [
        {
            "week_start": "2026-09-14T00:00:00Z",
            "week_end": "2026-09-21T00:00:00Z",
            "planned_days": 2,
            "completed_days": 2,
        },
        {
            "week_start": "2026-09-21T00:00:00Z",
            "week_end": "2026-09-28T00:00:00Z",
            "planned_days": 2,
            "completed_days": 1,
        },
        {
            "week_start": "2026-09-28T00:00:00Z",
            "week_end": "2026-10-05T00:00:00Z",
            "planned_days": 2,
            "completed_days": 0,
        },
    ]


def test_calendar_range_weeks_clipped_to_range(auth_client, exercise):
    template = _create_template(auth_client, exercise)
    _activate_plan(
        auth_client,
        [
            {"day_of_week": 0, "template_id": template["id"]},
            {"day_of_week": 2, "template_id": template["id"]},
            {"day_of_week": 4, "template_id": template["id"]},
        ],
    )
    _create_workout(auth_client, "2026-09-16T07:00:00Z")

    cal = auth_client.get("/api/calendar?from=2026-09-16&to=2026-09-18").json()
    assert [day["date"] for day in cal["days"]] == [
        "2026-09-16", "2026-09-17", "2026-09-18"
    ]
    assert cal["week_start"] == "2026-09-16T00:00:00Z"
    assert cal["week_end"] == "2026-09-19T00:00:00Z"
    # Monday is planned but outside [from, to], so the clipped week counts Wed + Fri.
    assert cal["adherence"] == {"planned_days": 2, "completed_days": 1}
    assert cal["weeks"] == [
        {
            "week_start": "2026-09-14T00:00:00Z",
            "week_end": "2026-09-21T00:00:00Z",
            "planned_days": 2,
            "completed_days": 1,
        }
    ]


def test_calendar_range_crosses_dst(auth_client, db, user, exercise):
    user.timezone = "America/New_York"
    db.commit()
    template = _create_template(auth_client, exercise)
    _activate_plan(
        auth_client, [{"day_of_week": 0, "template_id": template["id"]}]
    )
    # 2026-11-02T04:30Z is 2026-11-01 23:30 EST; 05:30Z is 2026-11-02 00:30 EST.
    sunday = _create_workout(auth_client, "2026-11-02T04:30:00Z")
    monday = _create_workout(auth_client, "2026-11-02T05:30:00Z")

    cal = auth_client.get("/api/calendar?from=2026-10-30&to=2026-11-02").json()
    assert cal["week_start"] == "2026-10-30T04:00:00Z"  # EDT midnight
    assert cal["week_end"] == "2026-11-03T05:00:00Z"  # EST midnight
    assert [day["date"] for day in cal["days"]] == [
        "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"
    ]
    assert cal["days"][2]["completed"] is True
    assert cal["days"][2]["workout_ids"] == [sunday["id"]]
    assert cal["days"][3]["completed"] is True
    assert cal["days"][3]["workout_ids"] == [monday["id"]]
    assert cal["adherence"] == {"planned_days": 1, "completed_days": 1}
    assert cal["weeks"][0] == {
        "week_start": "2026-10-26T04:00:00Z",
        "week_end": "2026-11-02T05:00:00Z",
        "planned_days": 0,
        "completed_days": 0,
    }
    assert cal["weeks"][1] == {
        "week_start": "2026-11-02T05:00:00Z",
        "week_end": "2026-11-09T05:00:00Z",
        "planned_days": 1,
        "completed_days": 1,
    }


def test_calendar_range_isolates_users(auth_client, db, user, exercise):
    template = _create_template(auth_client, exercise, "Mine")
    plan = _activate_plan(
        auth_client, [{"day_of_week": 0, "template_id": template["id"]}]
    )

    other = User(
        id=uuid.uuid4(),
        username="other",
        password_hash="x",
        unit_system="metric",
        timezone="UTC",
    )
    db.add(other)
    db.flush()
    foreign_template = WorkoutTemplate(
        id=uuid.uuid4(), user_id=other.id, name="Foreign", name_lower="foreign"
    )
    foreign_plan = WeeklyPlan(
        id=uuid.uuid4(),
        user_id=other.id,
        name="Other",
        name_lower="other",
        is_active=True,
    )
    db.add_all([foreign_template, foreign_plan])
    db.flush()
    db.add(
        WeeklyPlanSlot(
            id=uuid.uuid4(),
            plan_id=foreign_plan.id,
            day_of_week=0,
            template_id=foreign_template.id,
        )
    )
    foreign_workout = Workout(
        id=uuid.uuid4(),
        user_id=other.id,
        performed_at=datetime(2026, 9, 14, 12, 0, tzinfo=UTC),
    )
    db.add(foreign_workout)
    db.commit()
    foreign_workout_id = str(foreign_workout.id)

    cal = auth_client.get("/api/calendar?from=2026-09-14&to=2026-09-20").json()
    assert cal["plan"] == {"id": plan["id"], "name": "P"}
    assert cal["days"][0]["template_name"] == "Mine"
    assert cal["days"][0]["completed"] is False
    assert cal["adherence"] == {"planned_days": 1, "completed_days": 0}
    assert foreign_workout_id not in {
        workout_id for day in cal["days"] for workout_id in day["workout_ids"]
    }
    assert all(day["template_name"] != "Foreign" for day in cal["days"])


def test_calendar_week_mode_unchanged_and_weeks_null(auth_client, exercise):
    template = _create_template(auth_client, exercise)
    plan = _activate_plan(
        auth_client, [{"day_of_week": 0, "template_id": template["id"]}]
    )
    _create_workout(auth_client, "2026-09-14T06:30:00Z")

    cal = auth_client.get(f"/api/calendar?week_start={MONDAY}").json()
    assert cal["week_start"] == "2026-09-14T00:00:00Z"
    assert cal["week_end"] == "2026-09-21T00:00:00Z"
    assert cal["plan"] == {"id": plan["id"], "name": "P"}
    assert len(cal["days"]) == 7
    assert cal["days"][0]["template_name"] == "Upper A"
    assert cal["days"][0]["completed"] is True
    assert cal["adherence"] == {"planned_days": 1, "completed_days": 1}
    assert "weeks" in cal
    assert cal["weeks"] is None

    assert auth_client.get("/api/calendar").json()["weeks"] is None
