import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.models import CardioActivity, User

PR_TIME = "2026-08-03T06:00:00Z"
TIE_EARLIER = "2026-08-01T06:00:00Z"
TIE_LATER = "2026-08-02T06:00:00Z"


def _create(
    auth_client,
    *,
    performed_at: str,
    distance_m: float | None = 5000,
    duration_s: int = 1500,
    type: str = "run",
    avg_hr: int | None = None,
    splits: list[dict] | None = None,
):
    payload = {
        "performed_at": performed_at,
        "type": type,
        "distance_m": distance_m,
        "duration_s": duration_s,
    }
    if avg_hr is not None:
        payload["avg_hr"] = avg_hr
    if splits is not None:
        payload["splits"] = splits
    response = auth_client.post("/api/cardio", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _week_start(weeks_ago: int = 0, tz: str = "UTC") -> date:
    local = datetime.now(UTC).astimezone(ZoneInfo(tz))
    monday = local.date() - timedelta(days=local.weekday())
    return monday - timedelta(weeks=weeks_ago)


def _at(week_start: date, day_offset: int = 0, hour: int = 6, tz: str = "UTC") -> str:
    local = datetime.combine(
        week_start + timedelta(days=day_offset), time(hour), tzinfo=ZoneInfo(tz)
    )
    return local.astimezone(UTC).isoformat()


def test_fastest_1k_and_5k_from_known_splits(auth_client):
    created = _create(
        auth_client,
        performed_at=PR_TIME,
        distance_m=5000,
        duration_s=1440,
        splits=[
            {"distance_m": 1000, "duration_s": 300},
            {"distance_m": 1000, "duration_s": 280},
            {"distance_m": 1000, "duration_s": 290},
            {"distance_m": 1000, "duration_s": 260},
            {"distance_m": 1000, "duration_s": 310},
        ],
    )
    prs = auth_client.get("/api/cardio/prs").json()
    assert prs["fastest_1k"]["cardio_activity_id"] == created["id"]
    assert prs["fastest_1k"]["value"] == 260
    assert prs["fastest_1k"]["performed_at"].startswith("2026-08-03T06:00:00")
    assert prs["fastest_5k"]["cardio_activity_id"] == created["id"]
    assert prs["fastest_5k"]["value"] == 1440
    assert prs["fastest_10k"] is None


def test_mixed_distance_splits_satisfy_1k_window(auth_client):
    created = _create(
        auth_client,
        performed_at=PR_TIME,
        distance_m=1000,
        duration_s=250,
        splits=[
            {"distance_m": 400, "duration_s": 100},
            {"distance_m": 600, "duration_s": 150},
        ],
    )
    prs = auth_client.get("/api/cardio/prs").json()
    assert prs["fastest_1k"]["cardio_activity_id"] == created["id"]
    assert prs["fastest_1k"]["value"] == 250
    assert prs["fastest_5k"] is None
    assert prs["fastest_10k"] is None


def test_windows_short_of_target_yield_no_fastest_pr(auth_client):
    _create(
        auth_client,
        performed_at=PR_TIME,
        distance_m=900,
        duration_s=280,
        splits=[
            {"distance_m": 500, "duration_s": 150},
            {"distance_m": 400, "duration_s": 130},
        ],
    )
    prs = auth_client.get("/api/cardio/prs").json()
    assert prs["fastest_1k"] is None
    assert prs["fastest_5k"] is None
    assert prs["longest_distance"]["value"] == 900


def test_fastest_tie_prefers_earliest_activity(auth_client):
    later = _create(
        auth_client,
        performed_at=TIE_LATER,
        distance_m=1000,
        duration_s=300,
        splits=[{"distance_m": 1000, "duration_s": 300}],
    )
    earlier = _create(
        auth_client,
        performed_at=TIE_EARLIER,
        distance_m=1000,
        duration_s=300,
        splits=[{"distance_m": 1000, "duration_s": 300}],
    )
    assert later["id"] != earlier["id"]
    prs = auth_client.get("/api/cardio/prs").json()
    assert prs["fastest_1k"]["cardio_activity_id"] == earlier["id"]
    assert prs["fastest_1k"]["value"] == 300
    assert prs["fastest_1k"]["performed_at"].startswith("2026-08-01T06:00:00")


def test_activities_without_splits_only_contribute_longest(auth_client):
    created = _create(auth_client, performed_at=PR_TIME, distance_m=10000, duration_s=3000)
    prs = auth_client.get("/api/cardio/prs").json()
    assert prs["fastest_1k"] is None
    assert prs["fastest_5k"] is None
    assert prs["fastest_10k"] is None
    assert prs["longest_distance"]["cardio_activity_id"] == created["id"]
    assert prs["longest_distance"]["value"] == 10000
    assert prs["longest_duration"]["cardio_activity_id"] == created["id"]
    assert prs["longest_duration"]["value"] == 3000


def test_longest_distance_and_duration_pick_maxima(auth_client):
    _create(auth_client, performed_at="2026-08-03T06:00:00Z", distance_m=5000, duration_s=1800)
    longest = _create(
        auth_client, performed_at="2026-08-04T06:00:00Z", distance_m=12000, duration_s=4200
    )
    timed = _create(
        auth_client, performed_at="2026-08-05T06:00:00Z", distance_m=None, duration_s=7200
    )
    prs = auth_client.get("/api/cardio/prs").json()
    assert prs["longest_distance"]["cardio_activity_id"] == longest["id"]
    assert prs["longest_distance"]["value"] == 12000
    assert prs["longest_duration"]["cardio_activity_id"] == timed["id"]
    assert prs["longest_duration"]["value"] == 7200


def test_prs_null_without_activities(auth_client):
    assert auth_client.get("/api/cardio/prs").json() == {
        "fastest_1k": None,
        "fastest_5k": None,
        "fastest_10k": None,
        "longest_distance": None,
        "longest_duration": None,
    }


def test_prs_ignore_other_users_activities(auth_client, db):
    other = User(id=uuid.uuid4(), username="other", password_hash="x")
    db.add(other)
    db.commit()
    db.add(
        CardioActivity(
            id=uuid.uuid4(),
            user_id=other.id,
            performed_at=datetime(2026, 8, 1, 6, tzinfo=UTC),
            type="run",
            distance_m=40000,
            duration_s=9999,
        )
    )
    db.commit()
    prs = auth_client.get("/api/cardio/prs").json()
    assert prs["longest_distance"] is None
    assert prs["longest_duration"] is None


def test_zones_null_without_max_hr(auth_client):
    created = _create(auth_client, performed_at=PR_TIME, avg_hr=150)
    assert auth_client.get(f"/api/cardio/{created['id']}/zones").json() is None


@pytest.mark.parametrize(
    ("avg_hr", "expected_zone"),
    [
        (80, "Z1"),
        (100, "Z1"),
        (119, "Z1"),
        (120, "Z2"),
        (139, "Z2"),
        (140, "Z3"),
        (159, "Z3"),
        (160, "Z4"),
        (179, "Z4"),
        (180, "Z5"),
        (199, "Z5"),
        (200, "Z5"),
        (210, "Z5"),
    ],
)
def test_zone_boundaries_and_clamping(auth_client, avg_hr, expected_zone):
    auth_client.patch("/api/settings", json={"max_hr": 200})
    created = _create(auth_client, performed_at=PR_TIME, duration_s=1800, avg_hr=avg_hr)
    body = auth_client.get(f"/api/cardio/{created['id']}/zones").json()
    assert body["max_hr"] == 200
    assert [zone["zone"] for zone in body["zones"]] == ["Z1", "Z2", "Z3", "Z4", "Z5"]
    seconds = {zone["zone"]: zone["seconds"] for zone in body["zones"]}
    assert seconds[expected_zone] == 1800
    assert sum(seconds.values()) == 1800


def test_zone_labels(auth_client):
    auth_client.patch("/api/settings", json={"max_hr": 200})
    created = _create(auth_client, performed_at=PR_TIME, avg_hr=150)
    body = auth_client.get(f"/api/cardio/{created['id']}/zones").json()
    assert [zone["label"] for zone in body["zones"]] == [
        "50-60%",
        "60-70%",
        "70-80%",
        "80-90%",
        "90-100%",
    ]


def test_zones_null_avg_hr_gives_all_zero(auth_client):
    auth_client.patch("/api/settings", json={"max_hr": 200})
    created = _create(auth_client, performed_at=PR_TIME, duration_s=1200)
    body = auth_client.get(f"/api/cardio/{created['id']}/zones").json()
    assert body["max_hr"] == 200
    assert [zone["seconds"] for zone in body["zones"]] == [0, 0, 0, 0, 0]


def test_zones_ownership_404(auth_client, db):
    other = User(id=uuid.uuid4(), username="other", password_hash="x")
    db.add(other)
    db.commit()
    foreign = CardioActivity(
        id=uuid.uuid4(),
        user_id=other.id,
        performed_at=datetime(2026, 8, 1, 6, tzinfo=UTC),
        type="run",
        duration_s=600,
        avg_hr=150,
    )
    db.add(foreign)
    db.commit()
    assert auth_client.get(f"/api/cardio/{foreign.id}/zones").status_code == 404
    assert auth_client.get(f"/api/cardio/{uuid.uuid4()}/zones").status_code == 404


def test_streaks_current_and_longest(auth_client):
    for weeks_ago in (11, 10, 9, 8, 2, 1, 0):
        _create(
            auth_client,
            performed_at=_at(_week_start(weeks_ago), day_offset=2),
            distance_m=5000,
        )
    body = auth_client.get("/api/cardio/streaks").json()
    assert body["current_weeks"] == 3
    assert body["longest_weeks"] == 4
    assert [item["week_start"] for item in body["weekly_counts"]] == [
        _week_start(weeks_ago).isoformat() for weeks_ago in range(11, -1, -1)
    ]
    assert [item["count"] for item in body["weekly_counts"]] == [1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1]
    assert [item["distance_m"] for item in body["weekly_counts"]] == [
        5000.0, 5000.0, 5000.0, 5000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 5000.0, 5000.0, 5000.0
    ]


def test_streaks_empty_current_week_counts_from_previous(auth_client):
    for weeks_ago in (3, 2, 1):
        _create(auth_client, performed_at=_at(_week_start(weeks_ago)), distance_m=3000)
    body = auth_client.get("/api/cardio/streaks").json()
    assert body["current_weeks"] == 3
    assert body["longest_weeks"] == 3
    assert [item["count"] for item in body["weekly_counts"]] == [0] * 8 + [1, 1, 1, 0]


def test_streaks_empty_previous_week_breaks_current(auth_client):
    for weeks_ago in (3, 2):
        _create(auth_client, performed_at=_at(_week_start(weeks_ago)))
    body = auth_client.get("/api/cardio/streaks").json()
    assert body["current_weeks"] == 0
    assert body["longest_weeks"] == 2


def test_streaks_count_runs_only(auth_client):
    _create(auth_client, performed_at=_at(_week_start(0)), type="cycle", distance_m=20000)
    _create(auth_client, performed_at=_at(_week_start(1)), type="run", distance_m=5000)
    body = auth_client.get("/api/cardio/streaks").json()
    assert body["current_weeks"] == 1
    assert body["weekly_counts"][-1]["count"] == 0
    assert body["weekly_counts"][-2]["count"] == 1


def test_streaks_bucket_in_user_timezone(auth_client):
    auth_client.patch("/api/settings", json={"timezone": "America/New_York"})
    monday = _week_start(0, tz="America/New_York")
    sunday_evening = _at(monday, day_offset=6, hour=21, tz="America/New_York")
    assert sunday_evening.startswith(f"{monday + timedelta(days=7)}")
    _create(auth_client, performed_at=sunday_evening, distance_m=5000)
    body = auth_client.get("/api/cardio/streaks").json()
    assert body["weekly_counts"][-1]["week_start"] == monday.isoformat()
    assert body["weekly_counts"][-1]["count"] == 1
    assert body["current_weeks"] == 1


def test_streaks_empty_without_activities(auth_client):
    body = auth_client.get("/api/cardio/streaks").json()
    assert body["current_weeks"] == 0
    assert body["longest_weeks"] == 0
    assert len(body["weekly_counts"]) == 12
    assert all(item["count"] == 0 and item["distance_m"] == 0 for item in body["weekly_counts"])


def test_streaks_ignore_other_users_activities(auth_client, db):
    other = User(id=uuid.uuid4(), username="other", password_hash="x")
    db.add(other)
    db.commit()
    db.add(
        CardioActivity(
            id=uuid.uuid4(),
            user_id=other.id,
            performed_at=datetime.now(UTC),
            type="run",
            distance_m=5000,
            duration_s=1500,
        )
    )
    db.commit()
    body = auth_client.get("/api/cardio/streaks").json()
    assert body["current_weeks"] == 0
    assert body["longest_weeks"] == 0


def test_comparison_totals_with_zero_weeks_averaged(auth_client):
    for distance, duration in ((10000, 3000), (5000, 1600)):
        _create(
            auth_client,
            performed_at=_at(_week_start(0)),
            distance_m=distance,
            duration_s=duration,
        )
    _create(auth_client, performed_at=_at(_week_start(1)), distance_m=8000, duration_s=2400)
    _create(auth_client, performed_at=_at(_week_start(3)), distance_m=7000, duration_s=2200)

    body = auth_client.get("/api/cardio/comparison").json()

    assert body["this_week"]["total_distance_m"] == 15000
    assert body["this_week"]["total_duration_s"] == 4600
    assert body["this_week"]["activity_count"] == 2
    assert body["this_week"]["avg_pace_s_per_km"] == pytest.approx(4600 / 15)

    assert body["last_week"]["total_distance_m"] == 8000
    assert body["last_week"]["total_duration_s"] == 2400
    assert body["last_week"]["activity_count"] == 1
    assert body["last_week"]["avg_pace_s_per_km"] == pytest.approx(300.0)

    average = body["four_week_average"]
    assert average["total_distance_m"] == pytest.approx(3750.0)
    assert average["total_duration_s"] == pytest.approx(1150.0)
    assert average["activity_count"] == pytest.approx(0.5)
    assert average["avg_pace_s_per_km"] == pytest.approx(1150 / 3.75)


def test_comparison_defaults_to_runs_and_type_override(auth_client):
    _create(auth_client, performed_at=_at(_week_start(0)), distance_m=5000, duration_s=1500)
    _create(
        auth_client,
        performed_at=_at(_week_start(0)),
        type="cycle",
        distance_m=20000,
        duration_s=4000,
    )
    default = auth_client.get("/api/cardio/comparison").json()
    assert default["this_week"]["total_distance_m"] == 5000
    assert default["this_week"]["activity_count"] == 1

    cycling = auth_client.get("/api/cardio/comparison?type=cycle").json()
    assert cycling["this_week"]["total_distance_m"] == 20000
    assert cycling["this_week"]["total_duration_s"] == 4000
    assert cycling["this_week"]["activity_count"] == 1


def test_comparison_zero_week_average_pace_is_null(auth_client):
    body = auth_client.get("/api/cardio/comparison").json()
    assert body["this_week"]["total_distance_m"] == 0
    assert body["this_week"]["avg_pace_s_per_km"] is None
    assert body["four_week_average"]["activity_count"] == 0
    assert body["four_week_average"]["avg_pace_s_per_km"] is None


def test_comparison_buckets_in_user_timezone(auth_client):
    auth_client.patch("/api/settings", json={"timezone": "America/New_York"})
    monday = _week_start(0, tz="America/New_York")
    sunday_evening = _at(monday, day_offset=6, hour=21, tz="America/New_York")
    _create(auth_client, performed_at=sunday_evening, distance_m=5000, duration_s=1500)
    body = auth_client.get("/api/cardio/comparison").json()
    assert body["this_week"]["activity_count"] == 1
    assert body["this_week"]["total_distance_m"] == 5000


def test_running_endpoints_require_auth(client):
    for path in ("/api/cardio/prs", "/api/cardio/streaks", "/api/cardio/comparison"):
        assert client.get(path).status_code == 401
    assert client.get(f"/api/cardio/{uuid.uuid4()}/zones").status_code == 401
