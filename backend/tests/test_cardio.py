import uuid
from datetime import UTC, datetime

import pytest

from app.models import CardioActivity, User


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


def test_week_window_is_dst_safe(auth_client):
    auth_client.patch("/api/settings", json={"timezone": "America/New_York"})
    # Fall back: Sunday Nov 1 2026; the local week is [Mon Oct 26 00:00 EDT, Mon Nov 2 00:00 EST)
    body = auth_client.get("/api/cardio/week?week_start=2026-10-26").json()
    assert body["week_start"] == "2026-10-26T04:00:00Z"
    assert body["week_end"] == "2026-11-02T05:00:00Z"
    # Spring forward: Sunday Mar 8 2026; [Mon Mar 2 00:00 EST, Mon Mar 9 00:00 EDT)
    body = auth_client.get("/api/cardio/week?week_start=2026-03-02").json()
    assert body["week_start"] == "2026-03-02T05:00:00Z"
    assert body["week_end"] == "2026-03-09T04:00:00Z"


def test_ownership_and_naive_datetime(auth_client, db):
    other = User(id=uuid.uuid4(), username="other", password_hash="x")
    db.add(other)
    db.commit()
    foreign = CardioActivity(
        id=uuid.uuid4(), user_id=other.id,
        performed_at=datetime(2026, 9, 1, tzinfo=UTC),
        type="run", duration_s=600,
    )
    db.add(foreign)
    db.commit()
    assert auth_client.get(f"/api/cardio/{foreign.id}").status_code == 404
    assert (
        auth_client.patch(f"/api/cardio/{foreign.id}", json={"duration_s": 700}).status_code
        == 404
    )
    assert auth_client.delete(f"/api/cardio/{foreign.id}").status_code == 404

    naive = auth_client.post(
        "/api/cardio",
        json={"performed_at": "2026-09-01T06:00:00", "type": "run", "duration_s": 600},
    )
    assert naive.status_code == 422
