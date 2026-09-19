from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import CardioActivity, CardioSplit, User
from app.routers.shoes import require_owned_shoe
from app.schemas.cardio import (
    CardioActivityCreate,
    CardioActivityOut,
    CardioActivityPatch,
    CardioComparisonOut,
    CardioComparisonTotalsOut,
    CardioPrsOut,
    CardioPrValue,
    CardioSplitIn,
    CardioSplitOut,
    CardioSplitsOut,
    CardioStreaksOut,
    CardioSummaryOut,
    CardioType,
    CardioWeeklyCountOut,
    CardioWeekOut,
    CardioZoneOut,
    CardioZonesOut,
)
from app.services import running
from app.services.analytics import pace_s_per_km

router = APIRouter(
    prefix="/api/cardio",
    tags=["cardio"],
    dependencies=[Depends(get_current_user)],
)

PATCH_REQUIRED_FIELDS = {"performed_at", "type", "duration_s"}


def _get_owned(db: Session, user: User, activity_id: UUID) -> CardioActivity:
    activity = db.get(CardioActivity, activity_id)
    if activity is None or activity.user_id != user.id:
        raise HTTPException(status_code=404, detail="Cardio activity not found")
    return activity


def _replace_splits(
    db: Session, activity_id: UUID, splits: list[CardioSplitIn] | None
) -> None:
    db.execute(delete(CardioSplit).where(CardioSplit.cardio_activity_id == activity_id))
    for index, split in enumerate(splits or []):
        db.add(
            CardioSplit(
                cardio_activity_id=activity_id,
                split_number=split.split_number
                if split.split_number is not None
                else index + 1,
                distance_m=split.distance_m,
                duration_s=split.duration_s,
            )
        )


def _derived_splits(distance_m: float | None, duration_s: int) -> list[CardioSplitOut]:
    """Evenly pace 1 km segments (final remainder), for display only."""
    if not distance_m:
        return []
    splits: list[CardioSplitOut] = []
    remaining = float(distance_m)
    covered = 0.0
    allocated_s = 0
    split_number = 1
    while remaining > 1e-9:
        segment = min(1000.0, remaining)
        covered += segment
        cumulative_s = round(duration_s * covered / distance_m)
        splits.append(
            CardioSplitOut(
                split_number=split_number,
                distance_m=segment,
                duration_s=cumulative_s - allocated_s,
            )
        )
        allocated_s = cumulative_s
        remaining -= segment
        split_number += 1
    return splits


def _utc_or_422(value: datetime | None, name: str) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(status_code=422, detail=f"{name} must include a timezone offset")
    return value.astimezone(UTC)


def _totals(
    db: Session,
    user: User,
    start: datetime | None = None,
    end: datetime | None = None,
    activity_type: CardioType | None = None,
) -> tuple[float, int, int]:
    statement = select(
        func.coalesce(func.sum(CardioActivity.distance_m), 0.0),
        func.coalesce(func.sum(CardioActivity.duration_s), 0),
        func.count(CardioActivity.id),
    ).where(CardioActivity.user_id == user.id)
    if start is not None:
        statement = statement.where(CardioActivity.performed_at >= start)
    if end is not None:
        statement = statement.where(CardioActivity.performed_at < end)
    if activity_type is not None:
        statement = statement.where(CardioActivity.type == activity_type)
    distance_m, duration_s, activity_count = db.execute(statement).one()
    return float(distance_m), int(duration_s), int(activity_count)


def _summary_fields(distance_m: float, duration_s: int, activity_count: int) -> dict:
    return {
        "total_distance_m": distance_m,
        "total_duration_s": duration_s,
        "activity_count": activity_count,
        "avg_pace_s_per_km": pace_s_per_km(distance_m, duration_s),
    }


def _week_window(user: User, week_start: date | None) -> tuple[datetime, datetime]:
    """Return the UTC [start, end) instants of a 7-local-day window.

    Both instants are derived from local wall-clock midnight, so DST-transition
    weeks stay 7 local calendar days (167/169 wall-clock hours) and an explicit
    non-Monday `week_start` still spans the documented 7 days.
    """
    if week_start is None:
        week_start = running.local_week_start(datetime.now(UTC), user.timezone)
    return running.week_bounds_utc(user.timezone, week_start)


def week_totals(
    db: Session,
    user: User,
    week_start: date | None = None,
    activity_type: CardioType | None = None,
) -> CardioWeekOut:
    """Totals for [week_start, week_start + 7 local days) plus weekly run goal progress."""
    start, end = _week_window(user, week_start)
    distance_m, duration_s, activity_count = _totals(db, user, start, end, activity_type)
    goal_m = user.weekly_run_goal_m
    return CardioWeekOut(
        **_summary_fields(distance_m, duration_s, activity_count),
        week_start=start,
        week_end=end,
        weekly_goal_m=goal_m,
        goal_progress_pct=distance_m / goal_m * 100 if goal_m else None,
    )


