import pytest


def test_activity_crud_and_pace(auth_client):
    created = auth_client.post(
        "/api/cardio",
        json={"performed_at": "2026-09-18T06:00:00Z", "type": "run",
              "distance_m": 10000, "duration_s": 3000, "avg_hr": 150, "route_name": "River loop"},
    )
    assert created.status_code == 201
    assert created.json()["pace_s_per_km"] == 300.0
    assert auth_client.post(
        "/api/cardio",
        json={"performed_at": "2026-09-18T06:00:00Z", "type": "run", "duration_s": 0},
    ).status_code == 422


def test_summary_totals(auth_client):
    for distance, duration in [(5000, 1500), (10000, 3300)]:
        auth_client.post("/api/cardio", json={
            "performed_at": "2026-09-15T06:00:00Z", "type": "run",
            "distance_m": distance, "duration_s": duration,
        })
    body = auth_client.get(
        "/api/cardio/summary?from=2026-09-14T00:00:00Z&to=2026-09-21T00:00:00Z&type=run"
    ).json()
    assert body["total_distance_m"] == 15000
    assert body["total_duration_s"] == 4800
    assert body["activity_count"] == 2
    assert body["avg_pace_s_per_km"] == pytest.approx(320.0)
    assert "weekly_goal_m" not in body  # goal omitted for range summaries


def test_week_goal_null_and_set(auth_client):
    auth_client.post("/api/cardio", json={
        "performed_at": "2026-09-15T06:00:00Z", "type": "run",
        "distance_m": 5000, "duration_s": 1500,
    })
    unset = auth_client.get("/api/cardio/week?week_start=2026-09-14").json()
    assert unset["weekly_goal_m"] is None and unset["goal_progress_pct"] is None
    auth_client.patch("/api/settings", json={"weekly_run_goal_m": 20000})
    set_goal = auth_client.get("/api/cardio/week?week_start=2026-09-14").json()
    assert set_goal["weekly_goal_m"] == 20000
    assert set_goal["goal_progress_pct"] == 25.0


def test_other_cardio_types_supported(auth_client):
    response = auth_client.post("/api/cardio", json={
        "performed_at": "2026-09-15T06:00:00Z", "type": "row",
        "distance_m": 5000, "duration_s": 1200,
    })
    assert response.status_code == 201 and response.json()["type"] == "row"
    assert auth_client.post("/api/cardio", json={
        "performed_at": "2026-09-15T06:00:00Z", "type": "skiing", "duration_s": 600,
    }).status_code == 422
