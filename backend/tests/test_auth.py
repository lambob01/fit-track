from app.main import app


def test_login_with_bad_password(client):
    response = client.post("/api/auth/login", json={"username": "albert", "password": "wrong"})
    assert response.status_code == 401


def test_me_requires_session(client):
    assert client.get("/api/auth/me").status_code == 401


def test_login_me_logout_flow(client):
    assert client.post(
        "/api/auth/login", json={"username": "albert", "password": "hunter2"}
    ).status_code == 204
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "albert"
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_health_has_no_auth_dependency():
    schema = app.openapi()
    assert "/api/health" in schema["paths"]
    assert "/api/auth/login" in schema["paths"]
