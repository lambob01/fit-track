from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CardioActivity, CardioSplit, User
from app.services.analytics import pace_s_per_km

FASTEST_TARGETS = {"fastest_1k": 1000.0, "fastest_5k": 5000.0, "fastest_10k": 10000.0}
FASTEST_KEYS = tuple(FASTEST_TARGETS)
HR_ZONE_BANDS = (
    ("Z1", "50-60%", 5, 6),
    ("Z2", "60-70%", 6, 7),
    ("Z3", "70-80%", 7, 8),
    ("Z4", "80-90%", 8, 9),
    ("Z5", "90-100%", 9, 10),
)
STREAK_WEEKS = 12
_DISTANCE_EPSILON = 1e-6


@dataclass(frozen=True)
class PrResult:
    cardio_activity_id: UUID
    performed_at: datetime
    value: float


@dataclass(frozen=True)
class ZoneBand:
    zone: str
    label: str
    seconds: int


@dataclass(frozen=True)
class ZonesResult:
    max_hr: int
    zones: list[ZoneBand]


@dataclass(frozen=True)
class WeekCount:
    week_start: date
    count: int
    distance_m: float


@dataclass(frozen=True)
class StreakStats:
    current_weeks: int
    longest_weeks: int
    weekly_counts: list[WeekCount]


@dataclass(frozen=True)
class WeekTotals:
    total_distance_m: float
    total_duration_s: float
    activity_count: float
    avg_pace_s_per_km: float | None


@dataclass(frozen=True)
class Comparison:
    this_week: WeekTotals
    last_week: WeekTotals
    four_week_average: WeekTotals


def _stored_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def local_week_start(moment: datetime, tz: str) -> date:
    local = moment.astimezone(ZoneInfo(tz))
    return (local - timedelta(days=local.weekday())).date()


def week_bounds_utc(tz: str, week_start: date) -> tuple[datetime, datetime]:
    tzinfo = ZoneInfo(tz)
    local_start = datetime.combine(week_start, time.min, tzinfo=tzinfo)
    return local_start.astimezone(UTC), (local_start + timedelta(days=7)).astimezone(UTC)


def _keep_greater(current: PrResult | None, candidate: PrResult) -> PrResult:
    if current is None or candidate.value > current.value:
        return candidate
    if candidate.value == current.value and candidate.performed_at < current.performed_at:
        return candidate
    return current


def _keep_faster(current: PrResult | None, candidate: PrResult) -> PrResult:
    if current is None or candidate.value < current.value:
        return candidate
    if candidate.value == current.value and candidate.performed_at < current.performed_at:
        return candidate
    return current


def _fastest_window(splits: list[CardioSplit], target_m: float) -> int | None:
    """Minimum summed duration of a contiguous split window reaching ``target_m``.

    Splits are positive, so for a fixed start the first window that reaches the
    target is also the shortest one for that start; extending it only adds time.
    """
    best: int | None = None
    count = len(splits)
    for start in range(count):
        distance = 0.0
        duration = 0
        for end in range(start, count):
            distance += splits[end].distance_m
            duration += splits[end].duration_s
            if distance >= target_m - _DISTANCE_EPSILON:
                if best is None or duration < best:
                    best = duration
                break
    return best


def personal_records(db: Session, user: User) -> dict[str, PrResult | None]:
    records: dict[str, PrResult | None] = {key: None for key in FASTEST_KEYS}
    records["longest_distance"] = None
    records["longest_duration"] = None

    activities = db.scalars(
        select(CardioActivity).where(CardioActivity.user_id == user.id)
    ).all()
    for activity in activities:
        performed_at = _stored_utc(activity.performed_at)
        if activity.distance_m is not None:
            records["longest_distance"] = _keep_greater(
                records["longest_distance"],
                PrResult(activity.id, performed_at, float(activity.distance_m)),
            )
        records["longest_duration"] = _keep_greater(
            records["longest_duration"],
            PrResult(activity.id, performed_at, float(activity.duration_s)),
        )

    split_rows = db.execute(
        select(CardioSplit, CardioActivity.id, CardioActivity.performed_at)
        .join(CardioActivity, CardioSplit.cardio_activity_id == CardioActivity.id)
        .where(CardioActivity.user_id == user.id)
        .order_by(
            CardioActivity.performed_at, CardioActivity.id, CardioSplit.split_number
        )
    ).all()
    grouped: dict[UUID, list[CardioSplit]] = {}
    moments: dict[UUID, datetime] = {}
    for split, activity_id, performed_at in split_rows:
        if activity_id not in grouped:
            grouped[activity_id] = []
            moments[activity_id] = _stored_utc(performed_at)
        grouped[activity_id].append(split)

    for activity_id, splits in grouped.items():
        for key, target_m in FASTEST_TARGETS.items():
            duration = _fastest_window(splits, target_m)
            if duration is None:
                continue
            records[key] = _keep_faster(
                records[key],
                PrResult(activity_id, moments[activity_id], float(duration)),
            )
    return records


