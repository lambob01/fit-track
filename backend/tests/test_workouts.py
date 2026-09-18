import uuid
from datetime import UTC, datetime

from app.models import User, Workout


def _payload(exercise_id, workout_id=None):
    return {
        "id": workout_id or str(uuid.uuid4()),
        "performed_at": "2026-09-18T17:30:00Z",
        "name": "Push Day A",
        "exercises": [
            {
                "id": str(uuid.uuid4()),
                "exercise_id": exercise_id,
                "position": 0,
                "sets": [
                    {"id": str(uuid.uuid4()), "weight_kg": 80.0, "reps": 5},
                    {"id": str(uuid.uuid4()), "weight_kg": 82.5, "reps": 3, "is_warmup": False},
                ],
            }
        ],
    }


def test_nested_create_and_get(auth_client, exercise):
    payload = _payload(exercise["id"])
    created = auth_client.post("/api/workouts", json=payload)
    assert created.status_code == 201
    body = created.json()
    assert body["exercises"][0]["sets"][1]["weight_kg"] == 82.5
    fetched = auth_client.get(f"/api/workouts/{payload['id']}")
    assert fetched.status_code == 200
    assert len(fetched.json()["exercises"][0]["sets"]) == 2


def test_workout_upsert_replay_is_idempotent(auth_client, exercise):
    payload = _payload(exercise["id"])
    first = auth_client.post("/api/workouts", json=payload)
    assert first.status_code == 201
    first_set_ids = [s["id"] for s in first.json()["exercises"][0]["sets"]]
    first_numbers = [s["set_number"] for s in first.json()["exercises"][0]["sets"]]
    assert first_numbers == [1, 2]

    replay = auth_client.post("/api/workouts", json=payload)
    assert replay.status_code == 200
    assert [s["id"] for s in replay.json()["exercises"][0]["sets"]] == first_set_ids
    assert [s["set_number"] for s in replay.json()["exercises"][0]["sets"]] == first_numbers

    listing = auth_client.get("/api/workouts").json()
    assert len(listing) == 1  # no duplicate workout from the retry


def test_workout_uuid_owned_by_other_user_forbidden(auth_client, db, exercise):
    other = User(
        id=uuid.uuid4(), username="other", password_hash="x",
        unit_system="metric", timezone="UTC",
    )
    db.add(other)
    db.commit()
    workout = Workout(
        id=uuid.uuid4(), user_id=other.id,
        performed_at=datetime(2026, 9, 1, tzinfo=UTC),
    )
    db.add(workout)
    db.commit()

    response = auth_client.post("/api/workouts", json=_payload(exercise["id"], str(workout.id)))
    assert response.status_code == 403


def test_set_number_assigned_when_omitted_and_duplicate_rejected(auth_client, exercise):
    workout_id, wex_id = str(uuid.uuid4()), str(uuid.uuid4())
    payload = _payload(exercise["id"], workout_id)
    payload["exercises"][0]["id"] = wex_id
    for s in payload["exercises"][0]["sets"]:
        s.pop("set_number", None)
    assert auth_client.post("/api/workouts", json=payload).status_code == 201

    duplicate_numbers = _payload(exercise["id"], str(uuid.uuid4()))
    duplicate_numbers["exercises"][0]["sets"][0]["set_number"] = 1
    duplicate_numbers["exercises"][0]["sets"][1]["set_number"] = 1
    assert auth_client.post("/api/workouts", json=duplicate_numbers).status_code == 422


def test_fast_set_add_increments_number(auth_client, exercise):
    created = auth_client.post("/api/workouts", json=_payload(exercise["id"])).json()
    workout_exercise_id = created["exercises"][0]["id"]
    response = auth_client.post(
        f"/api/workout-exercises/{workout_exercise_id}/sets",
        json={"weight_kg": 85.0, "reps": 1},
    )
    assert response.status_code == 201
    assert response.json()["set_number"] == 3


def test_progress_and_prs_bodyweight_only(auth_client, exercise):
    payload = _payload(exercise["id"])
    payload["exercises"][0]["sets"] = [
        {"weight_kg": None, "reps": 10},
        {"weight_kg": None, "reps": 12},
        {"weight_kg": 200.0, "reps": 1, "is_warmup": True},
    ]
    auth_client.post("/api/workouts", json=payload)

    session = auth_client.get(f"/api/exercises/{exercise['id']}/progress").json()["sessions"][0]
    assert session["volume_kg"] == 0
    assert session["reps_volume"] == 22
    assert session["top_set_kg"] is None
    assert session["e1rm_kg"] is None

    prs = auth_client.get(f"/api/exercises/{exercise['id']}/prs").json()
    assert prs["best_reps"]["reps"] == 12
    assert prs["heaviest_weight"] is None
    assert prs["best_e1rm"] is None
    assert prs["best_session_volume"] is None


def test_e1rm_excluded_above_12_reps_but_volume_counted(auth_client, exercise):
    payload = _payload(exercise["id"])
    payload["exercises"][0]["sets"] = [{"weight_kg": 100.0, "reps": 13}]
    auth_client.post("/api/workouts", json=payload)

    session = auth_client.get(f"/api/exercises/{exercise['id']}/progress").json()["sessions"][0]
    assert session["volume_kg"] == 1300
    assert session["top_set_kg"] == 100.0
    assert session["e1rm_kg"] is None  # reps > 12 are excluded from e1RM only

    prs = auth_client.get(f"/api/exercises/{exercise['id']}/prs").json()
    assert prs["heaviest_weight"]["weight_kg"] == 100.0
    assert prs["best_e1rm"] is None
    assert prs["best_session_volume"]["volume_kg"] == 1300
    assert prs["best_reps"]["reps"] == 13


def test_last_performance_returns_latest_sets(auth_client, exercise):
    auth_client.post("/api/workouts", json=_payload(exercise["id"]))
    response = auth_client.get(f"/api/exercises/{exercise['id']}/last-performance")
    assert response.status_code == 200
    assert len(response.json()["sets"]) == 2
