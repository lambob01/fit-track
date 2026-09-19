import uuid
from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import (
    BodyMeasurement,
    CardioActivity,
    CardioSplit,
    Exercise,
    SetEntry,
    User,
    WeeklyPlan,
    WeeklyPlanSlot,
    WeightEntry,
    Workout,
    WorkoutExercise,
)
from app.security import hash_password

TEST_PASSWORD = "hunter2"

ENTITIES = (
    "weight_entries",
    "workouts",
    "cardio_activities",
    "sets",
    "plans",
    "measurements",
)

SIMPLE_MODELS = {
    "weight_entries": WeightEntry,
    "measurements": BodyMeasurement,
    "workouts": Workout,
    "cardio_activities": CardioActivity,
    "plans": WeeklyPlan,
}

EXPECTED_COUNTS = {
    "weight_entries": 1,
    "workouts": 1,
    "cardio_activities": 1,
    "sets": 2,
    "plans": 1,
    "measurements": 1,
}


@pytest.fixture()
def env_password(monkeypatch):
    monkeypatch.setattr(settings, "app_password_hash", hash_password(TEST_PASSWORD))
    return TEST_PASSWORD


def _create_profile(client, name):
    response = client.post("/api/profiles", json={"name": name})
    assert response.status_code == 201
    return response.json()


def _switch(client, profile_id):
    assert client.post(f"/api/profiles/{profile_id}/switch").status_code == 204


def _create_exercise(client, name):
    response = client.post("/api/exercises", json={"name": name, "category": "legs"})
    assert response.status_code == 201
    return response.json()


def _create_template(client, exercise_id, name="Upper A"):
    response = client.post(
        "/api/templates",
        json={
            "name": name,
            "exercises": [{"exercise_id": exercise_id, "position": 0, "target_sets": 1}],
        },
    )
    assert response.status_code == 201
    return response.json()


def _add_weight(client, measured_at, weight_kg=80.0):
    response = client.post(
        "/api/weight/entries", json={"measured_at": measured_at, "weight_kg": weight_kg}
    )
    assert response.status_code == 201
    return response.json()


def _add_workout(client, exercise_id, performed_at, set_count=2):
    response = client.post(
        "/api/workouts",
        json={
            "performed_at": performed_at,
            "name": "Session",
            "exercises": [
                {
                    "exercise_id": exercise_id,
                    "position": 0,
                    "sets": [
                        {"set_number": index + 1, "weight_kg": 100.0, "reps": 5}
                        for index in range(set_count)
                    ],
                }
            ],
        },
    )
    assert response.status_code == 201
    return response.json()


def _add_cardio(client, performed_at):
    response = client.post(
        "/api/cardio",
        json={
            "performed_at": performed_at,
            "type": "run",
            "distance_m": 5000.0,
            "duration_s": 1800,
        },
    )
    assert response.status_code == 201
    return response.json()


def _add_measurement(db, user_id, measured_at):
    row = BodyMeasurement(
        user_id=user_id, measured_at=measured_at, site="waist", value_cm=90.0
    )
    db.add(row)
    db.commit()
    return row


def _add_split(db, cardio_activity_id, split_number=1):
    row = CardioSplit(
        cardio_activity_id=uuid.UUID(cardio_activity_id)
        if isinstance(cardio_activity_id, str)
        else cardio_activity_id,
        split_number=split_number,
        distance_m=1000.0,
        duration_s=300,
    )
    db.add(row)
    db.commit()
    return row


def _create_plan(client, name, template_id=None, active=False):
    slots = (
        [{"day_of_week": 0, "template_id": template_id}] if template_id is not None else []
    )
    response = client.post(
        "/api/plans", json={"name": name, "is_active": active, "slots": slots}
    )
    assert response.status_code == 201
    return response.json()


def _add_plan_row(db, user_id, name, created_at, with_slot=True):
    plan = WeeklyPlan(
        id=uuid.uuid4(),
        user_id=user_id,
        name=name,
        name_lower=name.lower(),
        created_at=created_at,
    )
    db.add(plan)
    if with_slot:
        db.add(WeeklyPlanSlot(plan_id=plan.id, day_of_week=0))
    db.commit()
    return plan


