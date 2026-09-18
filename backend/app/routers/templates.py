from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Exercise, TemplateExercise, User, Workout, WorkoutTemplate
from app.schemas.template import (
    TemplateExerciseIn,
    TemplateExerciseOut,
    TemplateIn,
    TemplateOut,
    TemplatePatch,
)

router = APIRouter(
    prefix="/api/templates",
    tags=["templates"],
    dependencies=[Depends(get_current_user)],
)


def _find_by_name(db: Session, user: User, name_lower: str) -> WorkoutTemplate | None:
    return db.scalar(
        select(WorkoutTemplate).where(
            WorkoutTemplate.user_id == user.id, WorkoutTemplate.name_lower == name_lower
        )
    )


def _get_owned(db: Session, user: User, template_id: UUID) -> WorkoutTemplate:
    template = db.get(WorkoutTemplate, template_id)
    if template is None or template.user_id != user.id:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


def _validate_exercises(db: Session, user: User, items: list[TemplateExerciseIn]) -> None:
    for item in items:
        exercise = db.get(Exercise, item.exercise_id)
        if exercise is None or exercise.user_id != user.id:
            raise HTTPException(status_code=404, detail="Exercise not found")


def _replace_exercises(
    db: Session, template: WorkoutTemplate, items: list[TemplateExerciseIn]
) -> None:
    for existing in list(
        db.scalars(select(TemplateExercise).where(TemplateExercise.template_id == template.id))
    ):
        db.delete(existing)
    db.flush()
    for item in items:
        db.add(
            TemplateExercise(
                template_id=template.id,
                exercise_id=item.exercise_id,
                position=item.position,
                target_sets=item.target_sets,
                target_reps=item.target_reps,
                target_weight_kg=item.target_weight_kg,
            )
        )
    db.flush()


def _exercise_map(
    db: Session, template_ids: list[UUID]
) -> dict[UUID, list[TemplateExerciseOut]]:
    grouped: dict[UUID, list[TemplateExerciseOut]] = defaultdict(list)
    if not template_ids:
        return grouped
    for item in db.scalars(
        select(TemplateExercise)
        .where(TemplateExercise.template_id.in_(template_ids))
        .order_by(TemplateExercise.position)
    ):
        grouped[item.template_id].append(TemplateExerciseOut.model_validate(item))
    return grouped


def _template_out(db: Session, template: WorkoutTemplate) -> TemplateOut:
    exercises = _exercise_map(db, [template.id])
    return TemplateOut(
        id=template.id,
        name=template.name,
        notes=template.notes,
        is_archived=template.is_archived,
        exercises=exercises.get(template.id, []),
    )


def _commit_or_409(db: Session, detail: str = "Template already exists") -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=detail) from exc


@router.get("", response_model=list[TemplateOut])
def list_templates(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TemplateOut]:
    statement = select(WorkoutTemplate).where(WorkoutTemplate.user_id == user.id)
    if not include_archived:
        statement = statement.where(WorkoutTemplate.is_archived.is_(False))
    templates = list(db.scalars(statement.order_by(WorkoutTemplate.name_lower)))
    grouped = _exercise_map(db, [template.id for template in templates])
    return [
        TemplateOut(
            id=template.id,
            name=template.name,
            notes=template.notes,
            is_archived=template.is_archived,
            exercises=grouped.get(template.id, []),
        )
        for template in templates
    ]


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(
    payload: TemplateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TemplateOut:
    name_lower = payload.name.lower()
    if _find_by_name(db, user, name_lower) is not None:
        raise HTTPException(status_code=409, detail="Template already exists")
    _validate_exercises(db, user, payload.exercises)
    template = WorkoutTemplate(
        user_id=user.id,
        name=payload.name,
        name_lower=name_lower,
        notes=payload.notes,
    )
    db.add(template)
    db.flush()
    _replace_exercises(db, template, payload.exercises)
    _commit_or_409(db)
    return _template_out(db, template)


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TemplateOut:
    return _template_out(db, _get_owned(db, user, template_id))


@router.patch("/{template_id}", response_model=TemplateOut)
def patch_template(
    template_id: UUID,
    payload: TemplatePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TemplateOut:
    template = _get_owned(db, user, template_id)
    if "name" in payload.model_fields_set and payload.name is not None:
        name_lower = payload.name.lower()
        existing = _find_by_name(db, user, name_lower)
        if existing is not None and existing.id != template.id:
            raise HTTPException(status_code=409, detail="Template already exists")
        template.name = payload.name
        template.name_lower = name_lower
    if "notes" in payload.model_fields_set:
        template.notes = payload.notes
    if "is_archived" in payload.model_fields_set and payload.is_archived is not None:
        template.is_archived = payload.is_archived
    if "exercises" in payload.model_fields_set and payload.exercises is not None:
        _validate_exercises(db, user, payload.exercises)
        _replace_exercises(db, template, payload.exercises)
    _commit_or_409(db)
    return _template_out(db, template)


@router.delete("/{template_id}", status_code=204)
def delete_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    template = _get_owned(db, user, template_id)
    for workout in list(
        db.scalars(select(Workout).where(Workout.template_id == template.id))
    ):
        workout.template_id = None
    for item in list(
        db.scalars(select(TemplateExercise).where(TemplateExercise.template_id == template.id))
    ):
        db.delete(item)
    db.delete(template)
    db.commit()
    return Response(status_code=204)
