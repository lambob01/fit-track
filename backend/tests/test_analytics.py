from datetime import UTC, datetime, timedelta

import pytest

from app.services.analytics import (
    bucket_start,
    epley_1rm,
    last_in_bucket,
    linear_trend,
    moving_average,
    pace_s_per_km,
    session_reps_volume,
    session_volume_kg,
)


class FakeSet:
    def __init__(self, weight_kg, reps, is_warmup=False):
        self.weight_kg = weight_kg
        self.reps = reps
        self.is_warmup = is_warmup


def test_epley_bounds():
    assert epley_1rm(100.0, 1) == pytest.approx(103.33, rel=1e-3)
    assert epley_1rm(100.0, 12) == pytest.approx(140.0)
    assert epley_1rm(100.0, 13) is None
    assert epley_1rm(None, 5) is None
    assert epley_1rm(100.0, 0) is None


def test_volume_and_reps_volume_exclude_warmups():
    sets = [FakeSet(100, 5), FakeSet(100, 5, is_warmup=True), FakeSet(None, 20)]
    assert session_volume_kg(sets) == 500
    # reps_volume includes bodyweight reps: 5 + 20; warmup excluded.
    assert session_reps_volume(sets) == 25


def test_pace():
    assert pace_s_per_km(10_000, 3000) == 300.0
    assert pace_s_per_km(None, 3000) is None
    assert pace_s_per_km(0, 3000) is None


def test_moving_average_trailing_window():
    base = datetime(2026, 1, 1, tzinfo=UTC)
    entries = [
        (base, 80.0),
        (base + timedelta(days=1), 82.0),
        (base + timedelta(days=8), 90.0),
    ]
    values = moving_average(entries)
    assert values[0] == pytest.approx(80.0)
    assert values[1] == pytest.approx(81.0)
    assert values[2] == pytest.approx(90.0)  # first entry aged out of the 7-day window


def test_linear_trend_perfect_line():
    base = datetime(2026, 1, 1, tzinfo=UTC)
    entries = [(base + timedelta(days=i), 80.0 + 0.1 * i) for i in range(5)]
    trend = linear_trend(entries)
    assert trend is not None
    assert trend["slope_per_day"] == pytest.approx(0.1)
    assert trend["from_value"] == pytest.approx(80.0)
    assert trend["to_value"] == pytest.approx(80.4)
    assert linear_trend([(base, 80.0)]) is None


def test_linear_trend_zero_variance_returns_none():
    same = datetime(2026, 1, 1, tzinfo=UTC)
    assert linear_trend([(same, 80.0), (same, 81.0)]) is None


def test_bucket_start_in_user_timezone():
    # 2026-01-04 is a Sunday; 23:30 London = 23:30 UTC in winter.
    moment = datetime(2026, 1, 4, 23, 30, tzinfo=UTC)
    # ISO Monday start means the week containing Jan 4 begins Dec 29 00:00 London.
    week_start = bucket_start(moment, "Europe/London", "week")
    assert week_start == datetime(2025, 12, 29, 0, 0, tzinfo=UTC)
    assert bucket_start(moment, "Europe/London", "day") == datetime(2026, 1, 4, tzinfo=UTC)
    assert bucket_start(moment, "Europe/London", "month") == datetime(2026, 1, 1, tzinfo=UTC)
    assert bucket_start(moment, "Europe/London", "year") == datetime(2026, 1, 1, tzinfo=UTC)


def test_last_in_bucket_returns_last_entry_and_keeps_last_seen_tie():
    morning = datetime(2026, 1, 5, 8, 0, tzinfo=UTC)
    evening = datetime(2026, 1, 5, 20, 0, tzinfo=UTC)
    # Ordered by (measured_at, created_at); the duplicate evening timestamps
    # model a created_at tie-break, so the later-seen weight must win.
    entries = [(morning, 80.0), (evening, 79.0), (evening, 78.5)]
    assert last_in_bucket(entries, "UTC", "day") == [
        (datetime(2026, 1, 5, tzinfo=UTC), evening, 78.5)
    ]