def _seed_entity(db, client, profile_id, exercise, entity):
    if entity == "weight_entries":
        _add_weight(client, "2026-09-10T06:00:00Z")
    elif entity == "measurements":
        _add_measurement(db, profile_id, datetime(2026, 9, 10, 6, 0))
    elif entity in ("workouts", "sets"):
        _add_workout(client, exercise["id"], "2026-09-10T17:00:00Z", set_count=2)
    elif entity == "cardio_activities":
        _add_cardio(client, "2026-09-10T07:00:00Z")
    elif entity == "plans":
        _create_plan(client, f"Plan {uuid.uuid4().hex[:8]}")
    else:  # pragma: no cover - guarded by the parametrize list
        raise AssertionError(f"unknown entity {entity}")


def _rows_for_user(db, entity, user_id):
    if entity == "sets":
        return list(
            db.scalars(
                select(SetEntry)
                .join(WorkoutExercise, SetEntry.workout_exercise_id == WorkoutExercise.id)
                .join(Workout, WorkoutExercise.workout_id == Workout.id)
                .where(Workout.user_id == user_id)
            )
        )
    model = SIMPLE_MODELS[entity]
    return list(db.scalars(select(model).where(model.user_id == user_id)))


def test_delete_endpoints_require_auth(client):
    assert client.delete("/api/data/weight_entries").status_code == 401
    assert client.delete("/api/data/sets").status_code == 401
    assert client.delete("/api/data/all").status_code in (401, 403)
    assert (
        client.request("DELETE", "/api/data/all", json={"password": "x"}).status_code
        == 401
    )


def test_unknown_entity_returns_404(auth_client):
    response = auth_client.delete("/api/data/not-a-category")
    assert response.status_code == 404


@pytest.mark.parametrize("entity", ENTITIES)
def test_category_delete_only_touches_active_profile(
    auth_client, db, user, exercise, entity
):
    other = _create_profile(auth_client, f"Other {entity}")
    other_id = uuid.UUID(other["id"])

    _seed_entity(db, auth_client, user.id, exercise, entity)

    _switch(auth_client, other["id"])
    other_exercise = _create_exercise(auth_client, f"{entity} press")
    _seed_entity(db, auth_client, other_id, other_exercise, entity)
    _switch(auth_client, str(user.id))

    response = auth_client.delete(f"/api/data/{entity}")
    assert response.status_code == 200
    assert response.json() == {"deleted": {entity: EXPECTED_COUNTS[entity]}}

    db.expire_all()
    assert _rows_for_user(db, entity, user.id) == []
    assert len(_rows_for_user(db, entity, other_id)) == EXPECTED_COUNTS[entity]


@pytest.mark.parametrize("entity", ENTITIES)
def test_one_sided_range_is_422(auth_client, entity):
    only_from = auth_client.delete(
        f"/api/data/{entity}", params={"from": "2026-09-01T00:00:00Z"}
    )
    only_to = auth_client.delete(
        f"/api/data/{entity}", params={"to": "2026-09-01T00:00:00Z"}
    )
    assert only_from.status_code == 422
    assert only_to.status_code == 422


def test_range_requires_utc_instants(auth_client):
    response = auth_client.delete(
        "/api/data/weight_entries",
        params={"from": "2026-09-01", "to": "2026-09-02"},
    )
    assert response.status_code == 422


def test_range_delete_weight_entries_is_half_open(auth_client):
    before = _add_weight(auth_client, "2026-09-10T00:00:00Z")
    inside = _add_weight(auth_client, "2026-09-11T12:00:00Z")
    at_end = _add_weight(auth_client, "2026-09-12T00:00:00Z")

    response = auth_client.delete(
        "/api/data/weight_entries",
        params={"from": "2026-09-11T00:00:00Z", "to": "2026-09-12T00:00:00Z"},
    )
    assert response.status_code == 200
    assert response.json() == {"deleted": {"weight_entries": 1}}

    remaining = auth_client.get("/api/weight/entries").json()
    assert {row["id"] for row in remaining} == {before["id"], at_end["id"]}
    assert inside["id"] not in {row["id"] for row in remaining}


