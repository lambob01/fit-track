import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Exercise


def test_create_and_duplicate(auth_client):
    created = auth_client.post("/api/exercises", json={"name": "Bench Press"})
    assert created.status_code == 201
    again = auth_client.post("/api/exercises", json={"name": "bench press"})
    assert again.status_code == 409


def test_duplicate_name_violates_db_constraint(db, user):
    db.add(
        Exercise(
            id=uuid.uuid4(), user_id=user.id, name="Bench Press", name_lower="bench press"
        )
    )
    db.commit()
    db.add(
        Exercise(
            id=uuid.uuid4(), user_id=user.id, name="bench press", name_lower="bench press"
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_resolve_creates_then_reuses_case_insensitively(auth_client):
    first = auth_client.post("/api/exercises/resolve", json={"name": "  Zercher Squat "})
    assert first.status_code == 200
    body = first.json()
    assert body["created"] is True
    assert body["name"] == "Zercher Squat" and body["is_archived"] is False
    second = auth_client.post("/api/exercises/resolve", json={"name": "zercher squat"})
    assert second.status_code == 200
    assert second.json() == {**body, "created": False}


def test_archive_excludes_from_listing_but_stays_resolvable(auth_client):
    exercise = auth_client.post("/api/exercises", json={"name": "Deadlift"}).json()
    patched = auth_client.patch(
        f"/api/exercises/{exercise['id']}", json={"is_archived": True}
    )
    assert patched.status_code == 200 and patched.json()["is_archived"] is True

    names = [e["name"] for e in auth_client.get("/api/exercises").json()]
    assert "Deadlift" not in names
    names = [
        e["name"]
        for e in auth_client.get("/api/exercises?include_archived=true").json()
    ]
    assert "Deadlift" in names

    resolved = auth_client.post("/api/exercises/resolve", json={"name": "deadlift"}).json()
    assert resolved["id"] == exercise["id"]
    assert resolved["is_archived"] is True and resolved["created"] is False

    restored = auth_client.patch(
        f"/api/exercises/{exercise['id']}", json={"is_archived": False}
    )
    assert restored.json()["is_archived"] is False


def test_search_and_filters(auth_client):
    auth_client.post(
        "/api/exercises",
        json={"name": "Incline Bench", "category": "push", "muscle_group": "chest"},
    )
    auth_client.post(
        "/api/exercises",
        json={"name": "Barbell Row", "category": "pull", "muscle_group": "back"},
    )
    hits = auth_client.get("/api/exercises?q=bench").json()
    assert [e["name"] for e in hits] == ["Incline Bench"]
    pushes = auth_client.get("/api/exercises?category=push").json()
    assert [e["name"] for e in pushes] == ["Incline Bench"]
