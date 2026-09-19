from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import Delete, delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    BodyMeasurement,
    CardioActivity,
    CardioSplit,
    SetEntry,
    User,
    WeeklyPlan,
    WeeklyPlanSlot,
    WeightEntry,
    Workout,
    WorkoutExercise,
    WorkoutTag,
)
from app.security import verify_password
from app.services.user_data import delete_user_data

router = APIRouter(
    prefix="/api/data", tags=["data"], dependencies=[Depends(get_current_user)]
)


class DeleteAllIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str


class DeletedOut(BaseModel):
    deleted: dict[str, int]


DeleteRange = Callable[[Session, UUID, datetime | None, datetime | None], int]


def _utc_or_422(value: datetime | None, name: str) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(status_code=422, detail=f"{name} must include a timezone offset")
    return value.astimezone(UTC)


def _execute(db: Session, statement: Delete) -> int:
    result = db.execute(statement.execution_options(synchronize_session=False))
    return result.rowcount


def _delete_weight_entries(
    db: Session, user_id: UUID, start: datetime | None, end: datetime | None
) -> int:
    statement = delete(WeightEntry).where(WeightEntry.user_id == user_id)
    if start is not None and end is not None:
        statement = statement.where(
            WeightEntry.measured_at >= start, WeightEntry.measured_at < end
        )
    return _execute(db, statement)


def _delete_measurements(
    db: Session, user_id: UUID, start: datetime | None, end: datetime | None
) -> int:
    statement = delete(BodyMeasurement).where(BodyMeasurement.user_id == user_id)
    if start is not None and end is not None:
        statement = statement.where(
            BodyMeasurement.measured_at >= start, BodyMeasurement.measured_at < end
        )
    return _execute(db, statement)


def _delete_workouts(
    db: Session, user_id: UUID, start: datetime | None, end: datetime | None
) -> int:
    workout_ids = select(Workout.id).where(Workout.user_id == user_id)
    if start is not None and end is not None:
        workout_ids = workout_ids.where(
            Workout.performed_at >= start, Workout.performed_at < end
        )
    workout_exercise_ids = select(WorkoutExercise.id).where(
        WorkoutExercise.workout_id.in_(workout_ids)
    )
    _execute(
        db, delete(SetEntry).where(SetEntry.workout_exercise_id.in_(workout_exercise_ids))
    )
    _execute(db, delete(WorkoutTag).where(WorkoutTag.workout_id.in_(workout_ids)))
    _execute(db, delete(WorkoutExercise).where(WorkoutExercise.workout_id.in_(workout_ids)))
    return _execute(db, delete(Workout).where(Workout.id.in_(workout_ids)))


def _delete_cardio_activities(
    db: Session, user_id: UUID, start: datetime | None, end: datetime | None
) -> int:
    cardio_ids = select(CardioActivity.id).where(CardioActivity.user_id == user_id)
    if start is not None and end is not None:
        cardio_ids = cardio_ids.where(
            CardioActivity.performed_at >= start, CardioActivity.performed_at < end
        )
    _execute(db, delete(CardioSplit).where(CardioSplit.cardio_activity_id.in_(cardio_ids)))
    return _execute(db, delete(CardioActivity).where(CardioActivity.id.in_(cardio_ids)))


def _delete_sets(
    db: Session, user_id: UUID, start: datetime | None, end: datetime | None
) -> int:
    workout_ids = select(Workout.id).where(Workout.user_id == user_id)
    if start is not None and end is not None:
        workout_ids = workout_ids.where(
            Workout.performed_at >= start, Workout.performed_at < end
        )
    statement = delete(SetEntry).where(
        SetEntry.workout_exercise_id.in_(
            select(WorkoutExercise.id).where(WorkoutExercise.workout_id.in_(workout_ids))
        )
    )
    return _execute(db, statement)


def _delete_plans(
    db: Session, user_id: UUID, start: datetime | None, end: datetime | None
) -> int:
    plan_ids = select(WeeklyPlan.id).where(WeeklyPlan.user_id == user_id)
    if start is not None and end is not None:
        plan_ids = plan_ids.where(
            WeeklyPlan.created_at >= start, WeeklyPlan.created_at < end
        )
    _execute(db, delete(WeeklyPlanSlot).where(WeeklyPlanSlot.plan_id.in_(plan_ids)))
    return _execute(db, delete(WeeklyPlan).where(WeeklyPlan.id.in_(plan_ids)))


DELETERS: dict[str, DeleteRange] = {
    "weight_entries": _delete_weight_entries,
    "measurements": _delete_measurements,
    "workouts": _delete_workouts,
    "cardio_activities": _delete_cardio_activities,
    "sets": _delete_sets,
    "plans": _delete_plans,
}


@router.delete("/all", response_model=DeletedOut)
def delete_all(
    payload: DeleteAllIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DeletedOut:
    if not verify_password(payload.password, settings.app_password_hash):
        raise HTTPException(status_code=403, detail="Invalid password")
    return DeletedOut(deleted=delete_user_data(db, user.id))


@router.delete("/{entity}", response_model=DeletedOut)
def delete_entity(
    entity: str,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DeletedOut:
    delete_rows = DELETERS.get(entity)
    if delete_rows is None:
        raise HTTPException(status_code=404, detail="Unknown entity")
    if (from_ is None) != (to is None):
        raise HTTPException(
            status_code=422, detail="from and to must be supplied together"
        )
    start = _utc_or_422(from_, "from")
    end = _utc_or_422(to, "to")
    count = delete_rows(db, user.id, start, end)
    db.commit()
    return DeletedOut(deleted={entity: count})
