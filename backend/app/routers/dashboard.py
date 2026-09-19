from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, WeightEntry
from app.routers.cardio import week_totals
from app.routers.weight import list_weight_entries
from app.routers.workouts import list_workouts
from app.schemas.cardio import CardioWeekOut
from app.schemas.weight import stored_utc
from app.schemas.workout import WorkoutSummaryOut
from app.services.analytics import (
    DAYS_PER_WEEK,
    EXPIRED,
    compare_rate,
    linear_trend,
    required_rate_per_week,
)

router = APIRouter(
    prefix="/api",
    tags=["dashboard"],
    dependencies=[Depends(get_current_user)],
)


class LatestWeightOut(BaseModel):
    measured_at: datetime
    weight_kg: float
    body_fat_pct: float | None

    @field_validator("measured_at")
    @classmethod
    def utc_measured_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class WeightGoalOut(BaseModel):
    goal_weight_kg: float
    latest_weight_kg: float | None


class WeightGoalProgressOut(BaseModel):
    status: Literal["on_pace", "ahead", "behind", "expired"]
    trend_slope_kg_per_week: float
    rate_goal_kg_per_week: float | None
    required_rate_kg_per_week: float | None


class DashboardOut(BaseModel):
    latest_weight: LatestWeightOut | None
    weight_goal: WeightGoalOut | None
    weight_goal_progress: WeightGoalProgressOut | None
    last_workout: WorkoutSummaryOut | None
    week_cardio: CardioWeekOut


def _weight_goal_progress(db: Session, user: User) -> WeightGoalProgressOut | None:
    now = datetime.now(UTC)
    entries = list(
        db.scalars(
            select(WeightEntry)
            .where(
                WeightEntry.user_id == user.id,
                WeightEntry.measured_at >= now - timedelta(days=30),
                WeightEntry.measured_at <= now,
            )
            .order_by(WeightEntry.measured_at, WeightEntry.created_at)
        )
    )
    trend = linear_trend([(stored_utc(entry.measured_at), entry.weight_kg) for entry in entries])
    if trend is None:
        return None
    slope_per_week = trend["slope_per_day"] * DAYS_PER_WEEK

    required_rate = required_rate_per_week(
        entries[-1].weight_kg,
        user.goal_weight_target_kg,
        user.goal_weight_target_date,
        today=datetime.now(ZoneInfo(user.timezone)).date(),
    )
    effective_rate = required_rate if required_rate is not None else user.goal_rate_kg_per_week
    status = compare_rate(slope_per_week, effective_rate)
    if status is None:
        return None
    return WeightGoalProgressOut(
        status=status,
        trend_slope_kg_per_week=slope_per_week,
        rate_goal_kg_per_week=user.goal_rate_kg_per_week,
        required_rate_kg_per_week=None if effective_rate == EXPIRED else effective_rate,
    )


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardOut:
    latest = next(iter(list_weight_entries(limit=1, offset=0, db=db, user=user)), None)
    workouts = list_workouts(from_=None, to=None, limit=1, offset=0, db=db, user=user)
    latest_weight_kg = latest.weight_kg if latest is not None else None
    return DashboardOut(
        latest_weight=(
            LatestWeightOut(
                measured_at=latest.measured_at,
                weight_kg=latest.weight_kg,
                body_fat_pct=latest.body_fat_pct,
            )
            if latest is not None
            else None
        ),
        weight_goal=(
            WeightGoalOut(
                goal_weight_kg=user.goal_weight_kg,
                latest_weight_kg=latest_weight_kg,
            )
            if user.goal_weight_kg is not None
            else None
        ),
        weight_goal_progress=_weight_goal_progress(db, user),
        last_workout=workouts[0] if workouts else None,
        week_cardio=week_totals(db, user, activity_type="run"),
    )
