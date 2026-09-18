def test_template_crud_and_archive_listing(auth_client, exercise):
    created = auth_client.post(
        "/api/templates",
        json={
            "name": "Push Day A",
            "exercises": [
                {"exercise_id": exercise["id"], "position": 0, "target_sets": 3,
                 "target_reps": 8, "target_weight_kg": 60.0}
            ],
        },
    )
    assert created.status_code == 201
    template = created.json()

    archived = auth_client.patch(f"/api/templates/{template['id']}", json={"is_archived": True})
    assert archived.json()["is_archived"] is True
    assert template["id"] not in [t["id"] for t in auth_client.get("/api/templates").json()]
    listed = auth_client.get("/api/templates?include_archived=true").json()
    assert template["id"] in [t["id"] for t in listed]


def test_from_template_creates_workout_with_planned_zero_sets(auth_client, exercise):
    template = auth_client.post(
        "/api/templates",
        json={
            "name": "Push Day A",
            "exercises": [
                {"exercise_id": exercise["id"], "position": 0, "target_sets": 3,
                 "target_reps": 8, "target_weight_kg": 60.0},
                {"exercise_id": exercise["id"], "position": 1, "target_sets": 2},
            ],
        },
    ).json()
    response = auth_client.post(f"/api/workouts/from-template/{template['id']}")
    assert response.status_code == 201
    body = response.json()

    workout = body["workout"]
    assert len(workout["exercises"]) == 2
    assert all(item["sets"] == [] for item in workout["exercises"])
    assert body["planned"] == [
        {"exercise_id": exercise["id"], "position": 0, "sets": 3, "reps": 8, "weight_kg": 60.0},
        {"exercise_id": exercise["id"], "position": 1, "sets": 2, "reps": None, "weight_kg": None},
    ]


def test_from_template_resumes_like_get_workout(auth_client, exercise):
    template = auth_client.post(
        "/api/templates",
        json={
            "name": "Leg Day",
            "exercises": [{"exercise_id": exercise["id"], "position": 0, "target_sets": 1}],
        },
    ).json()
    body = auth_client.post(f"/api/workouts/from-template/{template['id']}").json()
    fetched = auth_client.get(f"/api/workouts/{body['workout']['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == body["workout"]
