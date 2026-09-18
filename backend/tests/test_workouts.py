import uuid
from datetime import UTC, datetime

from app.models import User, Workout, WorkoutTemplate


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


def test_child_uuid_attached_elsewhere_conflicts(auth_client, exercise):
    first = auth_client.post("/api/workouts", json=_payload(exercise["id"]))
    assert first.status_code == 201
    child_id = first.json()["exercises"][0]["id"]
    set_id = first.json()["exercises"][0]["sets"][0]["id"]

    reuse_child = _payload(exercise["id"])
    reuse_child["exercises"][0]["id"] = child_id
    assert auth_client.post("/api/workouts", json=reuse_child).status_code == 409

    reuse_set = _payload(exercise["id"])
    reuse_set["exercises"][0]["sets"][0]["id"] = set_id
    assert auth_client.post("/api/workouts", json=reuse_set).status_code == 409

    assert len(auth_client.get("/api/workouts").json()) == 1


def test_workout_patch_delete(auth_client, exercise):
    created = auth_client.post("/api/workouts", json=_payload(exercise["id"])).json()

    patched = auth_client.patch(
        f"/api/workouts/{created['id']}",
        json={
            "name": "Leg Day",
            "notes": "felt good",
            "performed_at": "2026-09-19T10:00:00Z",
        },
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Leg Day"
    assert patched.json()["notes"] == "felt good"
    assert patched.json()["performed_at"] == "2026-09-19T10:00:00Z"

    fetched = auth_client.get(f"/api/workouts/{created['id']}")
    assert fetched.json()["name"] == "Leg Day"
    assert fetched.json()["performed_at"] == "2026-09-19T10:00:00Z"

    assert auth_client.delete(f"/api/workouts/{created['id']}").status_code == 204
    assert auth_client.get(f"/api/workouts/{created['id']}").status_code == 404


def test_add_exercise_and_edit_delete(auth_client, exercise):
    created = auth_client.post("/api/workouts", json=_payload(exercise["id"])).json()

    added = auth_client.post(
        f"/api/workouts/{created['id']}/exercises",
        json={
            "id": str(uuid.uuid4()),
            "exercise_id": exercise["id"],
            "position": 1,
            "sets": [{"weight_kg": 60.0, "reps": 8}],
        },
    )
    assert added.status_code == 201
    item = added.json()
    assert item["sets"][0]["set_number"] == 1

    edited = auth_client.patch(
        f"/api/workout-exercises/{item['id']}", json={"position": 2, "notes": "superset"}
    )
    assert edited.status_code == 200
    assert edited.json()["position"] == 2
    assert edited.json()["notes"] == "superset"

    fast = auth_client.post(
        f"/api/workout-exercises/{item['id']}/sets", json={"weight_kg": 65.0, "reps": 6}
    )
    assert fast.status_code == 201
    assert fast.json()["set_number"] == 2

    set_id = fast.json()["id"]
    set_patch = auth_client.patch(
        f"/api/sets/{set_id}", json={"weight_kg": 67.5, "reps": 5}
    )
    assert set_patch.status_code == 200
    assert set_patch.json()["weight_kg"] == 67.5
    assert set_patch.json()["reps"] == 5

    assert auth_client.delete(f"/api/sets/{set_id}").status_code == 204
    assert auth_client.delete(f"/api/workout-exercises/{item['id']}").status_code == 204


def test_failed_add_exercise_leaves_no_partial_row(auth_client, exercise):
    created = auth_client.post("/api/workouts", json=_payload(exercise["id"])).json()

    # A supplied set_number that collides with the implicit 1..n assignment raises 422
    # after the workout exercise would previously have been flushed without rollback.
    response = auth_client.post(
        f"/api/workouts/{created['id']}/exercises",
        json={
            "id": str(uuid.uuid4()),
            "exercise_id": exercise["id"],
            "position": 1,
            "sets": [
                {"set_number": 2, "weight_kg": 60.0, "reps": 8},
                {"weight_kg": 60.0, "reps": 8},
            ],
        },
    )
    assert response.status_code == 422

    fetched = auth_client.get(f"/api/workouts/{created['id']}").json()
    assert len(fetched["exercises"]) == 1


def test_naive_performed_at_and_duplicate_positions_rejected(auth_client, exercise):
    naive = _payload(exercise["id"])
    naive["performed_at"] = "2026-09-18T17:30:00"
    assert auth_client.post("/api/workouts", json=naive).status_code == 422

    duplicated = _payload(exercise["id"])
    duplicated["exercises"].append(
        {
            "id": str(uuid.uuid4()),
            "exercise_id": exercise["id"],
            "position": duplicated["exercises"][0]["position"],
            "sets": [],
        }
    )
    assert auth_client.post("/api/workouts", json=duplicated).status_code == 422


def test_template_must_belong_to_user(auth_client, db, exercise):
    missing = _payload(exercise["id"])
    missing["template_id"] = str(uuid.uuid4())
    assert auth_client.post("/api/workouts", json=missing).status_code == 404

    other = User(id=uuid.uuid4(), username="template-owner", password_hash="x")
    db.add(other)
    db.commit()
    template = WorkoutTemplate(
        id=uuid.uuid4(), user_id=other.id, name="Foreign", name_lower="foreign"
    )
    db.add(template)
    db.commit()

    foreign = _payload(exercise["id"])
    foreign["template_id"] = str(template.id)
    assert auth_client.post("/api/workouts", json=foreign).status_code == 404
    assert auth_client.get("/api/workouts").json() == []

    created = auth_client.post("/api/workouts", json=_payload(exercise["id"])).json()
    patched = auth_client.patch(
        f"/api/workouts/{created['id']}", json={"template_id": str(template.id)}
    )
    assert patched.status_code == 404


def test_set_patch_rejects_null_flags(auth_client, exercise):
    created = auth_client.post("/api/workouts", json=_payload(exercise["id"])).json()
    set_id = created["exercises"][0]["sets"][0]["id"]
    assert auth_client.patch(f"/api/sets/{set_id}", json={"is_warmup": None}).status_code == 422
    assert auth_client.patch(f"/api/sets/{set_id}", json={"is_drop_set": None}).status_code == 422
    assert auth_client.patch(f"/api/sets/{set_id}", json={"weight_kg": None}).status_code == 200
