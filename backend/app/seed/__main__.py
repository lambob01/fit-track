"""Seed CLI: ``python -m app.seed [--days N] [--seed N] [--reset]``.

Without ``--reset`` the command is idempotent: exercises are skipped when a
name already exists, and fake demo data is only generated when the user has no
weight entries, cardio activities or workouts yet.
"""

import argparse
import sys
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    BodyMeasurement,
    CardioActivity,
    Exercise,
    ProgressPhoto,
    SetEntry,
    Shoe,
    Tag,
    TemplateExercise,
    User,
    WeightEntry,
    Workout,
    WorkoutExercise,
    WorkoutTag,
    WorkoutTemplate,
)
from app.seed.exercises import seed_exercises
from app.seed.fake_data import seed_fake_data
from app.services.users import ensure_default_user


def _resolve_user(db: Session) -> User:
    user = ensure_default_user(db)
    if user is None:
        user = db.scalars(select(User).order_by(User.created_at).limit(1)).one_or_none()
    if user is None:
        print(
            "error: no user exists and APP_USERNAME/APP_PASSWORD_HASH are unset; "
            "set them or create a user first",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return user


def _reset_user_data(db: Session, user_id: UUID) -> None:
    workout_ids = select(Workout.id).where(Workout.user_id == user_id)
    tag_ids = select(Tag.id).where(Tag.user_id == user_id)
    template_ids = select(WorkoutTemplate.id).where(WorkoutTemplate.user_id == user_id)
    workout_exercise_ids = select(WorkoutExercise.id).where(
        WorkoutExercise.workout_id.in_(workout_ids)
    )

    statements = [
        delete(WorkoutTag).where(
            WorkoutTag.workout_id.in_(workout_ids) | WorkoutTag.tag_id.in_(tag_ids)
        ),
        delete(SetEntry).where(SetEntry.workout_exercise_id.in_(workout_exercise_ids)),
        delete(WorkoutExercise).where(WorkoutExercise.workout_id.in_(workout_ids)),
        delete(Workout).where(Workout.user_id == user_id),
        delete(TemplateExercise).where(TemplateExercise.template_id.in_(template_ids)),
        delete(WorkoutTemplate).where(WorkoutTemplate.user_id == user_id),
        delete(CardioActivity).where(CardioActivity.user_id == user_id),
        delete(WeightEntry).where(WeightEntry.user_id == user_id),
        delete(BodyMeasurement).where(BodyMeasurement.user_id == user_id),
        delete(ProgressPhoto).where(ProgressPhoto.user_id == user_id),
        delete(Tag).where(Tag.user_id == user_id),
        delete(Shoe).where(Shoe.user_id == user_id),
        delete(Exercise).where(Exercise.user_id == user_id),
    ]
    for statement in statements:
        db.execute(statement.execution_options(synchronize_session=False))
    db.commit()


def _has_fake_data(db: Session, user_id: UUID) -> bool:
    for model in (WeightEntry, CardioActivity, Workout):
        exists = db.scalar(select(model.id).where(model.user_id == user_id).limit(1))
        if exists is not None:
            return True
    return False


def _count(db: Session, model, user_id: UUID) -> int:
    return (
        db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id)) or 0
    )


def _count_sets(db: Session, user_id: UUID) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(SetEntry)
            .join(WorkoutExercise, SetEntry.workout_exercise_id == WorkoutExercise.id)
            .join(Workout, WorkoutExercise.workout_id == Workout.id)
            .where(Workout.user_id == user_id)
        )
        or 0
    )


def run(days: int = 30, seed: int = 42, reset: bool = False) -> None:
    """Seed the database, optionally wiping the resolved user's data first."""
    with SessionLocal() as db:
        user = _resolve_user(db)
        if reset:
            _reset_user_data(db, user.id)

        seed_exercises(db, user.id)
        generated = not _has_fake_data(db, user.id)
        if generated:
            seed_fake_data(db, user.id, days=days, seed=seed)

        counts = {
            "exercises": _count(db, Exercise, user.id),
            "workouts": _count(db, Workout, user.id),
            "sets": _count_sets(db, user.id),
            "cardio_activities": _count(db, CardioActivity, user.id),
            "weight_entries": _count(db, WeightEntry, user.id),
        }
        note = "" if generated else " (fake data already present; skipped)"
        print(
            f"seeded user {user.username}: {counts['exercises']} exercises, "
            f"{counts['workouts']} workouts, {counts['sets']} sets, "
            f"{counts['cardio_activities']} cardio activities, "
            f"{counts['weight_entries']} weight entries over {days} days{note}"
        )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.seed")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--reset", action="store_true", help="delete the user's data first")
    args = parser.parse_args(argv)
    run(days=args.days, seed=args.seed, reset=args.reset)


if __name__ == "__main__":
    main()
