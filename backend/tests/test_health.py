from app.database import get_db
from app.main import app


def test_health_is_public(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_reports_db_failure(client):
    class FailingSession:
        def execute(self, *args, **kwargs):
            raise RuntimeError("db down")

    def failing_db():
        yield FailingSession()

    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = failing_db
    try:
        response = client.get("/api/health")
    finally:
        if previous is not None:
            app.dependency_overrides[get_db] = previous
        else:
            app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 503
    assert response.json() == {"status": "error"}
