from collections import Counter, defaultdict
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Exercise, SetEntry, User, Workout, WorkoutExercise
from app.schemas.workout import (
    E1rmPrOut,
    LastPerformanceOut,
    ProgressOut,
    ProgressSessionOut,
    PrsOut,
    RepsPrOut,
    SessionVolumePrOut,
    SetIn,
    SetOut,
    SetPatch,
    WeightPrOut,
    WorkoutExerciseIn,
    WorkoutExerciseOut,
    WorkoutExercisePatch,
    WorkoutIn,
    WorkoutOut,
    WorkoutPatch,
    WorkoutSummaryOut,
)
from app.services.analytics import epley_1rm, session_reps_volume, session_volume_kg

router = APIRouter(tags=["workouts"], dependencies=[Depends(get_current_user)])


def _utc_or_422(value: datetime | None, name: str) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(status_code=422, detail=f"{name} must include a timezone offset")
    return value.astimezone(UTC)


def _get_owned_workout(db: Session, user: User, workout_id: UUID) -> Workout:
    workout = db.get(Workout, workout_id)
    if workout is None or workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout


def _get_owned_exercise(db: Session, user: User, exercise_id: UUID) -> Exercise:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id != user.id:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


def _get_owned_workout_exercise(
    db: Session, user: User, workout_exercise_id: UUID
) -> WorkoutExercise:
    item = db.get(WorkoutExercise, workout_exercise_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Workout exercise not found")
    workout = db.get(Workout, item.workout_id)
    if workout is None or workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workout exercise not found")
    return item


def _get_owned_set(db: Session, user: User, set_id: UUID) -> SetEntry:
    entry = db.get(SetEntry, set_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Set not found")
    item = db.get(WorkoutExercise, entry.workout_exercise_id)
    workout = db.get(Workout, item.workout_id) if item is not None else None
    if workout is None or workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Set not found")
    return entry


def _commit_or_409(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflict with existing data") from exc


def _sets_out(entries) -> list[SetOut]:
    return [SetOut.model_validate(entry) for entry in entries]


def _delete_children(db: Session, workout_id: UUID) -> None:
    items = list(
        db.scalars(select(WorkoutExercise).where(WorkoutExercise.workout_id == workout_id))
    )
    item_ids = [item.id for item in items]
    if item_ids:
        for entry in list(
            db.scalars(select(SetEntry).where(SetEntry.workout_exercise_id.in_(item_ids)))
        ):
            db.delete(entry)
        for item in items:
            db.delete(item)
    db.flush()


def _set_numbers(sets: list[SetIn]) -> list[int]:
    numbers = [
        item.set_number if item.set_number is not None else index + 1
        for index, item in enumerate(sets)
    ]
    if len(numbers) != len(set(numbers)):
        raise HTTPException(
            status_code=422, detail="set_number must be unique per workout_exercise"
        )
    return numbers


def _insert_children(
    db: Session, workout: Workout, exercises: list[WorkoutExerciseIn], user: User
) -> None:
    for item in exercises:
        _get_owned_exercise(db, user, item.exercise_id)
        if item.id is not None and db.get(WorkoutExercise, item.id) is not None:
            raise HTTPException(
                status_code=409, detail="Workout exercise id is already attached elsewhere"
            )
        workout_exercise_id = item.id or uuid4()
        db.add(
            WorkoutExercise(
                id=workout_exercise_id,
                workout_id=workout.id,
                exercise_id=item.exercise_id,
                position=item.position,
                notes=item.notes,
                superset_group=item.superset_group,
            )
        )
        db.flush()
        for set_in, number in zip(item.sets, _set_numbers(item.sets), strict=False):
            if set_in.id is not None and db.get(SetEntry, set_in.id) is not None:
                raise HTTPException(status_code=409, detail="Set id is already attached elsewhere")
            db.add(
                SetEntry(
                    id=set_in.id or uuid4(),
                    workout_exercise_id=workout_exercise_id,
                    set_number=number,
                    weight_kg=set_in.weight_kg,
                    reps=set_in.reps,
                    rpe=set_in.rpe,
                    is_warmup=set_in.is_warmup,
                    is_drop_set=set_in.is_drop_set,
                    notes=set_in.notes,
                )
            )
        db.flush()


def _nested_by_workout(
    db: Session, workout_ids: list[UUID]
) -> dict[UUID, list[WorkoutExerciseOut]]:
    grouped: dict[UUID, list[WorkoutExerciseOut]] = defaultdict(list)
    if not workout_ids:
        return grouped
    items = list(
        db.scalars(
            select(WorkoutExercise)
            .where(WorkoutExercise.workout_id.in_(workout_ids))
            .order_by(WorkoutExercise.position)
        )
    )
    sets_by_item: dict[UUID, list[SetEntry]] = defaultdict(list)
    if items:
        for entry in db.scalars(
            select(SetEntry)
            .where(SetEntry.workout_exercise_id.in_([item.id for item in items]))
            .order_by(SetEntry.set_number)
        ):
            sets_by_item[entry.workout_exercise_id].append(entry)
    for item in items:
        grouped[item.workout_id].append(
            WorkoutExerciseOut(
                id=item.id,
                exercise_id=item.exercise_id,
                position=item.position,
                notes=item.notes,
                superset_group=item.superset_group,
                sets=_sets_out(sets_by_item[item.id]),
            )
        )
    return grouped


def _workout_out(db: Session, workout: Workout) -> WorkoutOut:
    nested = _nested_by_workout(db, [workout.id])
    return WorkoutOut(
        id=workout.id,
        performed_at=workout.performed_at,
        name=workout.name,
        template_id=workout.template_id,
        notes=workout.notes,
        exercises=nested.get(workout.id, []),
    )


@router.post("/api/workouts", response_model=WorkoutOut, status_code=201)
def upsert_workout(
    payload: WorkoutIn,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutOut:
    workout_id = payload.id or uuid4()
    workout = db.get(Workout, workout_id)
    if workout is not None and workout.user_id != user.id:
        raise HTTPException(status_code=403, detail="Workout belongs to another user")
    try:
        if workout is None:
            workout = Workout(
                id=workout_id,
                user_id=user.id,
                performed_at=payload.performed_at,
                name=payload.name,
                template_id=payload.template_id,
                notes=payload.notes,
            )
            db.add(workout)
            response.status_code = 201
        else:
            response.status_code = 200
            _delete_children(db, workout.id)
            workout.performed_at = payload.performed_at
            workout.name = payload.name
            workout.template_id = payload.template_id
            workout.notes = payload.notes
        _insert_children(db, workout, payload.exercises, user)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Workout conflicts with existing data") from exc
    return _workout_out(db, workout)


@router.get("/api/workouts", response_model=list[WorkoutSummaryOut])
def list_workouts(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[WorkoutSummaryOut]:
    from_utc = _utc_or_422(from_, "from")
    to_utc = _utc_or_422(to, "to")
    statement = select(Workout).where(Workout.user_id == user.id)
    if from_utc is not None:
        statement = statement.where(Workout.performed_at >= from_utc)
    if to_utc is not None:
        statement = statement.where(Workout.performed_at <= to_utc)
    workouts = list(
        db.scalars(
            statement.order_by(Workout.performed_at.desc(), Workout.id).limit(limit).offset(offset)
        )
    )
    if not workouts:
        return []

    workout_ids = [workout.id for workout in workouts]
    items = list(
        db.scalars(select(WorkoutExercise).where(WorkoutExercise.workout_id.in_(workout_ids)))
    )
    sets_by_workout: dict[UUID, list[SetEntry]] = defaultdict(list)
    if items:
        item_to_workout = {item.id: item.workout_id for item in items}
        for entry in db.scalars(
            select(SetEntry).where(SetEntry.workout_exercise_id.in_(list(item_to_workout)))
        ):
            sets_by_workout[item_to_workout[entry.workout_exercise_id]].append(entry)

    item_counts = Counter(item.workout_id for item in items)
    return [
        WorkoutSummaryOut(
            id=workout.id,
            performed_at=workout.performed_at,
            name=workout.name,
            template_id=workout.template_id,
            exercise_count=item_counts[workout.id],
            set_count=len(sets_by_workout[workout.id]),
            volume_kg=session_volume_kg(sets_by_workout[workout.id]),
        )
        for workout in workouts
    ]


@router.get("/api/workouts/{workout_id}", response_model=WorkoutOut)
def get_workout(
    workout_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutOut:
    return _workout_out(db, _get_owned_workout(db, user, workout_id))


@router.patch("/api/workouts/{workout_id}", response_model=WorkoutOut)
def patch_workout(
    workout_id: UUID,
    payload: WorkoutPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutOut:
    workout = _get_owned_workout(db, user, workout_id)
    for field in payload.model_fields_set:
        setattr(workout, field, getattr(payload, field))
    _commit_or_409(db)
    return _workout_out(db, workout)


@router.delete("/api/workouts/{workout_id}", status_code=204)
def delete_workout(
    workout_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    workout = _get_owned_workout(db, user, workout_id)
    _delete_children(db, workout.id)
    db.delete(workout)
    db.commit()
    return Response(status_code=204)


@router.post(
    "/api/workouts/{workout_id}/exercises", response_model=WorkoutExerciseOut, status_code=201
)
def add_workout_exercise(
    workout_id: UUID,
    payload: WorkoutExerciseIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutExerciseOut:
    workout = _get_owned_workout(db, user, workout_id)
    _get_owned_exercise(db, user, payload.exercise_id)
    conflict = db.scalar(
        select(WorkoutExercise).where(
            WorkoutExercise.workout_id == workout.id,
            WorkoutExercise.position == payload.position,
        )
    )
    if conflict is not None:
        raise HTTPException(status_code=409, detail="Position already used in this workout")
    if payload.id is not None and db.get(WorkoutExercise, payload.id) is not None:
        raise HTTPException(
            status_code=409, detail="Workout exercise id is already attached elsewhere"
        )
    workout_exercise_id = payload.id or uuid4()
    db.add(
        WorkoutExercise(
            id=workout_exercise_id,
            workout_id=workout.id,
            exercise_id=payload.exercise_id,
            position=payload.position,
            notes=payload.notes,
            superset_group=payload.superset_group,
        )
    )
    db.flush()
    for set_in, number in zip(payload.sets, _set_numbers(payload.sets), strict=False):
        if set_in.id is not None and db.get(SetEntry, set_in.id) is not None:
            raise HTTPException(status_code=409, detail="Set id is already attached elsewhere")
        db.add(
            SetEntry(
                id=set_in.id or uuid4(),
                workout_exercise_id=workout_exercise_id,
                set_number=number,
                weight_kg=set_in.weight_kg,
                reps=set_in.reps,
                rpe=set_in.rpe,
                is_warmup=set_in.is_warmup,
                is_drop_set=set_in.is_drop_set,
                notes=set_in.notes,
            )
        )
    _commit_or_409(db)
    item = _get_owned_workout_exercise(db, user, workout_exercise_id)
    return _workout_exercise_out(db, item)


def _workout_exercise_out(db: Session, item: WorkoutExercise) -> WorkoutExerciseOut:
    sets = list(
        db.scalars(
            select(SetEntry)
            .where(SetEntry.workout_exercise_id == item.id)
            .order_by(SetEntry.set_number)
        )
    )
    return WorkoutExerciseOut(
        id=item.id,
        exercise_id=item.exercise_id,
        position=item.position,
        notes=item.notes,
        superset_group=item.superset_group,
        sets=_sets_out(sets),
    )


@router.patch("/api/workout-exercises/{workout_exercise_id}", response_model=WorkoutExerciseOut)
def patch_workout_exercise(
    workout_exercise_id: UUID,
    payload: WorkoutExercisePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkoutExerciseOut:
    item = _get_owned_workout_exercise(db, user, workout_exercise_id)
    if "exercise_id" in payload.model_fields_set and payload.exercise_id is not None:
        _get_owned_exercise(db, user, payload.exercise_id)
    if "position" in payload.model_fields_set and payload.position is not None:
        conflict = db.scalar(
            select(WorkoutExercise).where(
                WorkoutExercise.workout_id == item.workout_id,
                WorkoutExercise.position == payload.position,
                WorkoutExercise.id != item.id,
            )
        )
        if conflict is not None:
            raise HTTPException(status_code=409, detail="Position already used in this workout")
    for field in payload.model_fields_set:
        setattr(item, field, getattr(payload, field))
    _commit_or_409(db)
    return _workout_exercise_out(db, item)


@router.delete("/api/workout-exercises/{workout_exercise_id}", status_code=204)
def delete_workout_exercise(
    workout_exercise_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    item = _get_owned_workout_exercise(db, user, workout_exercise_id)
    for entry in list(
        db.scalars(select(SetEntry).where(SetEntry.workout_exercise_id == item.id))
    ):
        db.delete(entry)
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@router.post(
    "/api/workout-exercises/{workout_exercise_id}/sets", response_model=SetOut, status_code=201
)
def add_set(
    workout_exercise_id: UUID,
    payload: SetIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SetOut:
    item = _get_owned_workout_exercise(db, user, workout_exercise_id)
    if payload.id is not None and db.get(SetEntry, payload.id) is not None:
        raise HTTPException(status_code=409, detail="Set id is already attached elsewhere")
    highest = db.scalar(
        select(func.max(SetEntry.set_number)).where(
            SetEntry.workout_exercise_id == item.id
        )
    )
    entry = SetEntry(
        id=payload.id or uuid4(),
        workout_exercise_id=item.id,
        set_number=(highest or 0) + 1,
        weight_kg=payload.weight_kg,
        reps=payload.reps,
        rpe=payload.rpe,
        is_warmup=payload.is_warmup,
        is_drop_set=payload.is_drop_set,
        notes=payload.notes,
    )
    db.add(entry)
    _commit_or_409(db)
    db.refresh(entry)
    return SetOut.model_validate(entry)


@router.patch("/api/sets/{set_id}", response_model=SetOut)
def patch_set(
    set_id: UUID,
    payload: SetPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SetOut:
    entry = _get_owned_set(db, user, set_id)
    if "set_number" in payload.model_fields_set and payload.set_number is not None:
        conflict = db.scalar(
            select(SetEntry).where(
                SetEntry.workout_exercise_id == entry.workout_exercise_id,
                SetEntry.set_number == payload.set_number,
                SetEntry.id != entry.id,
            )
        )
        if conflict is not None:
            raise HTTPException(status_code=409, detail="set_number already used")
    for field in payload.model_fields_set:
        setattr(entry, field, getattr(payload, field))
    _commit_or_409(db)
    db.refresh(entry)
    return SetOut.model_validate(entry)


@router.delete("/api/sets/{set_id}", status_code=204)
def delete_set(
    set_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    entry = _get_owned_set(db, user, set_id)
    db.delete(entry)
    db.commit()
    return Response(status_code=204)


@router.get("/api/exercises/{exercise_id}/progress", response_model=ProgressOut)
def exercise_progress(
    exercise_id: UUID,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProgressOut:
    _get_owned_exercise(db, user, exercise_id)
    from_utc = _utc_or_422(from_, "from")
    to_utc = _utc_or_422(to, "to")
    statement = (
        select(SetEntry, Workout.id, Workout.performed_at)
        .join(WorkoutExercise, SetEntry.workout_exercise_id == WorkoutExercise.id)
        .join(Workout, WorkoutExercise.workout_id == Workout.id)
        .where(
            Workout.user_id == user.id,
            WorkoutExercise.exercise_id == exercise_id,
            SetEntry.is_warmup.is_(False),
        )
    )
    if from_utc is not None:
        statement = statement.where(Workout.performed_at >= from_utc)
    if to_utc is not None:
        statement = statement.where(Workout.performed_at <= to_utc)
    statement = statement.order_by(Workout.performed_at, Workout.id, SetEntry.set_number)
    rows = list(db.execute(statement))

    order: list[UUID] = []
    grouped: dict[UUID, tuple[datetime, list[SetEntry]]] = {}
    for entry, workout_id, performed_at in rows:
        if workout_id not in grouped:
            grouped[workout_id] = (performed_at, [])
            order.append(workout_id)
        grouped[workout_id][1].append(entry)

    sessions = []
    for workout_id in order:
        performed_at, entries = grouped[workout_id]
        weights = [entry.weight_kg for entry in entries if entry.weight_kg is not None]
        estimates = [epley_1rm(entry.weight_kg, entry.reps) for entry in entries]
        estimates = [value for value in estimates if value is not None]
        sessions.append(
            ProgressSessionOut(
                workout_id=workout_id,
                performed_at=performed_at,
                top_set_kg=max(weights) if weights else None,
                e1rm_kg=max(estimates) if estimates else None,
                volume_kg=session_volume_kg(entries),
                reps_volume=session_reps_volume(entries),
            )
        )
    return ProgressOut(sessions=sessions)


@router.get("/api/exercises/{exercise_id}/prs", response_model=PrsOut)
def exercise_prs(
    exercise_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PrsOut:
    _get_owned_exercise(db, user, exercise_id)
    rows = list(
        db.execute(
            select(SetEntry, Workout.id, Workout.performed_at)
            .join(WorkoutExercise, SetEntry.workout_exercise_id == WorkoutExercise.id)
            .join(Workout, WorkoutExercise.workout_id == Workout.id)
            .where(
                Workout.user_id == user.id,
                WorkoutExercise.exercise_id == exercise_id,
                SetEntry.is_warmup.is_(False),
            )
            .order_by(Workout.performed_at, Workout.id, SetEntry.set_number)
        )
    )

    heaviest: tuple[SetEntry, UUID, datetime] | None = None
    best_e1rm: tuple[float, SetEntry, UUID, datetime] | None = None
    best_reps: tuple[SetEntry, UUID, datetime] | None = None
    volumes: dict[UUID, tuple[datetime, float]] = {}

    for entry, workout_id, performed_at in rows:
        if entry.weight_kg is not None:
            if heaviest is None or entry.weight_kg > heaviest[0].weight_kg:
                heaviest = (entry, workout_id, performed_at)
            previous = volumes.get(workout_id)
            volume = (previous[1] if previous is not None else 0.0) + entry.weight_kg * entry.reps
            volumes[workout_id] = (performed_at, volume)
        estimate = epley_1rm(entry.weight_kg, entry.reps)
        if estimate is not None and (best_e1rm is None or estimate > best_e1rm[0]):
            best_e1rm = (estimate, entry, workout_id, performed_at)
        if best_reps is None or entry.reps > best_reps[0].reps:
            best_reps = (entry, workout_id, performed_at)

    best_volume = None
    for workout_id, (performed_at, volume) in volumes.items():
        if best_volume is None or volume > best_volume[2]:
            best_volume = (workout_id, performed_at, volume)

    return PrsOut(
        heaviest_weight=(
            WeightPrOut(
                weight_kg=heaviest[0].weight_kg,
                reps=heaviest[0].reps,
                set_id=heaviest[0].id,
                workout_id=heaviest[1],
                performed_at=heaviest[2],
            )
            if heaviest is not None
            else None
        ),
        best_e1rm=(
            E1rmPrOut(
                e1rm_kg=best_e1rm[0],
                weight_kg=best_e1rm[1].weight_kg,
                reps=best_e1rm[1].reps,
                set_id=best_e1rm[1].id,
                workout_id=best_e1rm[2],
                performed_at=best_e1rm[3],
            )
            if best_e1rm is not None
            else None
        ),
        best_reps=(
            RepsPrOut(
                reps=best_reps[0].reps,
                weight_kg=best_reps[0].weight_kg,
                set_id=best_reps[0].id,
                workout_id=best_reps[1],
                performed_at=best_reps[2],
            )
            if best_reps is not None
            else None
        ),
        best_session_volume=(
            SessionVolumePrOut(
                volume_kg=best_volume[2],
                workout_id=best_volume[0],
                performed_at=best_volume[1],
            )
            if best_volume is not None
            else None
        ),
    )


@router.get(
    "/api/exercises/{exercise_id}/last-performance", response_model=LastPerformanceOut | None
)
def exercise_last_performance(
    exercise_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LastPerformanceOut | None:
    _get_owned_exercise(db, user, exercise_id)
    row = db.execute(
        select(Workout.id, Workout.performed_at, WorkoutExercise.id)
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .where(Workout.user_id == user.id, WorkoutExercise.exercise_id == exercise_id)
        .order_by(Workout.performed_at.desc(), WorkoutExercise.position)
        .limit(1)
    ).first()
    if row is None:
        return None
    workout_id, performed_at, workout_exercise_id = row
    entries = list(
        db.scalars(
            select(SetEntry)
            .where(SetEntry.workout_exercise_id == workout_exercise_id)
            .order_by(SetEntry.set_number)
        )
    )
    return LastPerformanceOut(
        workout_id=workout_id,
        workout_exercise_id=workout_exercise_id,
        performed_at=performed_at,
        sets=_sets_out(entries),
    )
