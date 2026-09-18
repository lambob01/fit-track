from sqlalchemy import select

from app.models import Exercise
from app.seed.exercises import EXERCISES, seed_exercises


def test_exercise_catalog_shape():
    assert len(EXERCISES) == 50
    names = [item["name"].lower() for item in EXERCISES]
    assert len(names) == len(set(names)), "duplicate names in seed catalog"
    required = {"bench press", "squat", "deadlift", "overhead press", "barbell row", "pull-up"}
    assert required.issubset(set(names))
    for item in EXERCISES:
        assert item["category"] in {"push", "pull", "legs", "other"}
        assert isinstance(item["is_compound"], bool)


def test_seed_exercises_idempotent(db, user):
    seed_exercises(db, user.id)
    seed_exercises(db, user.id)  # must not duplicate
    rows = db.scalars(select(Exercise).where(Exercise.user_id == user.id)).all()
    assert len(rows) == 50