def test_range_delete_sets_uses_parent_workout_performed_at(auth_client, exercise):
    early = _add_workout(auth_client, exercise["id"], "2026-09-01T10:00:00Z", set_count=2)
    late = _add_workout(auth_client, exercise["id"], "2026-09-15T10:00:00Z", set_count=1)

    response = auth_client.delete(
        "/api/data/sets",
        params={"from": "2026-09-14T00:00:00Z", "to": "2026-09-16T00:00:00Z"},
    )
    assert response.status_code == 200
    assert response.json() == {"deleted": {"sets": 1}}

    workouts = auth_client.get("/api/workouts").json()
    assert {row["id"] for row in workouts} == {early["id"], late["id"]}
    early_body = auth_client.get(f"/api/workouts/{early['id']}").json()
    late_body = auth_client.get(f"/api/workouts/{late['id']}").json()
    assert len(early_body["exercises"][0]["sets"]) == 2
    assert late_body["exercises"][0]["sets"] == []


def test_range_delete_cardio_activities_removes_splits(auth_client, db):
    in_range = _add_cardio(auth_client, "2026-09-10T07:00:00Z")
    out_of_range = _add_cardio(auth_client, "2026-09-20T07:00:00Z")
    _add_split(db, in_range["id"])
    _add_split(db, out_of_range["id"])

    response = auth_client.delete(
        "/api/data/cardio_activities",
        params={"from": "2026-09-07T00:00:00Z", "to": "2026-09-14T00:00:00Z"},
    )
    assert response.status_code == 200
    assert response.json() == {"deleted": {"cardio_activities": 1}}

    db.expire_all()
    assert [str(row.id) for row in db.scalars(select(CardioActivity))] == [
        out_of_range["id"]
    ]
    assert [str(row.cardio_activity_id) for row in db.scalars(select(CardioSplit))] == [
        out_of_range["id"]
    ]


def test_range_delete_plans_uses_created_at(auth_client, db, user):
    _add_plan_row(db, user.id, "Old", datetime(2026, 9, 1, 12, 0))
    recent = _add_plan_row(db, user.id, "Recent", datetime(2026, 9, 10, 12, 0))

    response = auth_client.delete(
        "/api/data/plans",
        params={"from": "2026-09-01T00:00:00Z", "to": "2026-09-02T00:00:00Z"},
    )
    assert response.status_code == 200
    assert response.json() == {"deleted": {"plans": 1}}

    db.expire_all()
    assert [plan.name for plan in db.scalars(select(WeeklyPlan))] == ["Recent"]
    slot = db.scalars(select(WeeklyPlanSlot)).one()
    assert slot.plan_id == recent.id


def test_delete_plans_clears_slots_and_calendar_keeps_templates(
    auth_client, db, exercise
):
    template = _create_template(auth_client, exercise["id"])
    _create_plan(auth_client, "Upper/Lower", template_id=template["id"], active=True)
    assert db.scalars(select(WeeklyPlanSlot)).all() != []

    response = auth_client.delete("/api/data/plans")
    assert response.status_code == 200
    assert response.json() == {"deleted": {"plans": 1}}

    db.expire_all()
    assert db.scalars(select(WeeklyPlan)).all() == []
    assert db.scalars(select(WeeklyPlanSlot)).all() == []

    assert auth_client.get("/api/plans").json() == []
    assert len(auth_client.get("/api/templates").json()) == 1
    calendar = auth_client.get("/api/calendar").json()
    assert calendar["plan"] is None


def test_delete_workouts_cascades_children_and_keeps_exercises(auth_client, db, exercise):
    _add_workout(auth_client, exercise["id"], "2026-09-10T17:00:00Z", set_count=3)

    response = auth_client.delete("/api/data/workouts")
    assert response.status_code == 200
    assert response.json() == {"deleted": {"workouts": 1}}

    db.expire_all()
    assert db.scalars(select(Workout)).all() == []
    assert db.scalars(select(WorkoutExercise)).all() == []
    assert db.scalars(select(SetEntry)).all() == []
    assert db.get(Exercise, uuid.UUID(exercise["id"])) is not None


def test_delete_all_wrong_password_403_keeps_data(auth_client, env_password, exercise):
    _add_weight(auth_client, "2026-09-10T06:00:00Z")

    response = auth_client.request(
        "DELETE", "/api/data/all", json={"password": "not-the-password"}
    )
    assert response.status_code == 403
    assert len(auth_client.get("/api/weight/entries").json()) == 1