@router.get("", response_model=list[CardioActivityOut])
def list_activities(
    type: CardioType | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CardioActivity]:
    statement = select(CardioActivity).where(CardioActivity.user_id == user.id)
    if type is not None:
        statement = statement.where(CardioActivity.type == type)
    statement = (
        statement.order_by(CardioActivity.performed_at.desc(), CardioActivity.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(statement))


@router.post("", response_model=CardioActivityOut, status_code=201)
def create_activity(
    payload: CardioActivityCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioActivity:
    require_owned_shoe(db, user, payload.shoe_id)
    activity = CardioActivity(
        user_id=user.id,
        performed_at=payload.performed_at,
        type=payload.type,
        distance_m=payload.distance_m,
        duration_s=payload.duration_s,
        avg_hr=payload.avg_hr,
        route_name=payload.route_name,
        notes=payload.notes,
        shoe_id=payload.shoe_id,
    )
    db.add(activity)
    db.flush()
    _replace_splits(db, activity.id, payload.splits)
    db.commit()
    db.refresh(activity)
    return activity


@router.get("/summary", response_model=CardioSummaryOut)
def cardio_summary(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    type: CardioType | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioSummaryOut:
    distance_m, duration_s, activity_count = _totals(
        db, user, _utc_or_422(from_, "from"), _utc_or_422(to, "to"), type
    )
    return CardioSummaryOut(**_summary_fields(distance_m, duration_s, activity_count))


@router.get("/week", response_model=CardioWeekOut)
def cardio_week(
    week_start: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioWeekOut:
    return week_totals(db, user, week_start)


def _pr_out(result: running.PrResult | None) -> CardioPrValue | None:
    if result is None:
        return None
    return CardioPrValue(
        cardio_activity_id=result.cardio_activity_id,
        performed_at=result.performed_at,
        value=result.value,
    )


def _totals_out(totals: running.WeekTotals) -> CardioComparisonTotalsOut:
    return CardioComparisonTotalsOut(
        total_distance_m=totals.total_distance_m,
        total_duration_s=totals.total_duration_s,
        activity_count=totals.activity_count,
        avg_pace_s_per_km=totals.avg_pace_s_per_km,
    )


@router.get("/prs", response_model=CardioPrsOut)
def cardio_prs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioPrsOut:
    records = running.personal_records(db, user)
    return CardioPrsOut(
        fastest_1k=_pr_out(records["fastest_1k"]),
        fastest_5k=_pr_out(records["fastest_5k"]),
        fastest_10k=_pr_out(records["fastest_10k"]),
        longest_distance=_pr_out(records["longest_distance"]),
        longest_duration=_pr_out(records["longest_duration"]),
    )


@router.get("/streaks", response_model=CardioStreaksOut)
def cardio_streaks(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioStreaksOut:
    stats = running.streak_stats(db, user)
    return CardioStreaksOut(
        current_weeks=stats.current_weeks,
        longest_weeks=stats.longest_weeks,
        weekly_counts=[
            CardioWeeklyCountOut(
                week_start=item.week_start, count=item.count, distance_m=item.distance_m
            )
            for item in stats.weekly_counts
        ],
    )


@router.get("/comparison", response_model=CardioComparisonOut)
def cardio_comparison(
    type: CardioType = "run",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioComparisonOut:
    result = running.comparison(db, user, type)
    return CardioComparisonOut(
        this_week=_totals_out(result.this_week),
        last_week=_totals_out(result.last_week),
        four_week_average=_totals_out(result.four_week_average),
    )


@router.get("/splits/{activity_id}", response_model=CardioSplitsOut)
def get_activity_splits(
    activity_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioSplitsOut:
    activity = _get_owned(db, user, activity_id)
    stored = list(
        db.scalars(
            select(CardioSplit)
            .where(CardioSplit.cardio_activity_id == activity.id)
            .order_by(CardioSplit.split_number)
        )
    )
    if stored:
        return CardioSplitsOut(
            source="stored",
            splits=[CardioSplitOut.model_validate(split) for split in stored],
        )
    return CardioSplitsOut(
        source="derived",
        splits=_derived_splits(activity.distance_m, activity.duration_s),
    )


@router.get("/{activity_id}/zones", response_model=CardioZonesOut | None)
def get_activity_zones(
    activity_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioZonesOut | None:
    activity = _get_owned(db, user, activity_id)
    zones = running.hr_zones(user, activity)
    if zones is None:
        return None
    return CardioZonesOut(
        max_hr=zones.max_hr,
        zones=[
            CardioZoneOut(zone=band.zone, label=band.label, seconds=band.seconds)
            for band in zones.zones
        ],
    )


@router.get("/{activity_id}", response_model=CardioActivityOut)
def get_activity(
    activity_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioActivity:
    return _get_owned(db, user, activity_id)


@router.patch("/{activity_id}", response_model=CardioActivityOut)
def patch_activity(
    activity_id: UUID,
    payload: CardioActivityPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CardioActivity:
    activity = _get_owned(db, user, activity_id)
    for field in payload.model_fields_set:
        if field == "splits":
            continue
        value = getattr(payload, field)
        if value is None and field in PATCH_REQUIRED_FIELDS:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
        if field == "shoe_id":
            require_owned_shoe(db, user, value)
        setattr(activity, field, value)
    if "splits" in payload.model_fields_set:
        _replace_splits(db, activity.id, payload.splits)
    db.commit()
    db.refresh(activity)
    return activity


@router.delete("/{activity_id}", status_code=204)
def delete_activity(
    activity_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    activity = _get_owned(db, user, activity_id)
    db.delete(activity)
    db.commit()
    return Response(status_code=204)
