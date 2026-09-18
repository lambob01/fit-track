from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, WeightEntry
from app.schemas.weight import (
    MovingAveragePoint,
    WeightBucket,
    WeightEntryCreate,
    WeightEntryOut,
    WeightEntryPatch,
    WeightSeriesOut,
    WeightSeriesPoint,
    WeightTrendOut,
    stored_utc,
)
from app.services.analytics import last_in_bucket, linear_trend, moving_average

router = APIRouter(
    prefix="/api/weight",
    tags=["weight"],
    dependencies=[Depends(get_current_user)],
)

SERIES_DEFAULT_DAYS = 90


def _get_owned(db: Session, user: User, entry_id: UUID) -> WeightEntry:
    entry = db.get(WeightEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Weight entry not found")
    return entry


def _utc_or_422(value: datetime | None, name: str) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(status_code=422, detail=f"{name} must include a timezone offset")
    return value.astimezone(UTC)


@router.get("/entries", response_model=list[WeightEntryOut])
def list_weight_entries(
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[WeightEntry]:
    statement = (
        select(WeightEntry)
        .where(WeightEntry.user_id == user.id)
        .order_by(WeightEntry.measured_at.desc(), WeightEntry.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(statement))


@router.post("/entries", response_model=WeightEntryOut, status_code=201)
def create_weight_entry(
    payload: WeightEntryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WeightEntry:
    entry = WeightEntry(
        user_id=user.id,
        measured_at=payload.measured_at,
        weight_kg=payload.weight_kg,
        body_fat_pct=payload.body_fat_pct,
        notes=payload.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/entries/{entry_id}", response_model=WeightEntryOut)
def get_weight_entry(
    entry_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WeightEntry:
    return _get_owned(db, user, entry_id)


@router.patch("/entries/{entry_id}", response_model=WeightEntryOut)
def patch_weight_entry(
    entry_id: UUID,
    payload: WeightEntryPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WeightEntry:
    entry = _get_owned(db, user, entry_id)
    for field in payload.model_fields_set:
        value = getattr(payload, field)
        if value is None and field in {"measured_at", "weight_kg"}:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}", status_code=204)
def delete_weight_entry(
    entry_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    entry = _get_owned(db, user, entry_id)
    db.delete(entry)
    db.commit()
    return Response(status_code=204)


@router.get("/series", response_model=WeightSeriesOut)
def weight_series(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    bucket: WeightBucket = "day",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WeightSeriesOut:
    to_utc = _utc_or_422(to, "to")
    if to_utc is None:
        to_utc = datetime.now(UTC)
    from_utc = _utc_or_422(from_, "from")
    if from_utc is None:
        from_utc = to_utc - timedelta(days=SERIES_DEFAULT_DAYS)

    entries = list(
        db.scalars(
            select(WeightEntry)
            .where(
                WeightEntry.user_id == user.id,
                WeightEntry.measured_at >= from_utc,
                WeightEntry.measured_at <= to_utc,
            )
            .order_by(WeightEntry.measured_at, WeightEntry.created_at)
        )
    )
    pairs = [(stored_utc(entry.measured_at), entry.weight_kg) for entry in entries]
    averages = moving_average(pairs)
    trend = linear_trend(pairs)

    return WeightSeriesOut(
        bucket=bucket,
        from_=from_utc,
        to=to_utc,
        points=[
            WeightSeriesPoint(bucket_start=start, measured_at=moment, weight_kg=weight)
            for start, moment, weight in last_in_bucket(pairs, user.timezone, bucket)
        ],
        moving_average=[
            MovingAveragePoint(measured_at=moment, value=value)
            for (moment, _), value in zip(pairs, averages, strict=False)
        ],
        trend=WeightTrendOut(**trend) if trend is not None else None,
        goal_weight_kg=user.goal_weight_kg,
    )
