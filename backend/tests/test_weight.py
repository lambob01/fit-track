import pytest


def test_weight_crud_and_validation(auth_client):
    created = auth_client.post(
        "/api/weight/entries",
        json={"measured_at": "2026-09-01T06:00:00Z", "weight_kg": 80.5, "body_fat_pct": 18.0},
    )
    assert created.status_code == 201
    assert created.json()["weight_kg"] == 80.5
    assert auth_client.post(
        "/api/weight/entries", json={"measured_at": "2026-09-01T06:00:00Z", "weight_kg": 0}
    ).status_code == 422
    assert auth_client.post(
        "/api/weight/entries",
        json={"measured_at": "2026-09-01T06:00:00Z", "weight_kg": 80, "body_fat_pct": 100},
    ).status_code == 422


def test_series_day_bucket_uses_last_measurement(auth_client):
    for ts, kg in [("2026-09-01T06:00:00Z", 80.0), ("2026-09-01T20:00:00Z", 79.5)]:
        auth_client.post("/api/weight/entries", json={"measured_at": ts, "weight_kg": kg})
    response = auth_client.get(
        "/api/weight/series?from=2026-09-01T00:00:00Z&to=2026-09-02T00:00:00Z&bucket=day"
    )
    body = response.json()
    assert len(body["points"]) == 1
    assert body["points"][0]["weight_kg"] == 79.5
    assert body["points"][0]["measured_at"] == "2026-09-01T20:00:00Z"


def test_series_week_bucket_in_user_timezone(auth_client):
    auth_client.patch("/api/settings", json={"timezone": "Europe/London"})
    # Sunday 23:30 London (winter) belongs to the ISO week starting Monday Dec 29.
    auth_client.post(
        "/api/weight/entries", json={"measured_at": "2026-01-04T23:30:00Z", "weight_kg": 81.0}
    )
    body = auth_client.get(
        "/api/weight/series?from=2025-12-28T00:00:00Z&to=2026-01-05T00:00:00Z&bucket=week"
    ).json()
    assert len(body["points"]) == 1
    assert body["points"][0]["bucket_start"] == "2025-12-29T00:00:00Z"


def test_series_goal_null_semantics(auth_client):
    auth_client.post(
        "/api/weight/entries", json={"measured_at": "2026-09-01T06:00:00Z", "weight_kg": 80}
    )
    unset = auth_client.get("/api/weight/series").json()
    assert unset["goal_weight_kg"] is None
    auth_client.patch("/api/settings", json={"goal_weight_kg": 75.0})
    set_goal = auth_client.get("/api/weight/series").json()
    assert set_goal["goal_weight_kg"] == 75.0


def test_series_moving_average_and_trend(auth_client):
    for day in range(1, 9):
        auth_client.post(
            "/api/weight/entries",
            json={"measured_at": f"2026-09-{day:02d}T06:00:00Z", "weight_kg": 80 + day * 0.1},
        )
    body = auth_client.get(
        "/api/weight/series?from=2026-09-01T00:00:00Z&to=2026-09-09T00:00:00Z"
    ).json()
    assert len(body["moving_average"]) == 8
    # 8th entry at Sep 8: trailing 7-day window excludes Sep 1.
    window = (80.2 + 80.3 + 80.4 + 80.5 + 80.6 + 80.7 + 80.8) / 7
    assert body["moving_average"][-1]["value"] == pytest.approx(window)
    assert body["trend"]["slope_per_day"] == pytest.approx(0.1)
