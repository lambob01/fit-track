from datetime import UTC, datetime, timedelta

import pytest


def test_dashboard_empty(auth_client):
    body = auth_client.get("/api/dashboard").json()
    assert set(body) == {"latest_weight", "weight_goal", "last_workout", "week_cardio"}
    assert body["latest_weight"] is None
    assert body["weight_goal"] is None
    assert body["last_workout"] is None
    assert body["week_cardio"]["activity_count"] == 0
    assert body["week_cardio"]["weekly_goal_m"] is None
    assert body["week_cardio"]["goal_progress_pct"] is None


def test_dashboard_populated(auth_client, exercise):
    auth_client.post(
        "/api/weight/entries",
        json={"measured_at": "2026-09-15T06:00:00Z", "weight_kg": 80.0},
    )
    auth_client.patch("/api/settings", json={"goal_weight_kg": 75.0, "weekly_run_goal_m": 20000})
    auth_client.post(
        "/api/workouts",
        json={
            "performed_at": "2026-09-16T17:00:00Z",
            "exercises": [
                {
                    "exercise_id": exercise["id"],
                    "position": 0,
                    "sets": [{"weight_kg": 100.0, "reps": 5}],
                }
            ],
        },
    )
    # Place the run in the current ISO week so week_cardio assertions are
    # deterministic regardless of when the tests run.
    now = datetime.now(UTC)
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    auth_client.post(
        "/api/cardio",
        json={
            "performed_at": week_start.isoformat(),
            "type": "run",
            "distance_m": 5000,
            "duration_s": 1500,
        },
    )
    body = auth_client.get("/api/dashboard").json()
    assert body["latest_weight"]["weight_kg"] == 80.0
    assert body["weight_goal"] == {"goal_weight_kg": 75.0, "latest_weight_kg": 80.0}
    assert set(body["last_workout"]) == {
        "id",
        "performed_at",
        "name",
        "template_id",
        "exercise_count",
        "set_count",
        "volume_kg",
    }
    assert body["last_workout"]["volume_kg"] == 500.0
    assert body["last_workout"]["exercise_count"] == 1
    assert body["last_workout"]["set_count"] == 1
    assert body["week_cardio"]["total_distance_m"] == 5000
    assert body["week_cardio"]["activity_count"] == 1
    assert body["week_cardio"]["weekly_goal_m"] == 20000
    assert body["week_cardio"]["goal_progress_pct"] == pytest.approx(25.0)
