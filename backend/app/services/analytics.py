from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

EPLEY_MAX_REPS = 12
MOVING_AVERAGE_DAYS = 7
DAYS_PER_WEEK = 7
REQUIRED_RATE_TOLERANCE = 0.1
EXPIRED = "expired"


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


def required_rate_per_week(
    current_value: float | None,
    target_value: float | None,
    target_date: date | None,
    today: date | None = None,
) -> float | str | None:
    """Weekly change needed to reach ``target_value`` by ``target_date``.

    Negative means a required decrease (cut), positive a required gain (bulk).
    Returns ``"expired"`` when the target date is today or earlier (never
    divides by zero/negative weeks) and ``None`` when an input is missing.
    ``today`` lets callers pass the user's local date; it defaults to the UTC
    date for callers without a user timezone.
    """
    if current_value is None or target_value is None or target_date is None:
        return None
    if today is None:
        today = datetime.now(UTC).date()
    remaining_days = (target_date - today).days
    if remaining_days <= 0:
        return EXPIRED
    return (target_value - current_value) / (remaining_days / DAYS_PER_WEEK)


def compare_rate(
    trend_slope: float | None,
    required_rate: float | str | None,
    tolerance: float = REQUIRED_RATE_TOLERANCE,
) -> str | None:
    """Classify a trend slope against the required rate, direction-aware.

    A negative required rate is a cut (more negative slope = ahead); a positive
    required rate is a bulk (more positive slope = ahead).
    """
    if required_rate == EXPIRED:
        return EXPIRED
    if trend_slope is None or required_rate is None:
        return None
    delta = trend_slope - required_rate
    if abs(delta) <= tolerance:
        return "on_pace"
    if required_rate < 0:
        return "ahead" if delta < 0 else "behind"
    return "ahead" if delta > 0 else "behind"


def required_rate_line_points(
    start_date: date,
    start_value: float | None,
    target_value: float | None,
    target_date: date | None,
) -> list[tuple[date, float]] | None:
    """Weekly line points from ``start_date`` to the target, or None.

    Straight-line interpolation: the slope between consecutive weekly points
    equals ``required_rate_per_week``. ``None`` when inputs are missing or the
    target date is not after the start date (expired/invalid).
    """
    if start_value is None or target_value is None or target_date is None:
        return None
    total_days = (target_date - start_date).days
    if total_days <= 0:
        return None
    points = [(start_date, start_value)]
    step = DAYS_PER_WEEK
    while step < total_days:
        fraction = step / total_days
        points.append(
            (
                start_date + timedelta(days=step),
                start_value + (target_value - start_value) * fraction,
            )
        )
        step += DAYS_PER_WEEK
    points.append((target_date, target_value))
    return points


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
