import uuid

from app.models import User, WorkoutTemplate


def _template_body(name, exercise_id, position=0):
    return {"name": name, "exercises": [{"exercise_id": exercise_id, "position": position}]}


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


def test_flush_integrity_errors_map_to_409(auth_client, exercise, monkeypatch):
    body = {"name": "Push Day A", "exercises": [{"exercise_id": exercise["id"], "position": 0}]}
    assert auth_client.post("/api/templates", json=body).status_code == 201
    second = auth_client.post(
        "/api/templates",
        json={"name": "Pull Day", "exercises": [{"exercise_id": exercise["id"], "position": 0}]},
    ).json()

    monkeypatch.setattr("app.routers.templates._find_by_name", lambda *args: None)
    duplicate = auth_client.post("/api/templates", json={**body, "name": "push day a"})
    assert duplicate.status_code == 409
    renamed = auth_client.patch(f"/api/templates/{second['id']}", json={"name": "PUSH DAY A"})
    assert renamed.status_code == 409


def test_duplicate_name_conflicts_409(auth_client, exercise):
    assert auth_client.post(
        "/api/templates", json=_template_body("Push Day A", exercise["id"])
    ).status_code == 201
    duplicate = auth_client.post(
        "/api/templates", json=_template_body("push day a", exercise["id"])
    )
    assert duplicate.status_code == 409

    second = auth_client.post(
        "/api/templates", json=_template_body("Pull Day", exercise["id"])
    ).json()
    renamed = auth_client.patch(f"/api/templates/{second['id']}", json={"name": "PUSH DAY A"})
    assert renamed.status_code == 409
    assert auth_client.get(f"/api/templates/{second['id']}").json()["name"] == "Pull Day"


def test_missing_and_foreign_template_404(auth_client, db, exercise):
    missing = str(uuid.uuid4())
    assert auth_client.get(f"/api/templates/{missing}").status_code == 404
    assert auth_client.patch(f"/api/templates/{missing}", json={"name": "X"}).status_code == 404
    assert auth_client.delete(f"/api/templates/{missing}").status_code == 404

    other = User(
        id=uuid.uuid4(), username="other", password_hash="x",
        unit_system="metric", timezone="UTC",
    )
    db.add(other)
    db.commit()
    foreign = WorkoutTemplate(
        id=uuid.uuid4(), user_id=other.id, name="Other", name_lower="other",
    )
    db.add(foreign)
    db.commit()

    foreign_id = str(foreign.id)
    assert auth_client.get(f"/api/templates/{foreign_id}").status_code == 404
    assert auth_client.patch(
        f"/api/templates/{foreign_id}", json={"name": "X"}
    ).status_code == 404
    assert auth_client.delete(f"/api/templates/{foreign_id}").status_code == 404
    assert auth_client.post(f"/api/workouts/from-template/{foreign_id}").status_code == 404


def test_restore_and_archived_start(auth_client, exercise):
    template = auth_client.post(
        "/api/templates", json=_template_body("Leg Day", exercise["id"])
    ).json()
    archived = auth_client.patch(
        f"/api/templates/{template['id']}", json={"is_archived": True}
    )
    assert archived.status_code == 200
    assert archived.json()["is_archived"] is True
    assert template["id"] not in [t["id"] for t in auth_client.get("/api/templates").json()]
    listed = auth_client.get("/api/templates?include_archived=true").json()
    assert template["id"] in [t["id"] for t in listed]

    restored = auth_client.patch(
        f"/api/templates/{template['id']}", json={"is_archived": False}
    )
    assert restored.status_code == 200
    assert restored.json()["is_archived"] is False
    assert template["id"] in [t["id"] for t in auth_client.get("/api/templates").json()]

    auth_client.patch(f"/api/templates/{template['id']}", json={"is_archived": True})
    started = auth_client.post(f"/api/workouts/from-template/{template['id']}")
    assert started.status_code == 201
    assert started.json()["workout"]["template_id"] == template["id"]
    assert started.json()["workout"]["name"] == "Leg Day"


def test_delete_template_keeps_workout_with_null_template(auth_client, exercise):
    template = auth_client.post(
        "/api/templates", json=_template_body("Doomed", exercise["id"])
    ).json()
    workout = auth_client.post(f"/api/workouts/from-template/{template['id']}").json()["workout"]

    deleted = auth_client.delete(f"/api/templates/{template['id']}")
    assert deleted.status_code == 204
    assert auth_client.get(f"/api/templates/{template['id']}").status_code == 404

    fetched = auth_client.get(f"/api/workouts/{workout['id']}")
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["template_id"] is None
    assert [item["exercise_id"] for item in body["exercises"]] == [exercise["id"]]
    assert all(item["sets"] == [] for item in body["exercises"])


def test_list_pagination(auth_client, exercise):
    for name in ("Alpha", "Bravo", "Charlie"):
        assert auth_client.post(
            "/api/templates", json=_template_body(name, exercise["id"])
        ).status_code == 201

    names = [t["name"] for t in auth_client.get("/api/templates").json()]
    assert names == ["Alpha", "Bravo", "Charlie"]
    page = auth_client.get("/api/templates?limit=2").json()
    assert [t["name"] for t in page] == ["Alpha", "Bravo"]
    rest = auth_client.get("/api/templates?limit=2&offset=2").json()
    assert [t["name"] for t in rest] == ["Charlie"]
    assert auth_client.get("/api/templates?limit=0").status_code == 422
    assert auth_client.get("/api/templates?limit=501").status_code == 422
    assert auth_client.get("/api/templates?offset=-1").status_code == 422
