import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest


def _log(auth_client, exercise_id, performed_at, sets):
    payload = {
        "id": str(uuid.uuid4()),
        "performed_at": performed_at.isoformat(),
        "exercises": [
            {
                "id": str(uuid.uuid4()),
                "exercise_id": exercise_id,
                "position": 0,
                "sets": [
                    {
                        "id": str(uuid.uuid4()),
                        "weight_kg": item.get("weight_kg"),
                        "reps": item["reps"],
                        "rpe": item.get("rpe"),
                        "is_warmup": item.get("is_warmup", False),
                    }
                    for item in sets
                ],
            }
        ],
    }
    response = auth_client.post("/api/workouts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _progress(auth_client, exercise_id, **params):
    response = auth_client.get(f"/api/exercises/{exercise_id}/progress", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _patch_goal(auth_client, exercise_id, **fields):
    response = auth_client.patch(f"/api/exercises/{exercise_id}", json=fields)
    assert response.status_code == 200, response.text
    return response.json()


def _future_date(weeks: int) -> str:
    return (datetime.now(UTC) + timedelta(weeks=weeks)).date().isoformat()


# --- PATCH goal fields -------------------------------------------------------


def test_patch_stores_and_clears_goal_fields(auth_client, exercise):
    target = _future_date(6)
    body = _patch_goal(
        auth_client,
        exercise["id"],
        goal_weight_kg=100.0,
        goal_reps=5,
        goal_target_date=target,
        goal_reps_bodyweight=12,
    )
    assert body["goal_weight_kg"] == 100.0
    assert body["goal_reps"] == 5
    assert body["goal_target_date"] == target
    assert body["goal_reps_bodyweight"] == 12

    listed = auth_client.get("/api/exercises").json()
    assert listed[0]["goal_weight_kg"] == 100.0
    assert listed[0]["goal_reps_bodyweight"] == 12

    cleared = _patch_goal(
        auth_client,
        exercise["id"],
        goal_weight_kg=None,
        goal_reps=None,
        goal_target_date=None,
        goal_reps_bodyweight=None,
    )
    assert cleared["goal_weight_kg"] is None
    assert cleared["goal_reps"] is None
    assert cleared["goal_target_date"] is None
    assert cleared["goal_reps_bodyweight"] is None


def test_patch_target_date_requires_a_target_value(auth_client, exercise):
    target = _future_date(6)
    missing = auth_client.patch(
        f"/api/exercises/{exercise['id']}", json={"goal_target_date": target}
    )
    assert missing.status_code == 422

    reps_only = auth_client.patch(
        f"/api/exercises/{exercise['id']}",
        json={"goal_reps": 5, "goal_target_date": target},
    )
    assert reps_only.status_code == 422

    ok = _patch_goal(
        auth_client, exercise["id"], goal_weight_kg=100.0, goal_target_date=target
    )
    assert ok["goal_target_date"] == target

    dangling = auth_client.patch(
        f"/api/exercises/{exercise['id']}", json={"goal_weight_kg": None}
    )
    assert dangling.status_code == 422  # date would be left without a target

    cleared = _patch_goal(
        auth_client, exercise["id"], goal_weight_kg=None, goal_target_date=None
    )
    assert cleared["goal_target_date"] is None


def test_patch_bodyweight_goal_with_date_is_valid(auth_client, exercise):
    target = _future_date(6)
    body = _patch_goal(
        auth_client, exercise["id"], goal_reps_bodyweight=15, goal_target_date=target
    )
    assert body["goal_reps_bodyweight"] == 15
    assert body["goal_target_date"] == target


def test_patch_goal_value_validation(auth_client, exercise):
    for payload in (
        {"goal_weight_kg": 0},
        {"goal_weight_kg": -5},
        {"goal_reps": 0},
        {"goal_reps_bodyweight": 0},
    ):
        response = auth_client.patch(f"/api/exercises/{exercise['id']}", json=payload)
        assert response.status_code == 422, payload


def test_patch_non_goal_fields_still_reject_null(auth_client, exercise):
    response = auth_client.patch(f"/api/exercises/{exercise['id']}", json={"name": None})
    assert response.status_code == 422


# --- reps query parameter ----------------------------------------------------


def test_reps_param_must_be_within_one_and_twelve(auth_client, exercise):
    for value in (0, 13, -1):
        response = auth_client.get(
            f"/api/exercises/{exercise['id']}/progress", params={"reps": value}
        )
        assert response.status_code == 422, value
    for value in (1, 12):
        response = auth_client.get(
            f"/api/exercises/{exercise['id']}/progress", params={"reps": value}
        )
        assert response.status_code == 200, value


def test_estimated_weight_at_reps_null_when_param_absent(auth_client, exercise):
    body = _progress(auth_client, exercise["id"])
    assert body["estimated_weight_at_reps"] is None


def test_estimated_weight_at_reps_inverse_epley(auth_client, exercise):
    now = datetime.now(UTC)
    # Best e1RM for the session: 120 * (1 + 5/30) = 140 kg.
    _log(
        auth_client,
        exercise["id"],
        now - timedelta(days=1),
        [
            {"weight_kg": 200.0, "reps": 1, "is_warmup": True},
            {"weight_kg": 120.0, "reps": 5},
            {"weight_kg": 100.0, "reps": 10},
            {"weight_kg": 80.0, "reps": 13},
        ],
    )
    # Bodyweight-only session: no eligible e1RM, omitted from the list.
    _log(auth_client, exercise["id"], now, [{"reps": 20}])

    at_five = _progress(auth_client, exercise["id"], reps=5)["estimated_weight_at_reps"]
    assert len(at_five) == 1
    assert at_five[0]["weight_kg"] == pytest.approx(120.0)
    assert datetime.fromisoformat(at_five[0]["performed_at"]) == now - timedelta(days=1)

    at_three = _progress(auth_client, exercise["id"], reps=3)["estimated_weight_at_reps"]
    assert at_three[0]["weight_kg"] == pytest.approx(140 / (1 + 3 / 30))
    assert at_three[0]["weight_kg"] == pytest.approx(127.2727, rel=1e-4)


# --- sets per week -----------------------------------------------------------


def test_sets_per_week_buckets_by_user_timezone(auth_client, db, user, exercise):
    user.timezone = "America/Los_Angeles"
    db.commit()
    sunday = datetime(2026, 9, 20, 23, 30, tzinfo=ZoneInfo("America/Los_Angeles"))
    monday = datetime(2026, 9, 21, 0, 30, tzinfo=ZoneInfo("America/Los_Angeles"))
    _log(
        auth_client,
        exercise["id"],
        sunday,
        [
            {"weight_kg": 60.0, "reps": 5},
            {"weight_kg": 90.0, "reps": 5, "is_warmup": True},
        ],
    )
    _log(auth_client, exercise["id"], monday, [{"weight_kg": 60.0, "reps": 5}])

    body = _progress(auth_client, exercise["id"])
    assert body["sets_per_week"] == [
        {"week_start": "2026-09-14T07:00:00Z", "sets": 1},
        {"week_start": "2026-09-21T07:00:00Z", "sets": 1},
    ]


# --- average RPE -------------------------------------------------------------


def test_avg_rpe_skips_warmups_and_null_rpe(auth_client, exercise):
    base = datetime.now(UTC) - timedelta(days=2)
    _log(
        auth_client,
        exercise["id"],
        base,
        [
            {"weight_kg": 60.0, "reps": 5, "rpe": 8.0},
            {"weight_kg": 60.0, "reps": 5, "rpe": 9.0},
            {"weight_kg": 100.0, "reps": 1, "rpe": 10.0, "is_warmup": True},
            {"weight_kg": 60.0, "reps": 5},
        ],
    )
    # Session with no RPE at all is skipped.
    _log(auth_client, exercise["id"], base + timedelta(days=1), [{"weight_kg": 60.0, "reps": 5}])
    _log(
        auth_client,
        exercise["id"],
        base + timedelta(days=2),
        [{"weight_kg": 60.0, "reps": 5, "rpe": 7.0}],
    )

    body = _progress(auth_client, exercise["id"])
    assert [point["avg_rpe"] for point in body["avg_rpe"]] == [pytest.approx(8.5), 7.0]


# --- goal: null / precedence -------------------------------------------------


def test_goal_null_without_goals(auth_client, exercise):
    body = _progress(auth_client, exercise["id"])
    assert body["goal"] is None
    assert body["sets_per_week"] == []
    assert body["avg_rpe"] == []


def test_weight_goal_takes_precedence_over_bodyweight(auth_client, exercise):
    _patch_goal(
        auth_client,
        exercise["id"],
        goal_weight_kg=100.0,
        goal_reps=5,
        goal_reps_bodyweight=20,
    )
    now = datetime.now(UTC)
    _log(auth_client, exercise["id"], now - timedelta(days=7), [{"weight_kg": 90.0, "reps": 5}])
    _log(auth_client, exercise["id"], now, [{"weight_kg": 92.0, "reps": 5}])

    goal = _progress(auth_client, exercise["id"])["goal"]
    assert goal["mode"] == "weight"
    assert goal["weight_kg"] == 100.0
    assert goal["reps"] == 5
    assert goal["target_date"] is None
    assert goal["required_rate_line"] is None
    assert goal["estimate_date"] is not None


# --- weighted dated goal -----------------------------------------------------


def test_weight_goal_required_rate_line_and_on_track(auth_client, exercise):
    target_date = _future_date(4)
    _patch_goal(
        auth_client, exercise["id"], goal_weight_kg=100.0, goal_target_date=target_date
    )
    now = datetime.now(UTC)
    for days, weight in ((21, 87.0), (14, 88.0), (7, 89.0), (0, 90.0)):
        _log(
            auth_client,
            exercise["id"],
            now - timedelta(days=days),
            [{"weight_kg": weight, "reps": 5}],
        )

    goal = _progress(auth_client, exercise["id"])["goal"]
    assert goal["mode"] == "weight"
    assert goal["weight_kg"] == 100.0
    assert goal["reps"] is None
    assert goal["target_date"] == target_date
    # trend +1.0 kg/week vs required (100-90)/4 = +2.5 kg/week -> behind
    assert goal["on_track"] == "behind"

    line = goal["required_rate_line"]
    assert line[0]["date"] == datetime.now(UTC).date().isoformat()
    assert line[0]["weight_kg"] == pytest.approx(90.0)
    assert all(point["reps"] is None for point in line)
    assert line[-1]["date"] == target_date
    assert line[-1]["weight_kg"] == pytest.approx(100.0)
    assert len(line) == 5


def test_bodyweight_goal_required_rate_line_and_on_track(auth_client, exercise):
    target_date = _future_date(4)
    _patch_goal(
        auth_client,
        exercise["id"],
        goal_reps_bodyweight=20,
        goal_target_date=target_date,
    )
    now = datetime.now(UTC)
    for days, reps in ((7, 10), (0, 13)):
        _log(auth_client, exercise["id"], now - timedelta(days=days), [{"reps": reps}])

    goal = _progress(auth_client, exercise["id"])["goal"]
    assert goal["mode"] == "bodyweight"
    assert goal["weight_kg"] is None
    assert goal["reps"] == 20
    # trend +3 reps/week vs required (20-13)/4 = +1.75 -> ahead
    assert goal["on_track"] == "ahead"

    line = goal["required_rate_line"]
    assert line[0]["date"] == datetime.now(UTC).date().isoformat()
    assert line[0]["reps"] == pytest.approx(13.0)
    assert all(point["weight_kg"] is None for point in line)
    assert line[-1]["reps"] == pytest.approx(20.0)


def test_goal_expired_when_target_date_passed(auth_client, exercise):
    target_date = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
    _patch_goal(
        auth_client, exercise["id"], goal_weight_kg=100.0, goal_target_date=target_date
    )
    _log(auth_client, exercise["id"], datetime.now(UTC), [{"weight_kg": 90.0, "reps": 5}])

    goal = _progress(auth_client, exercise["id"])["goal"]
    assert goal["on_track"] == "expired"
    assert goal["required_rate_line"] is None


# --- estimate date -----------------------------------------------------------


def test_estimate_date_from_linear_trend(auth_client, exercise):
    _patch_goal(auth_client, exercise["id"], goal_weight_kg=108.0)
    now = datetime.now(UTC)
    for days, weight in ((14, 90.0), (7, 93.0), (0, 96.0)):
        _log(
            auth_client,
            exercise["id"],
            now - timedelta(days=days),
            [{"weight_kg": weight, "reps": 5}],
        )

    goal = _progress(auth_client, exercise["id"])["goal"]
    assert goal["estimate_date"] == (now + timedelta(days=28)).date().isoformat()


def test_estimate_date_null_when_flat_moving_away_or_insufficient(auth_client, exercise):
    now = datetime.now(UTC)
    _patch_goal(auth_client, exercise["id"], goal_weight_kg=100.0)
    _log(auth_client, exercise["id"], now - timedelta(days=7), [{"weight_kg": 90.0, "reps": 5}])
    _log(auth_client, exercise["id"], now, [{"weight_kg": 90.0, "reps": 5}])
    flat = _progress(auth_client, exercise["id"])["goal"]
    assert flat["estimate_date"] is None
    assert flat["on_track"] is None

    other = auth_client.post("/api/exercises", json={"name": "Overhead Press"}).json()
    _patch_goal(auth_client, other["id"], goal_weight_kg=100.0)
    _log(auth_client, other["id"], now - timedelta(days=7), [{"weight_kg": 90.0, "reps": 5}])
    _log(auth_client, other["id"], now, [{"weight_kg": 88.0, "reps": 5}])
    assert _progress(auth_client, other["id"])["goal"]["estimate_date"] is None

    third = auth_client.post("/api/exercises", json={"name": "Deadlift"}).json()
    _patch_goal(auth_client, third["id"], goal_weight_kg=100.0)
    _log(auth_client, third["id"], now, [{"weight_kg": 90.0, "reps": 5}])
    assert _progress(auth_client, third["id"])["goal"]["estimate_date"] is None
