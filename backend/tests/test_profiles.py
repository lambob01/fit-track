import uuid

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import (
    CardioActivity,
    Exercise,
    SetEntry,
    User,
    WeightEntry,
    Workout,
    WorkoutExercise,
)
from app.security import hash_password

TEST_PASSWORD = "hunter2"


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


def _profiles_by_id(client):
    return {profile["id"]: profile for profile in client.get("/api/profiles").json()}


def _add_workout(client):
    exercise = client.post(
        "/api/exercises", json={"name": "Squat", "category": "legs"}
    ).json()
    response = client.post(
        "/api/workouts",
        json={
            "performed_at": "2026-09-10T18:00:00Z",
            "name": "Leg Day",
            "exercises": [
                {
                    "exercise_id": exercise["id"],
                    "position": 0,
                    "sets": [{"set_number": 1, "weight_kg": 100.0, "reps": 5}],
                }
            ],
        },
    )
    assert response.status_code == 201
    return response.json(), exercise


def test_create_profile_returns_requested_name(auth_client):
    body = _create_profile(auth_client, "Partner")
    assert body["username"] == "Partner"
    assert body["is_active"] is False
    assert body["is_login_account"] is False
    assert body["has_data"] is False
    assert uuid.UUID(body["id"])


def test_create_profile_duplicate_name_conflicts(auth_client, user):
    _create_profile(auth_client, "Partner")
    assert auth_client.post("/api/profiles", json={"name": "Partner"}).status_code == 409
    assert auth_client.post("/api/profiles", json={"name": user.username}).status_code == 409


def test_list_profiles_flags_login_and_active(auth_client, user):
    created = _create_profile(auth_client, "Partner")
    profiles = _profiles_by_id(auth_client)
    assert profiles[str(user.id)]["is_login_account"] is True
    assert profiles[str(user.id)]["is_active"] is True
    assert profiles[created["id"]]["is_login_account"] is False
    assert profiles[created["id"]]["is_active"] is False


def test_has_data_tracks_new_data(auth_client, user):
    created = _create_profile(auth_client, "Partner")
    _switch(auth_client, created["id"])
    assert _profiles_by_id(auth_client)[created["id"]]["has_data"] is False

    _add_workout(auth_client)

    profiles = _profiles_by_id(auth_client)
    assert profiles[created["id"]]["has_data"] is True
    assert profiles[str(user.id)]["has_data"] is False


def test_switch_routes_new_writes_to_target_profile(auth_client, user):
    created = _create_profile(auth_client, "Partner")
    _switch(auth_client, created["id"])
    response = auth_client.post(
        "/api/weight/entries",
        json={"measured_at": "2026-09-10T06:00:00Z", "weight_kg": 80.0},
    )
    assert response.status_code == 201
    assert len(auth_client.get("/api/weight/entries").json()) == 1

    _switch(auth_client, str(user.id))
    assert auth_client.get("/api/weight/entries").json() == []


def test_switch_unknown_profile_404(auth_client):
    assert auth_client.post(f"/api/profiles/{uuid.uuid4()}/switch").status_code == 404


def test_delete_login_profile_conflicts(auth_client, user, env_password):
    response = auth_client.request(
        "DELETE", f"/api/profiles/{user.id}", json={"password": TEST_PASSWORD}
    )
    assert response.status_code == 409


def test_delete_active_profile_conflicts(auth_client, env_password):
    created = _create_profile(auth_client, "Partner")
    _switch(auth_client, created["id"])
    response = auth_client.request(
        "DELETE", f"/api/profiles/{created['id']}", json={"password": TEST_PASSWORD}
    )
    assert response.status_code == 409


def test_delete_last_remaining_profile_conflicts(auth_client, user, env_password):
    assert len(_profiles_by_id(auth_client)) == 1
    response = auth_client.request(
        "DELETE", f"/api/profiles/{user.id}", json={"password": TEST_PASSWORD}
    )
    assert response.status_code == 409


def test_delete_other_profile_requires_password_and_removes_data(
    auth_client, db, user, env_password
):
    created = _create_profile(auth_client, "Doomed")
    doomed_id = uuid.UUID(created["id"])
    _switch(auth_client, created["id"])
    workout, exercise = _add_workout(auth_client)
    auth_client.post(
        "/api/weight/entries",
        json={"measured_at": "2026-09-10T06:00:00Z", "weight_kg": 80.0},
    )
    auth_client.post(
        "/api/cardio",
        json={
            "performed_at": "2026-09-10T07:00:00Z",
            "type": "run",
            "distance_m": 5000.0,
            "duration_s": 1800,
        },
    )
    auth_client.post(
        "/api/templates",
        json={
            "name": "Legs",
            "exercises": [{"exercise_id": exercise["id"], "position": 0}],
        },
    )
    _switch(auth_client, str(user.id))

    wrong = auth_client.request(
        "DELETE", f"/api/profiles/{doomed_id}", json={"password": "wrong-password"}
    )
    assert wrong.status_code == 403
    assert created["id"] in _profiles_by_id(auth_client)

    deleted = auth_client.request(
        "DELETE", f"/api/profiles/{doomed_id}", json={"password": TEST_PASSWORD}
    )
    assert deleted.status_code == 204
    assert created["id"] not in _profiles_by_id(auth_client)

    workout_exercise_ids = [item["id"] for item in workout["exercises"]]
    set_ids = [
        entry["id"] for item in workout["exercises"] for entry in item["sets"]
    ]
    db.expire_all()
    assert db.get(User, doomed_id) is None
    assert db.get(Exercise, uuid.UUID(exercise["id"])) is None
    assert db.scalar(select(Workout.id).where(Workout.user_id == doomed_id)) is None
    assert db.get(WorkoutExercise, uuid.UUID(workout_exercise_ids[0])) is None
    assert db.get(SetEntry, uuid.UUID(set_ids[0])) is None
    assert (
        db.scalar(select(WeightEntry.id).where(WeightEntry.user_id == doomed_id)) is None
    )
    assert (
        db.scalar(select(CardioActivity.id).where(CardioActivity.user_id == doomed_id))
        is None
    )


def test_demo_seed_is_idempotent(auth_client):
    first = auth_client.post("/api/data/demo")
    assert first.status_code == 200
    body = first.json()
    assert body["exercises"] > 0
    assert body["workouts"] > 0
    assert body["cardio_activities"] > 0
    assert body["weight_entries"] > 0

    second = auth_client.post("/api/data/demo")
    assert second.status_code == 200
    assert second.json() == {
        "exercises": 0,
        "workouts": 0,
        "cardio_activities": 0,
        "weight_entries": 0,
    }


def test_demo_seed_targets_active_profile(auth_client, user):
    created = _create_profile(auth_client, "Guest")
    _switch(auth_client, created["id"])
    assert auth_client.post("/api/data/demo").status_code == 200

    profiles = _profiles_by_id(auth_client)
    assert profiles[created["id"]]["has_data"] is True
    assert profiles[str(user.id)]["has_data"] is False


def test_profiles_and_demo_require_auth(client):
    assert client.get("/api/profiles").status_code == 401
    assert client.post("/api/profiles", json={"name": "Partner"}).status_code == 401
    assert client.post(f"/api/profiles/{uuid.uuid4()}/switch").status_code == 401
    assert (
        client.request(
            "DELETE",
            f"/api/profiles/{uuid.uuid4()}",
            json={"password": TEST_PASSWORD},
        ).status_code
        == 401
    )
    assert client.post("/api/data/demo").status_code == 401
