from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.routers.cardio import week_totals
from app.routers.weight import list_weight_entries
from app.routers.workouts import list_workouts
from app.schemas.cardio import CardioWeekOut
from app.schemas.weight import stored_utc
from app.schemas.workout import WorkoutSummaryOut

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


class DashboardOut(BaseModel):
    latest_weight: LatestWeightOut | None
    weight_goal: WeightGoalOut | None
    last_workout: WorkoutSummaryOut | None
    week_cardio: CardioWeekOut


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
        last_workout=workouts[0] if workouts else None,
        week_cardio=week_totals(db, user, activity_type="run"),
    )
