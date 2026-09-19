import uuid
from datetime import UTC, datetime

from app.models import Exercise, SetEntry, User, Workout, WorkoutExercise


def _create_workout(auth_client, exercise, sets):
    payload = {
        "id": str(uuid.uuid4()),
        "performed_at": "2026-09-18T17:30:00Z",
        "name": "Push Day A",
        "exercises": [
            {
                "id": str(uuid.uuid4()),
                "exercise_id": exercise["id"],
                "position": 0,
                "sets": sets,
            }
        ],
    }
    response = auth_client.post("/api/workouts", json=payload)
    assert response.status_code == 201
    return response.json()


def _foreign_workout_exercise(db):
    other = User(
        id=uuid.uuid4(),
        username="reorder-other",
        password_hash="x",
        unit_system="metric",
        timezone="UTC",
    )
    db.add(other)
    db.flush()
    other_exercise = Exercise(user_id=other.id, name="Squat", name_lower="squat")
    db.add(other_exercise)
    db.flush()
    other_workout = Workout(
        user_id=other.id, performed_at=datetime(2026, 9, 1, tzinfo=UTC)
    )
    db.add(other_workout)
    db.flush()
    other_item = WorkoutExercise(
        workout_id=other_workout.id, exercise_id=other_exercise.id, position=0
    )
    db.add(other_item)
    db.flush()
    foreign_set = SetEntry(workout_exercise_id=other_item.id, set_number=1, reps=5)
    db.add(foreign_set)
    db.commit()
    return other_item, foreign_set


def test_reorder_reverses_order_and_renumbers(auth_client, exercise):
    workout = _create_workout(
        auth_client,
        exercise,
        [
            {"weight_kg": 60.0, "reps": 8},
            {"weight_kg": 65.0, "reps": 6},
            {"weight_kg": 70.0, "reps": 4},
        ],
    )
    item = workout["exercises"][0]
    reversed_ids = [s["id"] for s in reversed(item["sets"])]

    response = auth_client.post(
        f"/api/workout-exercises/{item['id']}/reorder-sets",
        json={"set_ids": reversed_ids},
    )
    assert response.status_code == 200
    body = response.json()
    assert [s["id"] for s in body] == reversed_ids
    assert [s["set_number"] for s in body] == [1, 2, 3]
    assert [s["weight_kg"] for s in body] == [70.0, 65.0, 60.0]

    fetched = auth_client.get(f"/api/workouts/{workout['id']}").json()
    assert [s["id"] for s in fetched["exercises"][0]["sets"]] == reversed_ids
    assert [s["set_number"] for s in fetched["exercises"][0]["sets"]] == [1, 2, 3]


def test_reorder_handles_gapped_set_numbers(auth_client, exercise):
    set_ids = [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        "00000000-0000-0000-0000-000000000003",
    ]
    workout = _create_workout(
        auth_client,
        exercise,
        [
            {"id": set_ids[0], "set_number": 1, "weight_kg": 60.0, "reps": 8},
            {"id": set_ids[1], "set_number": 2, "weight_kg": 65.0, "reps": 6},
            {"id": set_ids[2], "set_number": 3, "weight_kg": 70.0, "reps": 4},
        ],
    )
    item = workout["exercises"][0]

    assert auth_client.delete(f"/api/sets/{set_ids[1]}").status_code == 204
    fetched = auth_client.get(f"/api/workouts/{workout['id']}").json()
    remaining = fetched["exercises"][0]["sets"]
    assert [s["set_number"] for s in remaining] == [1, 3]

    response = auth_client.post(
        f"/api/workout-exercises/{item['id']}/reorder-sets",
        json={"set_ids": [set_ids[2], set_ids[0]]},
    )
    assert response.status_code == 200
    body = response.json()
    assert [s["id"] for s in body] == [set_ids[2], set_ids[0]]
    assert [s["set_number"] for s in body] == [1, 2]

    refreshed = auth_client.get(f"/api/workouts/{workout['id']}").json()
    assert [s["set_number"] for s in refreshed["exercises"][0]["sets"]] == [1, 2]


