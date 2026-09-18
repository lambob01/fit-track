from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Exercise, User
from app.schemas.exercise import (
    ExerciseCreate,
    ExerciseOut,
    ExercisePatch,
    ExerciseResolveIn,
    ExerciseResolveOut,
)

router = APIRouter(
    prefix="/api/exercises",
    tags=["exercises"],
    dependencies=[Depends(get_current_user)],
)


def _find_by_name(db: Session, user: User, name_lower: str) -> Exercise | None:
    return db.scalar(
        select(Exercise).where(
            Exercise.user_id == user.id, Exercise.name_lower == name_lower
        )
    )


def _get_owned(db: Session, user: User, exercise_id: UUID) -> Exercise:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id != user.id:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


@router.get("", response_model=list[ExerciseOut])
def list_exercises(
    q: str | None = None,
    category: str | None = None,
    muscle_group: str | None = None,
    include_archived: bool = False,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Exercise]:
    statement = select(Exercise).where(Exercise.user_id == user.id)
    if not include_archived:
        statement = statement.where(Exercise.is_archived.is_(False))
    if q is not None and q.strip():
        statement = statement.where(
            Exercise.name_lower.contains(q.strip().lower(), autoescape=True)
        )
    if category is not None:
        statement = statement.where(Exercise.category == category)
    if muscle_group is not None:
        statement = statement.where(Exercise.muscle_group == muscle_group)
    statement = statement.order_by(Exercise.name_lower).limit(limit).offset(offset)
    return list(db.scalars(statement))


@router.post("", response_model=ExerciseOut, status_code=201)
def create_exercise(
    payload: ExerciseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Exercise:
    name_lower = payload.name.lower()
    if _find_by_name(db, user, name_lower) is not None:
        raise HTTPException(status_code=409, detail="Exercise already exists")
    exercise = Exercise(
        user_id=user.id,
        name=payload.name,
        name_lower=name_lower,
        muscle_group=payload.muscle_group,
        category=payload.category,
        equipment=payload.equipment,
        is_compound=payload.is_compound,
    )
    db.add(exercise)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Exercise already exists") from exc
    db.refresh(exercise)
    return exercise


@router.post("/resolve", response_model=ExerciseResolveOut)
def resolve_exercise(
    payload: ExerciseResolveIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExerciseResolveOut:
    name_lower = payload.name.lower()
    exercise = _find_by_name(db, user, name_lower)
    if exercise is not None:
        return ExerciseResolveOut(
            id=exercise.id,
            name=exercise.name,
            is_archived=exercise.is_archived,
            created=False,
        )
    exercise = Exercise(
        user_id=user.id,
        name=payload.name,
        name_lower=name_lower,
        muscle_group="other",
        category="other",
        equipment="other",
        is_compound=False,
    )
    db.add(exercise)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _find_by_name(db, user, name_lower)
        if existing is None:
            raise
        return ExerciseResolveOut(
            id=existing.id,
            name=existing.name,
            is_archived=existing.is_archived,
            created=False,
        )
    db.refresh(exercise)
    return ExerciseResolveOut(
        id=exercise.id,
        name=exercise.name,
        is_archived=exercise.is_archived,
        created=True,
    )


@router.patch("/{exercise_id}", response_model=ExerciseOut)
def patch_exercise(
    exercise_id: UUID,
    payload: ExercisePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Exercise:
    exercise = _get_owned(db, user, exercise_id)
    for field in payload.model_fields_set:
        value = getattr(payload, field)
        if value is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
        if field == "name":
            name_lower = value.lower()
            existing = _find_by_name(db, user, name_lower)
            if existing is not None and existing.id != exercise.id:
                raise HTTPException(status_code=409, detail="Exercise already exists")
            exercise.name = value
            exercise.name_lower = name_lower
        else:
            setattr(exercise, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Exercise already exists") from exc
    db.refresh(exercise)
    return exercise
