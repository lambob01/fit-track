import json
import uuid


def test_export_round_trip_and_idempotent_import(auth_client, exercise):
    auth_client.post(
        "/api/weight/entries",
        json={"measured_at": "2026-09-15T06:00:00Z", "weight_kg": 80.0},
    )
    auth_client.post("/api/workouts", json={
        "performed_at": "2026-09-16T17:00:00Z",
        "exercises": [{"exercise_id": exercise["id"], "position": 0,
                       "sets": [{"weight_kg": 100.0, "reps": 5}]}],
    })
    exported = auth_client.get("/api/export/json").json()
    assert exported["format"] == "tracker-export" and exported["version"] == 1
    assert len(exported["data"]["weight_entries"]) == 1
    assert len(exported["data"]["sets"]) == 1

    first = auth_client.post("/api/import/json", json=exported)
    assert first.status_code == 200
    assert first.json()["created"] == {}
    assert all(count == 0 for count in first.json()["updated"].values())

    second = auth_client.post("/api/import/json", json=exported)
    assert all(count == 0 for count in second.json()["created"].values())


def test_import_reassigns_foreign_user_rows(auth_client, exercise, db, user):
    envelope = {
        "format": "tracker-export", "version": 1, "exported_at": "2026-09-18T00:00:00Z",
        "settings": {}, "data": {
            "exercises": [], "workout_templates": [], "template_exercises": [],
            "workouts": [{"id": str(uuid.uuid4()), "user_id": str(uuid.uuid4()),
                          "performed_at": "2026-09-01T00:00:00Z", "name": None,
                          "template_id": None, "notes": None}],
            "workout_exercises": [], "sets": [], "weight_entries": [],
            "cardio_activities": [], "body_measurements": [], "progress_photos": [],
            "tags": [], "workout_tags": [], "shoes": [],
        },
    }
    response = auth_client.post("/api/import/json", json=envelope)
    assert response.status_code == 200
    assert response.json()["created"]["workouts"] == 1
    workout_id = auth_client.get("/api/workouts").json()[0]["id"]
    assert workout_id == envelope["data"]["workouts"][0]["id"]


def test_import_rejects_bad_version(auth_client):
    response = auth_client.post("/api/import/json", json={"format": "tracker-export", "version": 2})
    assert response.status_code == 422


def test_import_rejects_oversized_body(auth_client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "import_max_bytes", 512)
    response = auth_client.post(
        "/api/import/json",
        content=json.dumps({"blob": "x" * 4096}),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_import_rejects_oversized_chunked_body(auth_client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "import_max_bytes", 512)

    def chunks():
        yield b'{"blob": "'
        yield b"x" * 1024
        yield b'"}'

    response = auth_client.post(
        "/api/import/json",
        content=chunks(),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_import_rejects_malformed_id(auth_client):
    envelope = {
        "format": "tracker-export", "version": 1, "exported_at": "2026-09-18T00:00:00Z",
        "settings": {}, "data": {
            "workouts": [{"id": "not-a-uuid", "performed_at": "2026-09-01T00:00:00Z",
                          "name": None, "template_id": None, "notes": None}],
        },
    }
    response = auth_client.post("/api/import/json", json=envelope)
    assert response.status_code == 422
    assert auth_client.get("/api/workouts").json() == []


def test_csv_export_one_endpoint_per_entity(auth_client, exercise):
    auth_client.post(
        "/api/weight/entries",
        json={"measured_at": "2026-09-15T06:00:00Z", "weight_kg": 80.0},
    )
    response = auth_client.get("/api/export/weight_entries.csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "weight_kg" in response.text
    assert auth_client.get("/api/export/nope.csv").status_code == 404
