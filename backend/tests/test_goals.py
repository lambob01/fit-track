from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.services.analytics import (
    compare_rate,
    required_rate_line_points,
    required_rate_per_week,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _today() -> date:
    return datetime.now(UTC).date()


def _add_weight(auth_client, measured_at: datetime, weight_kg: float) -> None:
    response = auth_client.post(
        "/api/weight/entries",
        json={"measured_at": measured_at.isoformat(), "weight_kg": weight_kg},
    )
    assert response.status_code == 201


def _dated_settings(
    auth_client, target_kg: float, weeks: int = 4, rate: float | None = None
) -> str:
    target_date = (_today() + timedelta(weeks=weeks)).isoformat()
    payload: dict = {
        "goal_weight_target_date": target_date,
        "goal_weight_target_kg": target_kg,
    }
    if rate is not None:
        payload["goal_rate_kg_per_week"] = rate
    response = auth_client.patch("/api/settings", json=payload)
    assert response.status_code == 200
    return target_date


# --- shared helper: required_rate_per_week -----------------------------------


def test_required_rate_math_cut_and_bulk():
    target_date = _today() + timedelta(weeks=4)
    assert required_rate_per_week(80.0, 78.0, target_date) == pytest.approx(-0.5)
    assert required_rate_per_week(80.0, 82.0, target_date) == pytest.approx(0.5)


def test_required_rate_none_when_inputs_missing():
    target_date = _today() + timedelta(weeks=4)
    assert required_rate_per_week(None, 78.0, target_date) is None
    assert required_rate_per_week(80.0, None, target_date) is None
    assert required_rate_per_week(80.0, 78.0, None) is None


def test_required_rate_expired_when_no_weeks_remain():
    assert required_rate_per_week(80.0, 78.0, _today()) == "expired"
    assert required_rate_per_week(80.0, 78.0, _today() - timedelta(days=1)) == "expired"


def test_required_rate_explicit_today_overrides_utc():
    target = date(2026, 6, 1)
    assert required_rate_per_week(80.0, 78.0, target, today=target) == "expired"
    assert required_rate_per_week(80.0, 78.0, target, today=date(2026, 5, 25)) == pytest.approx(
        -2.0
    )


# --- shared helper: compare_rate ---------------------------------------------


def test_compare_rate_direction_aware_for_cut():
    assert compare_rate(-1.5, -0.5) == "ahead"
    assert compare_rate(-0.5, -0.5) == "on_pace"
    assert compare_rate(-0.45, -0.5) == "on_pace"  # within tolerance
    assert compare_rate(0.0, -0.5) == "behind"


def test_compare_rate_direction_aware_for_bulk():
    assert compare_rate(1.5, 0.5) == "ahead"
    assert compare_rate(0.5, 0.5) == "on_pace"
    assert compare_rate(0.0, 0.5) == "behind"


def test_compare_rate_none_and_expired():
    assert compare_rate(None, -0.5) is None
    assert compare_rate(-0.5, None) is None
    assert compare_rate(-0.5, "expired") == "expired"
    assert compare_rate(None, "expired") == "expired"


# --- shared helper: required_rate_line_points --------------------------------


def test_required_rate_line_points_weekly_to_target():
    start = date(2026, 1, 1)
    target = date(2026, 1, 29)
    points = required_rate_line_points(start, 80.0, 78.0, target)
    assert points == [
        (date(2026, 1, 1), 80.0),
        (date(2026, 1, 8), pytest.approx(79.5)),
        (date(2026, 1, 15), pytest.approx(79.0)),
        (date(2026, 1, 22), pytest.approx(78.5)),
        (date(2026, 1, 29), 78.0),
    ]


def test_required_rate_line_points_missing_or_past_target():
    start = date(2026, 1, 1)
    assert required_rate_line_points(start, None, 78.0, date(2026, 2, 1)) is None
    assert required_rate_line_points(start, 80.0, None, date(2026, 2, 1)) is None
    assert required_rate_line_points(start, 80.0, 78.0, start) is None
    assert required_rate_line_points(start, 80.0, 78.0, date(2025, 12, 1)) is None


# --- settings PATCH: weekly rate and height ----------------------------------


def test_settings_new_goal_fields_default_to_null(auth_client):
    body = auth_client.get("/api/settings").json()
    for field in (
        "goal_rate_kg_per_week",
        "goal_monthly_mode",
        "goal_monthly_target_kg",
        "goal_monthly_rate_kg",
        "goal_weight_target_date",
        "goal_weight_target_kg",
        "height_cm",
    ):
        assert body[field] is None


def test_patch_weekly_rate_and_height(auth_client):
    response = auth_client.patch(
        "/api/settings", json={"goal_rate_kg_per_week": -0.5, "height_cm": 180.0}
    )
    assert response.status_code == 200
    assert response.json()["goal_rate_kg_per_week"] == -0.5
    assert response.json()["height_cm"] == 180.0
    assert auth_client.patch("/api/settings", json={"goal_rate_kg_per_week": 0}).status_code == 422
    assert auth_client.patch("/api/settings", json={"height_cm": 0}).status_code == 422
    assert auth_client.patch("/api/settings", json={"height_cm": -180}).status_code == 422


def test_patch_explicit_null_clears_weekly_rate_and_height(auth_client):
    auth_client.patch("/api/settings", json={"goal_rate_kg_per_week": -0.5, "height_cm": 180.0})
    body = auth_client.patch(
        "/api/settings", json={"goal_rate_kg_per_week": None, "height_cm": None}
    ).json()
    assert body["goal_rate_kg_per_week"] is None
    assert body["height_cm"] is None


# --- settings PATCH: monthly mode/value coupling -----------------------------


def test_monthly_mode_without_value_is_422(auth_client):
    assert (
        auth_client.patch("/api/settings", json={"goal_monthly_mode": "target"}).status_code == 422
    )
    assert (
        auth_client.patch("/api/settings", json={"goal_monthly_mode": "rate"}).status_code == 422
    )
    assert (
        auth_client.patch("/api/settings", json={"goal_monthly_mode": "banana"}).status_code == 422
    )
    assert auth_client.get("/api/settings").json()["goal_monthly_mode"] is None


def test_monthly_mode_with_value_is_stored(auth_client):
    response = auth_client.patch(
        "/api/settings",
        json={"goal_monthly_mode": "target", "goal_monthly_target_kg": 77.0},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["goal_monthly_mode"] == "target"
    assert body["goal_monthly_target_kg"] == 77.0
    assert body["goal_monthly_rate_kg"] is None
    assert auth_client.patch("/api/settings", json={"goal_monthly_target_kg": 0}).status_code == 422
    assert (
        auth_client.patch(
            "/api/settings", json={"goal_monthly_mode": "rate", "goal_monthly_rate_kg": 0}
        ).status_code
        == 422
    )


def test_monthly_mode_accepts_already_stored_value(auth_client):
    auth_client.patch("/api/settings", json={"goal_monthly_target_kg": 77.0})
    response = auth_client.patch("/api/settings", json={"goal_monthly_mode": "target"})
    assert response.status_code == 200
    assert response.json()["goal_monthly_target_kg"] == 77.0


def test_switching_monthly_mode_requires_matching_value(auth_client):
    auth_client.patch(
        "/api/settings",
        json={"goal_monthly_mode": "target", "goal_monthly_target_kg": 77.0},
    )
    assert auth_client.patch("/api/settings", json={"goal_monthly_mode": "rate"}).status_code == 422
    response = auth_client.patch(
        "/api/settings",
        json={"goal_monthly_mode": "rate", "goal_monthly_rate_kg": -0.25},
    )
    assert response.status_code == 200
    assert response.json()["goal_monthly_rate_kg"] == -0.25


def test_clearing_mode_value_while_mode_active_is_422(auth_client):
    auth_client.patch(
        "/api/settings",
        json={"goal_monthly_mode": "target", "goal_monthly_target_kg": 77.0},
    )
    assert (
        auth_client.patch("/api/settings", json={"goal_monthly_target_kg": None}).status_code == 422
    )


def test_clearing_monthly_mode_nulls_both_values(auth_client):
    auth_client.patch(
        "/api/settings",
        json={"goal_monthly_mode": "target", "goal_monthly_target_kg": 77.0},
    )
    body = auth_client.patch("/api/settings", json={"goal_monthly_mode": None}).json()
    assert body["goal_monthly_mode"] is None
    assert body["goal_monthly_target_kg"] is None
    assert body["goal_monthly_rate_kg"] is None


# --- settings PATCH: dated target pair ---------------------------------------


def test_date_without_target_is_422(auth_client):
    future = (_today() + timedelta(days=90)).isoformat()
    assert (
        auth_client.patch(
            "/api/settings", json={"goal_weight_target_date": future}
        ).status_code
        == 422
    )
    assert (
        auth_client.patch(
            "/api/settings", json={"goal_weight_target_kg": 78.0}
        ).status_code
        == 422
    )
    assert (
        auth_client.patch("/api/settings", json={"goal_weight_target_kg": 0}).status_code == 422
    )


def test_dated_target_pair_is_stored_and_clearable(auth_client):
    future = (_today() + timedelta(days=90)).isoformat()
    response = auth_client.patch(
        "/api/settings",
        json={"goal_weight_target_date": future, "goal_weight_target_kg": 78.0},
    )
    assert response.status_code == 200
    assert response.json()["goal_weight_target_date"] == future
    assert response.json()["goal_weight_target_kg"] == 78.0

    # updating one side keeps the stored partner
    assert (
        auth_client.patch(
            "/api/settings", json={"goal_weight_target_kg": 77.5}
        ).status_code
        == 200
    )
    assert auth_client.get("/api/settings").json()["goal_weight_target_date"] == future

    cleared = auth_client.patch(
        "/api/settings", json={"goal_weight_target_date": None, "goal_weight_target_kg": None}
    ).json()
    assert cleared["goal_weight_target_date"] is None
    assert cleared["goal_weight_target_kg"] is None


# --- weight series -----------------------------------------------------------


def test_series_goals_null_when_unset(auth_client):
    _add_weight(auth_client, _now(), 80.0)
    body = auth_client.get("/api/weight/series").json()
    assert body["goals"] == {
        "final_weight_kg": None,
        "rate_kg_per_week": None,
        "monthly": {"mode": None, "target_kg": None, "rate_kg_per_month": None},
    }
    assert body["required_rate_line"] is None
    assert body["on_track"] is None


def test_series_goals_and_required_rate_line_when_set(auth_client):
    now = _now()
    target_date = _dated_settings(auth_client, 78.0)
    auth_client.patch(
        "/api/settings",
        json={
            "goal_weight_kg": 75.0,
            "goal_rate_kg_per_week": -0.5,
            "goal_monthly_mode": "target",
            "goal_monthly_target_kg": 77.0,
        },
    )
    _add_weight(auth_client, now, 80.0)

    body = auth_client.get("/api/weight/series").json()
    assert body["goals"] == {
        "final_weight_kg": 75.0,
        "rate_kg_per_week": -0.5,
        "monthly": {"mode": "target", "target_kg": 77.0, "rate_kg_per_month": None},
    }

    line = body["required_rate_line"]
    assert line is not None
    assert [point["date"] for point in line] == [
        (_today() + timedelta(weeks=week)).isoformat() for week in range(5)
    ]
    assert line[0]["weight_kg"] == 80.0
    assert line[-1] == {"date": target_date, "weight_kg": 78.0}
    assert [point["weight_kg"] for point in line] == pytest.approx([80.0, 79.5, 79.0, 78.5, 78.0])

    # one entry is not enough for a least-squares trend
    assert body["on_track"] is None


def test_series_on_track_cut_ahead(auth_client):
    now = _now()
    _dated_settings(auth_client, 78.0)
    _add_weight(auth_client, now - timedelta(days=7), 81.5)
    _add_weight(auth_client, now, 80.0)
    assert auth_client.get("/api/weight/series").json()["on_track"] == "ahead"


def test_series_on_track_cut_behind(auth_client):
    now = _now()
    _dated_settings(auth_client, 78.0)
    _add_weight(auth_client, now - timedelta(days=7), 79.0)
    _add_weight(auth_client, now, 80.0)
    assert auth_client.get("/api/weight/series").json()["on_track"] == "behind"


def test_series_on_track_bulk_ahead_and_on_pace(auth_client):
    now = _now()
    _dated_settings(auth_client, 82.0)
    _add_weight(auth_client, now - timedelta(days=7), 79.0)
    _add_weight(auth_client, now, 80.0)
    assert auth_client.get("/api/weight/series").json()["on_track"] == "ahead"

    # a second account would be cleaner, but flipping the target on the same
    # entries also exercises the required rate: (81 - 80) / 4 = +1.0/week.
    _dated_settings(auth_client, 84.0)
    assert auth_client.get("/api/weight/series").json()["on_track"] == "on_pace"


def test_dated_target_uses_user_local_today(auth_client):
    now = datetime.now(UTC)
    utc_today = now.date()
    for tz_name in ("Pacific/Kiritimati", "Etc/GMT+12"):
        local_today = now.astimezone(ZoneInfo(tz_name)).date()
        if local_today != utc_today:
            break
    else:
        pytest.fail("no timezone with a local date differing from UTC")

    if local_today > utc_today:
        # "Today" locally is still tomorrow in UTC: must be expired.
        target_date = local_today
        expect_expired = True
    else:
        # "Tomorrow" locally is still today in UTC: must not be expired.
        target_date = local_today + timedelta(days=1)
        expect_expired = False

    auth_client.patch("/api/settings", json={"timezone": tz_name})
    response = auth_client.patch(
        "/api/settings",
        json={
            "goal_weight_target_date": target_date.isoformat(),
            "goal_weight_target_kg": 78.0,
        },
    )
    assert response.status_code == 200
    _add_weight(auth_client, now - timedelta(days=7), 80.5)
    _add_weight(auth_client, now, 80.0)

    series = auth_client.get("/api/weight/series").json()
    progress = auth_client.get("/api/dashboard").json()["weight_goal_progress"]
    if expect_expired:
        assert series["on_track"] == "expired"
        assert series["required_rate_line"] is None
        assert progress["status"] == "expired"
    else:
        assert series["on_track"] != "expired"
        line = series["required_rate_line"]
        assert line[0]["date"] == local_today.isoformat()
        assert line[-1] == {"date": target_date.isoformat(), "weight_kg": 78.0}
        assert progress["status"] != "expired"


def test_series_expired_dated_target(auth_client):
    now = _now()
    past = (_today() - timedelta(days=1)).isoformat()
    response = auth_client.patch(
        "/api/settings",
        json={"goal_weight_target_date": past, "goal_weight_target_kg": 78.0},
    )
    assert response.status_code == 200
    _add_weight(auth_client, now - timedelta(days=7), 81.0)
    _add_weight(auth_client, now, 80.0)

    body = auth_client.get("/api/weight/series").json()
    assert body["required_rate_line"] is None
    assert body["on_track"] == "expired"


# --- dashboard progress ------------------------------------------------------


def test_dashboard_progress_null_without_goal(auth_client):
    now = _now()
    _add_weight(auth_client, now - timedelta(days=7), 80.5)
    _add_weight(auth_client, now, 80.0)
    body = auth_client.get("/api/dashboard").json()
    assert body["weight_goal_progress"] is None


def test_dashboard_progress_null_with_fewer_than_two_entries(auth_client):
    auth_client.patch("/api/settings", json={"goal_rate_kg_per_week": -0.5})
    _add_weight(auth_client, _now(), 80.0)
    assert auth_client.get("/api/dashboard").json()["weight_goal_progress"] is None


def test_dashboard_progress_on_pace_cut(auth_client):
    now = _now()
    auth_client.patch("/api/settings", json={"goal_rate_kg_per_week": -0.5})
    _add_weight(auth_client, now - timedelta(days=7), 80.5)
    _add_weight(auth_client, now, 80.0)

    progress = auth_client.get("/api/dashboard").json()["weight_goal_progress"]
    assert progress["status"] == "on_pace"
    assert progress["trend_slope_kg_per_week"] == pytest.approx(-0.5)
    assert progress["rate_goal_kg_per_week"] == -0.5
    assert progress["required_rate_kg_per_week"] == -0.5


def test_dashboard_progress_ahead_cut(auth_client):
    now = _now()
    auth_client.patch("/api/settings", json={"goal_rate_kg_per_week": -0.5})
    _add_weight(auth_client, now - timedelta(days=7), 81.5)
    _add_weight(auth_client, now, 80.0)

    progress = auth_client.get("/api/dashboard").json()["weight_goal_progress"]
    assert progress["status"] == "ahead"
    assert progress["trend_slope_kg_per_week"] == pytest.approx(-1.5)


def test_dashboard_progress_behind_cut(auth_client):
    now = _now()
    auth_client.patch("/api/settings", json={"goal_rate_kg_per_week": -0.5})
    _add_weight(auth_client, now - timedelta(days=7), 79.0)
    _add_weight(auth_client, now, 80.0)

    progress = auth_client.get("/api/dashboard").json()["weight_goal_progress"]
    assert progress["status"] == "behind"
    assert progress["trend_slope_kg_per_week"] == pytest.approx(1.0)


def test_dashboard_progress_bulk_ahead(auth_client):
    now = _now()
    auth_client.patch("/api/settings", json={"goal_rate_kg_per_week": 0.5})
    _add_weight(auth_client, now - timedelta(days=7), 79.0)
    _add_weight(auth_client, now, 80.0)

    progress = auth_client.get("/api/dashboard").json()["weight_goal_progress"]
    assert progress["status"] == "ahead"
    assert progress["rate_goal_kg_per_week"] == 0.5


def test_dashboard_progress_dated_target_takes_precedence(auth_client):
    now = _now()
    auth_client.patch("/api/settings", json={"goal_rate_kg_per_week": -1.0})
    _dated_settings(auth_client, 79.0)
    _add_weight(auth_client, now - timedelta(days=7), 80.25)
    _add_weight(auth_client, now, 80.0)

    # Dated target needs (79 - 80) / 4 = -0.25/week; the -1.0/week goal would
    # classify the -0.25/week trend as "behind".
    progress = auth_client.get("/api/dashboard").json()["weight_goal_progress"]
    assert progress["status"] == "on_pace"
    assert progress["trend_slope_kg_per_week"] == pytest.approx(-0.25)
    assert progress["required_rate_kg_per_week"] == pytest.approx(-0.25)
    assert progress["rate_goal_kg_per_week"] == -1.0


def test_dashboard_progress_uses_dated_target_without_weekly_goal(auth_client):
    now = _now()
    _dated_settings(auth_client, 78.0)
    _add_weight(auth_client, now - timedelta(days=7), 80.5)
    _add_weight(auth_client, now, 80.0)

    progress = auth_client.get("/api/dashboard").json()["weight_goal_progress"]
    assert progress["status"] == "on_pace"
    assert progress["required_rate_kg_per_week"] == pytest.approx(-0.5)
    assert progress["rate_goal_kg_per_week"] is None


def test_dashboard_progress_expired_dated_target(auth_client):
    now = _now()
    past = (_today() - timedelta(days=1)).isoformat()
    auth_client.patch(
        "/api/settings",
        json={"goal_weight_target_date": past, "goal_weight_target_kg": 78.0},
    )
    _add_weight(auth_client, now - timedelta(days=7), 80.5)
    _add_weight(auth_client, now, 80.0)

    progress = auth_client.get("/api/dashboard").json()["weight_goal_progress"]
    assert progress["status"] == "expired"
    assert progress["required_rate_kg_per_week"] is None
