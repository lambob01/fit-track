from app.services.users import ensure_default_user


def test_ensure_default_user_creates_from_env(db, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "app_username", "owner")
    monkeypatch.setattr(settings, "app_password_hash", "$2b$12$abcdefghijklmnopqrstuv")
    user = ensure_default_user(db)
    assert user is not None and user.username == "owner"
    assert ensure_default_user(db) is None  # no-op once present


def test_get_settings(auth_client):
    response = auth_client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["unit_system"] == "metric" and body["timezone"] == "UTC"


def test_patch_absent_fields_unchanged(auth_client):
    auth_client.patch("/api/settings", json={"goal_weight_kg": 80.0})
    response = auth_client.patch("/api/settings", json={"unit_system": "imperial"})
    assert response.json()["goal_weight_kg"] == 80.0
    assert response.json()["unit_system"] == "imperial"


def test_patch_explicit_null_clears_goal(auth_client):
    auth_client.patch("/api/settings", json={"goal_weight_kg": 80.0, "max_hr": 190})
    response = auth_client.patch("/api/settings", json={"goal_weight_kg": None, "max_hr": None})
    assert response.json()["goal_weight_kg"] is None
    assert response.json()["max_hr"] is None


def test_patch_null_on_non_nullable_rejected(auth_client):
    assert auth_client.patch("/api/settings", json={"timezone": None}).status_code == 422
    assert auth_client.patch("/api/settings", json={"unit_system": None}).status_code == 422


def test_patch_invalid_timezone_and_unknown_field(auth_client):
    assert auth_client.patch("/api/settings", json={"timezone": "Mars/Olympus"}).status_code == 422
    assert auth_client.patch("/api/settings", json={"nope": 1}).status_code == 422
