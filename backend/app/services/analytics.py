from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

EPLEY_MAX_REPS = 12
MOVING_AVERAGE_DAYS = 7


def epley_1rm(weight_kg: float | None, reps: int) -> float | None:
    if weight_kg is None or reps < 1 or reps > EPLEY_MAX_REPS:
        return None
    return weight_kg * (1 + reps / 30)


def session_volume_kg(sets) -> float:
    return sum(s.weight_kg * s.reps for s in sets if not s.is_warmup and s.weight_kg is not None)


def session_reps_volume(sets) -> int:
    return sum(s.reps for s in sets if not s.is_warmup)


def pace_s_per_km(distance_m: float | None, duration_s: int) -> float | None:
    if not distance_m:
        return None
    return duration_s / (distance_m / 1000)


def moving_average(entries, window_days: int = MOVING_AVERAGE_DAYS):
    values = []
    for index, (moment, _weight) in enumerate(entries):
        window_start = moment - timedelta(days=window_days)
        window = [w for t, w in entries[: index + 1] if window_start < t <= moment]
        values.append(sum(window) / len(window))
    return values


def linear_trend(entries):
    if len(entries) < 2:
        return None
    base = entries[0][0]
    xs = [(t - base).total_seconds() / 86400 for t, _ in entries]
    ys = [w for _, w in entries]
    n = len(xs)
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator == 0:
        return None
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=False)) / denominator
    intercept = mean_y - slope * mean_x
    return {
        "slope_per_day": slope,
        "intercept": intercept,
        "from_value": intercept,
        "to_value": intercept + slope * xs[-1],
    }


def _local(dt_utc: datetime, tz: str) -> datetime:
    return dt_utc.astimezone(ZoneInfo(tz))


def bucket_start(dt_utc: datetime, tz: str, bucket: str) -> datetime:
    local = _local(dt_utc, tz)
    if bucket == "day":
        start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    elif bucket == "week":
        start = (local - timedelta(days=local.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    elif bucket == "month":
        start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif bucket == "year":
        start = local.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        raise ValueError(f"unknown bucket: {bucket}")
    return start.astimezone(UTC)


def last_in_bucket(entries, tz: str, bucket: str):
    """Return (bucket_start, measured_at, weight_kg) per bucket, ascending.

    Callers must pass entries ordered by (measured_at, created_at); equal
    timestamps keep the later-seen row (matches the spec's created_at tie-break).
    """
    grouped: dict[datetime, tuple[datetime, float]] = {}
    for moment, weight in entries:
        key = bucket_start(moment, tz, bucket)
        current = grouped.get(key)
        if current is None or moment >= current[0]:
            grouped[key] = (moment, weight)
    return [(key, grouped[key][0], grouped[key][1]) for key in sorted(grouped)]