def test_reorder_duplicate_set_id_422(auth_client, exercise):
    workout = _create_workout(auth_client, exercise, [{"reps": 5}, {"reps": 5}])
    item = workout["exercises"][0]
    first_id = item["sets"][0]["id"]

    response = auth_client.post(
        f"/api/workout-exercises/{item['id']}/reorder-sets",
        json={"set_ids": [first_id, first_id]},
    )
    assert response.status_code == 422

    fetched = auth_client.get(f"/api/workouts/{workout['id']}").json()
    assert [s["set_number"] for s in fetched["exercises"][0]["sets"]] == [1, 2]


def test_reorder_missing_set_id_422(auth_client, exercise):
    workout = _create_workout(auth_client, exercise, [{"reps": 5}, {"reps": 5}])
    item = workout["exercises"][0]
    partial_ids = [item["sets"][0]["id"]]

    response = auth_client.post(
        f"/api/workout-exercises/{item['id']}/reorder-sets",
        json={"set_ids": partial_ids},
    )
    assert response.status_code == 422

    response = auth_client.post(
        f"/api/workout-exercises/{item['id']}/reorder-sets",
        json={"set_ids": []},
    )
    assert response.status_code == 422


def test_reorder_extra_set_id_422(auth_client, exercise):
    workout = _create_workout(auth_client, exercise, [{"reps": 5}, {"reps": 5}])
    item = workout["exercises"][0]
    ids = [s["id"] for s in item["sets"]]

    response = auth_client.post(
        f"/api/workout-exercises/{item['id']}/reorder-sets",
        json={"set_ids": ids + [str(uuid.uuid4())]},
    )
    assert response.status_code == 422

    fetched = auth_client.get(f"/api/workouts/{workout['id']}").json()
    assert [s["id"] for s in fetched["exercises"][0]["sets"]] == ids


def test_reorder_foreign_set_id_422(auth_client, db, exercise):
    workout = _create_workout(auth_client, exercise, [{"reps": 5}, {"reps": 5}])
    item = workout["exercises"][0]
    ids = [s["id"] for s in item["sets"]]
    _, foreign_set = _foreign_workout_exercise(db)

    response = auth_client.post(
        f"/api/workout-exercises/{item['id']}/reorder-sets",
        json={"set_ids": [ids[0], str(foreign_set.id)]},
    )
    assert response.status_code == 422

    fetched = auth_client.get(f"/api/workouts/{workout['id']}").json()
    assert [s["id"] for s in fetched["exercises"][0]["sets"]] == ids


def test_reorder_foreign_workout_exercise_404(auth_client, db, exercise):
    other_item, foreign_set = _foreign_workout_exercise(db)

    response = auth_client.post(
        f"/api/workout-exercises/{other_item.id}/reorder-sets",
        json={"set_ids": [str(foreign_set.id)]},
    )
    assert response.status_code == 404

    response = auth_client.post(
        f"/api/workout-exercises/{uuid.uuid4()}/reorder-sets",
        json={"set_ids": []},
    )
    assert response.status_code == 404


def test_reorder_empty_list_for_exercise_without_sets(auth_client, exercise):
    workout = _create_workout(auth_client, exercise, [])
    item = workout["exercises"][0]

    response = auth_client.post(
        f"/api/workout-exercises/{item['id']}/reorder-sets",
        json={"set_ids": []},
    )
    assert response.status_code == 200
    assert response.json() == []


def test_patch_and_delete_sets_still_work(auth_client, exercise):
    workout = _create_workout(auth_client, exercise, [{"weight_kg": 60.0, "reps": 8}])
    item = workout["exercises"][0]
    set_id = item["sets"][0]["id"]

    patched = auth_client.patch(f"/api/sets/{set_id}", json={"weight_kg": 62.5, "reps": 6})
    assert patched.status_code == 200
    assert patched.json()["weight_kg"] == 62.5
    assert patched.json()["reps"] == 6

    assert auth_client.delete(f"/api/sets/{set_id}").status_code == 204

    fetched = auth_client.get(f"/api/workouts/{workout['id']}").json()
    assert fetched["exercises"][0]["sets"] == []