def _zone_index(max_hr: int, avg_hr: int) -> int:
    scaled = avg_hr * 10
    if scaled < max_hr * HR_ZONE_BANDS[0][2]:
        return 0
    for index, (_, _, _, upper) in enumerate(HR_ZONE_BANDS):
        if scaled < max_hr * upper:
            return index
    return len(HR_ZONE_BANDS) - 1


def hr_zones(user: User, activity: CardioActivity) -> ZonesResult | None:
    if user.max_hr is None:
        return None
    seconds = [0] * len(HR_ZONE_BANDS)
    if activity.avg_hr is not None:
        seconds[_zone_index(user.max_hr, activity.avg_hr)] = activity.duration_s
    return ZonesResult(
        max_hr=user.max_hr,
        zones=[
            ZoneBand(zone=zone, label=label, seconds=seconds[index])
            for index, (zone, label, _, _) in enumerate(HR_ZONE_BANDS)
        ],
    )


def streak_stats(db: Session, user: User, now: datetime | None = None) -> StreakStats:
    moment = now if now is not None else datetime.now(UTC)
    current = local_week_start(moment, user.timezone)
    runs = db.execute(
        select(CardioActivity.performed_at, CardioActivity.distance_m).where(
            CardioActivity.user_id == user.id,
            CardioActivity.type == "run",
        )
    ).all()

    run_counts: dict[date, int] = {}
    run_distances: dict[date, float] = {}
    for performed_at, distance_m in runs:
        week = local_week_start(_stored_utc(performed_at), user.timezone)
        run_counts[week] = run_counts.get(week, 0) + 1
        run_distances[week] = run_distances.get(week, 0.0) + float(distance_m or 0.0)

    active_weeks = sorted(run_counts)
    longest = 0
    streak = 0
    previous: date | None = None
    for week in active_weeks:
        if previous is not None and (week - previous).days == 7:
            streak += 1
        else:
            streak = 1
        longest = max(longest, streak)
        previous = week

    start = current if current in run_counts else current - timedelta(days=7)
    current_weeks = 0
    week = start
    while week in run_counts:
        current_weeks += 1
        week -= timedelta(days=7)

    weekly_counts = []
    for offset in range(STREAK_WEEKS - 1, -1, -1):
        week = current - timedelta(weeks=offset)
        weekly_counts.append(
            WeekCount(
                week_start=week,
                count=run_counts.get(week, 0),
                distance_m=run_distances.get(week, 0.0),
            )
        )
    return StreakStats(
        current_weeks=current_weeks,
        longest_weeks=longest,
        weekly_counts=weekly_counts,
    )


def week_totals(
    db: Session, user: User, week_start: date, activity_type: str
) -> WeekTotals:
    start, end = week_bounds_utc(user.timezone, week_start)
    distance_m, duration_s, activity_count = db.execute(
        select(
            func.coalesce(func.sum(CardioActivity.distance_m), 0.0),
            func.coalesce(func.sum(CardioActivity.duration_s), 0),
            func.count(CardioActivity.id),
        ).where(
            CardioActivity.user_id == user.id,
            CardioActivity.type == activity_type,
            CardioActivity.performed_at >= start,
            CardioActivity.performed_at < end,
        )
    ).one()
    distance_m = float(distance_m)
    duration_s = float(duration_s)
    return WeekTotals(
        total_distance_m=distance_m,
        total_duration_s=duration_s,
        activity_count=float(activity_count),
        avg_pace_s_per_km=pace_s_per_km(distance_m, duration_s),
    )


def comparison(
    db: Session, user: User, activity_type: str = "run", now: datetime | None = None
) -> Comparison:
    moment = now if now is not None else datetime.now(UTC)
    current = local_week_start(moment, user.timezone)
    preceding = [
        week_totals(db, user, current - timedelta(weeks=offset), activity_type)
        for offset in range(1, 5)
    ]
    divisor = len(preceding)
    average_distance_m = sum(item.total_distance_m for item in preceding) / divisor
    average_duration_s = sum(item.total_duration_s for item in preceding) / divisor
    return Comparison(
        this_week=week_totals(db, user, current, activity_type),
        last_week=week_totals(db, user, current - timedelta(weeks=1), activity_type),
        four_week_average=WeekTotals(
            total_distance_m=average_distance_m,
            total_duration_s=average_duration_s,
            activity_count=sum(item.activity_count for item in preceding) / divisor,
            avg_pace_s_per_km=pace_s_per_km(average_distance_m, average_duration_s),
        ),
    )