def test_delete_all_only_clears_active_profile(auth_client, db, user, env_password):
    other = _create_profile(auth_client, "Partner")
    other_id = uuid.UUID(other["id"])
    _switch(auth_client, other["id"])
    _add_weight(auth_client, "2026-09-10T06:00:00Z")
    _add_cardio(auth_client, "2026-09-10T07:00:00Z")
    _switch(auth_client, str(user.id))
    _add_weight(auth_client, "2026-09-11T06:00:00Z")

    response = auth_client.request(
        "DELETE", "/api/data/all", json={"password": TEST_PASSWORD}
    )
    assert response.status_code == 200
    assert response.json()["deleted"]["weight_entries"] == 1
    assert response.json()["deleted"]["cardio_activities"] == 0

    db.expire_all()
    assert _rows_for_user(db, "weight_entries", other_id) != []
    assert _rows_for_user(db, "cardio_activities", other_id) != []


def test_delete_all_clears_data_keeps_profile_and_settings(
    auth_client, db, user, env_password, exercise
):
    template = _create_template(auth_client, exercise["id"])
    _create_plan(auth_client, "Upper/Lower", template_id=template["id"], active=True)
    _add_workout(auth_client, exercise["id"], "2026-09-10T17:00:00Z", set_count=2)
    cardio = _add_cardio(auth_client, "2026-09-10T07:00:00Z")
    _add_split(db, cardio["id"])
    _add_split(db, cardio["id"], split_number=2)
    _add_weight(auth_client, "2026-09-10T06:00:00Z")
    _add_measurement(db, user.id, datetime(2026, 9, 10, 6, 0))
    user.goal_weight_kg = 75.0
    db.commit()

    response = auth_client.request(
        "DELETE", "/api/data/all", json={"password": TEST_PASSWORD}
    )
    assert response.status_code == 200

    db.expire_all()
    counts = response.json()["deleted"]
    assert counts["weight_entries"] == 1
    assert counts["measurements"] == 1
    assert counts["workouts"] == 1
    assert counts["sets"] == 2
    assert counts["cardio_activities"] == 1
    assert counts["cardio_splits"] == 2
    assert counts["plans"] == 1
    assert counts["weekly_plan_slots"] == 1

    assert db.scalars(select(WeightEntry)).all() == []
    assert db.scalars(select(BodyMeasurement)).all() == []
    assert db.scalars(select(Workout)).all() == []
    assert db.scalars(select(WorkoutExercise)).all() == []
    assert db.scalars(select(SetEntry)).all() == []
    assert db.scalars(select(CardioActivity)).all() == []
    assert db.scalars(select(CardioSplit)).all() == []
    assert db.scalars(select(WeeklyPlan)).all() == []
    assert db.scalars(select(WeeklyPlanSlot)).all() == []

    profile = db.get(User, user.id)
    assert profile is not None
    assert profile.goal_weight_kg == 75.0

    dashboard = auth_client.get("/api/dashboard").json()
    assert dashboard["latest_weight"] is None
    assert dashboard["last_workout"] is None
    assert dashboard["week_cardio"]["activity_count"] == 0
    assert dashboard["week_cardio"]["total_distance_m"] == 0

    calendar = auth_client.get("/api/calendar").json()
    assert calendar["plan"] is None

    profiles = {row["id"]: row for row in auth_client.get("/api/profiles").json()}
    assert profiles[str(user.id)]["has_data"] is False

    exported = auth_client.get("/api/export/json").json()
    assert exported["format"] == "tracker-export"
    assert exported["version"] == 1
    assert all(rows == [] for rows in exported["data"].values())


def test_seed_reset_clears_plans_and_splits(
    auth_client, db, engine, user, exercise, monkeypatch
):
    import app.seed.__main__ as seed_main

    template = _create_template(auth_client, exercise["id"])
    _create_plan(auth_client, "Upper/Lower", template_id=template["id"], active=True)
    cardio = _add_cardio(auth_client, "2026-09-10T07:00:00Z")
    _add_split(db, cardio["id"])

    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(seed_main, "SessionLocal", factory)
    seed_main.run(days=30, seed=42, reset=True)

    db.expire_all()
    assert db.scalars(select(WeeklyPlan)).all() == []
    assert db.scalars(select(WeeklyPlanSlot)).all() == []
    assert db.scalars(select(CardioSplit)).all() == []
    assert db.scalars(select(Workout)).all() != []  # reset reseeds fake data

    calendar = auth_client.get("/api/calendar").json()
    assert calendar["plan"] is None
