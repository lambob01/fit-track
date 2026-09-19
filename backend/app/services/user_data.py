"""FK-safe bulk deletion of every row owned by a user."""

from uuid import UUID

from sqlalchemy import Delete, delete, select
from sqlalchemy.orm import Session

from app.models import (
    BodyMeasurement,
    CardioActivity,
    CardioSplit,
    Exercise,
    ProgressPhoto,
    SetEntry,
    Shoe,
    Tag,
    TemplateExercise,
    WeeklyPlan,
    WeeklyPlanSlot,
    WeightEntry,
    Workout,
    WorkoutExercise,
    WorkoutTag,
    WorkoutTemplate,
)


def _delete(db: Session, statement: Delete) -> int:
    result = db.execute(statement.execution_options(synchronize_session=False))
    return result.rowcount


def delete_user_data(db: Session, user_id: UUID) -> dict[str, int]:
    """Delete all of ``user_id``'s rows in FK-safe order and return per-table counts.

    Children are cleared before parents so the statements work with foreign key
    enforcement on. The user row itself (and therefore its settings) is kept.
    """
    workout_ids = select(Workout.id).where(Workout.user_id == user_id)
    tag_ids = select(Tag.id).where(Tag.user_id == user_id)
    template_ids = select(WorkoutTemplate.id).where(WorkoutTemplate.user_id == user_id)
    workout_exercise_ids = select(WorkoutExercise.id).where(
        WorkoutExercise.workout_id.in_(workout_ids)
    )
    plan_ids = select(WeeklyPlan.id).where(WeeklyPlan.user_id == user_id)
    cardio_ids = select(CardioActivity.id).where(CardioActivity.user_id == user_id)

    statements: list[tuple[str, Delete]] = [
        (
            "workout_tags",
            delete(WorkoutTag).where(
                WorkoutTag.workout_id.in_(workout_ids) | WorkoutTag.tag_id.in_(tag_ids)
            ),
        ),
        ("sets", delete(SetEntry).where(SetEntry.workout_exercise_id.in_(workout_exercise_ids))),
        (
            "workout_exercises",
            delete(WorkoutExercise).where(WorkoutExercise.workout_id.in_(workout_ids)),
        ),
        ("workouts", delete(Workout).where(Workout.user_id == user_id)),
        (
            "weekly_plan_slots",
            delete(WeeklyPlanSlot).where(WeeklyPlanSlot.plan_id.in_(plan_ids)),
        ),
        ("plans", delete(WeeklyPlan).where(WeeklyPlan.user_id == user_id)),
        (
            "template_exercises",
            delete(TemplateExercise).where(TemplateExercise.template_id.in_(template_ids)),
        ),
        ("workout_templates", delete(WorkoutTemplate).where(WorkoutTemplate.user_id == user_id)),
        (
            "cardio_splits",
            delete(CardioSplit).where(CardioSplit.cardio_activity_id.in_(cardio_ids)),
        ),
        ("cardio_activities", delete(CardioActivity).where(CardioActivity.user_id == user_id)),
        ("weight_entries", delete(WeightEntry).where(WeightEntry.user_id == user_id)),
        ("measurements", delete(BodyMeasurement).where(BodyMeasurement.user_id == user_id)),
        ("progress_photos", delete(ProgressPhoto).where(ProgressPhoto.user_id == user_id)),
        ("tags", delete(Tag).where(Tag.user_id == user_id)),
        ("shoes", delete(Shoe).where(Shoe.user_id == user_id)),
        ("exercises", delete(Exercise).where(Exercise.user_id == user_id)),
    ]

    counts = {name: _delete(db, statement) for name, statement in statements}
    db.commit()
    return counts
