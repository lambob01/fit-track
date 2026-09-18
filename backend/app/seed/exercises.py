"""Seed data for the exercise library."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Exercise

EXERCISES: list[dict] = [
    # Push
    {
        "name": "Bench Press",
        "muscle_group": "chest",
        "category": "push",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Incline Bench Press",
        "muscle_group": "chest",
        "category": "push",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Dumbbell Bench Press",
        "muscle_group": "chest",
        "category": "push",
        "equipment": "dumbbell",
        "is_compound": True,
    },
    {
        "name": "Close-Grip Bench Press",
        "muscle_group": "triceps",
        "category": "push",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Push-Up",
        "muscle_group": "chest",
        "category": "push",
        "equipment": "bodyweight",
        "is_compound": True,
    },
    {
        "name": "Dip",
        "muscle_group": "triceps",
        "category": "push",
        "equipment": "bodyweight",
        "is_compound": True,
    },
    {
        "name": "Overhead Press",
        "muscle_group": "shoulders",
        "category": "push",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Dumbbell Shoulder Press",
        "muscle_group": "shoulders",
        "category": "push",
        "equipment": "dumbbell",
        "is_compound": True,
    },
    {
        "name": "Lateral Raise",
        "muscle_group": "shoulders",
        "category": "push",
        "equipment": "dumbbell",
        "is_compound": False,
    },
    {
        "name": "Front Raise",
        "muscle_group": "shoulders",
        "category": "push",
        "equipment": "dumbbell",
        "is_compound": False,
    },
    {
        "name": "Tricep Pushdown",
        "muscle_group": "triceps",
        "category": "push",
        "equipment": "cable",
        "is_compound": False,
    },
    {
        "name": "Skull Crusher",
        "muscle_group": "triceps",
        "category": "push",
        "equipment": "barbell",
        "is_compound": False,
    },
    {
        "name": "Cable Fly",
        "muscle_group": "chest",
        "category": "push",
        "equipment": "cable",
        "is_compound": False,
    },
    {
        "name": "Pec Deck",
        "muscle_group": "chest",
        "category": "push",
        "equipment": "machine",
        "is_compound": False,
    },
    # Pull
    {
        "name": "Deadlift",
        "muscle_group": "back",
        "category": "pull",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Sumo Deadlift",
        "muscle_group": "glutes",
        "category": "pull",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Barbell Row",
        "muscle_group": "back",
        "category": "pull",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Dumbbell Row",
        "muscle_group": "back",
        "category": "pull",
        "equipment": "dumbbell",
        "is_compound": True,
    },
    {
        "name": "Seated Cable Row",
        "muscle_group": "back",
        "category": "pull",
        "equipment": "cable",
        "is_compound": True,
    },
    {
        "name": "Lat Pulldown",
        "muscle_group": "back",
        "category": "pull",
        "equipment": "cable",
        "is_compound": True,
    },
    {
        "name": "Pull-Up",
        "muscle_group": "back",
        "category": "pull",
        "equipment": "bodyweight",
        "is_compound": True,
    },
    {
        "name": "Chin-Up",
        "muscle_group": "back",
        "category": "pull",
        "equipment": "bodyweight",
        "is_compound": True,
    },
    {
        "name": "Face Pull",
        "muscle_group": "shoulders",
        "category": "pull",
        "equipment": "cable",
        "is_compound": False,
    },
    {
        "name": "Shrug",
        "muscle_group": "traps",
        "category": "pull",
        "equipment": "barbell",
        "is_compound": False,
    },
    {
        "name": "Rear Delt Fly",
        "muscle_group": "shoulders",
        "category": "pull",
        "equipment": "dumbbell",
        "is_compound": False,
    },
    {
        "name": "Upright Row",
        "muscle_group": "shoulders",
        "category": "pull",
        "equipment": "barbell",
        "is_compound": False,
    },
    {
        "name": "Bicep Curl",
        "muscle_group": "biceps",
        "category": "pull",
        "equipment": "dumbbell",
        "is_compound": False,
    },
    {
        "name": "Hammer Curl",
        "muscle_group": "biceps",
        "category": "pull",
        "equipment": "dumbbell",
        "is_compound": False,
    },
    {
        "name": "Preacher Curl",
        "muscle_group": "biceps",
        "category": "pull",
        "equipment": "barbell",
        "is_compound": False,
    },
    {
        "name": "Cable Curl",
        "muscle_group": "biceps",
        "category": "pull",
        "equipment": "cable",
        "is_compound": False,
    },
    # Legs
    {
        "name": "Squat",
        "muscle_group": "quads",
        "category": "legs",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Front Squat",
        "muscle_group": "quads",
        "category": "legs",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Goblet Squat",
        "muscle_group": "quads",
        "category": "legs",
        "equipment": "dumbbell",
        "is_compound": True,
    },
    {
        "name": "Leg Press",
        "muscle_group": "quads",
        "category": "legs",
        "equipment": "machine",
        "is_compound": True,
    },
    {
        "name": "Romanian Deadlift",
        "muscle_group": "hamstrings",
        "category": "legs",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Leg Curl",
        "muscle_group": "hamstrings",
        "category": "legs",
        "equipment": "machine",
        "is_compound": False,
    },
    {
        "name": "Leg Extension",
        "muscle_group": "quads",
        "category": "legs",
        "equipment": "machine",
        "is_compound": False,
    },
    {
        "name": "Calf Raise",
        "muscle_group": "calves",
        "category": "legs",
        "equipment": "machine",
        "is_compound": False,
    },
    {
        "name": "Hip Thrust",
        "muscle_group": "glutes",
        "category": "legs",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Bulgarian Split Squat",
        "muscle_group": "quads",
        "category": "legs",
        "equipment": "dumbbell",
        "is_compound": True,
    },
    {
        "name": "Lunge",
        "muscle_group": "quads",
        "category": "legs",
        "equipment": "dumbbell",
        "is_compound": True,
    },
    # Other
    {
        "name": "Back Extension",
        "muscle_group": "core",
        "category": "other",
        "equipment": "bodyweight",
        "is_compound": False,
    },
    {
        "name": "Ab Wheel",
        "muscle_group": "core",
        "category": "other",
        "equipment": "other",
        "is_compound": False,
    },
    {
        "name": "Plank",
        "muscle_group": "core",
        "category": "other",
        "equipment": "bodyweight",
        "is_compound": False,
    },
    {
        "name": "Hanging Leg Raise",
        "muscle_group": "core",
        "category": "other",
        "equipment": "bodyweight",
        "is_compound": False,
    },
    {
        "name": "Russian Twist",
        "muscle_group": "core",
        "category": "other",
        "equipment": "bodyweight",
        "is_compound": False,
    },
    {
        "name": "Farmer's Carry",
        "muscle_group": "full body",
        "category": "other",
        "equipment": "dumbbell",
        "is_compound": True,
    },
    {
        "name": "Kettlebell Swing",
        "muscle_group": "full body",
        "category": "other",
        "equipment": "kettlebell",
        "is_compound": True,
    },
    {
        "name": "Clean and Press",
        "muscle_group": "full body",
        "category": "other",
        "equipment": "barbell",
        "is_compound": True,
    },
    {
        "name": "Power Clean",
        "muscle_group": "full body",
        "category": "other",
        "equipment": "barbell",
        "is_compound": True,
    },
]


def seed_exercises(db: Session, user_id: UUID) -> int:
    existing = set(
        db.scalars(select(Exercise.name_lower).where(Exercise.user_id == user_id)).all()
    )
    inserted = 0
    for item in EXERCISES:
        name_lower = item["name"].lower()
        if name_lower in existing:
            continue
        db.add(
            Exercise(
                user_id=user_id,
                name=item["name"],
                name_lower=name_lower,
                muscle_group=item["muscle_group"],
                category=item["category"],
                equipment=item["equipment"],
                is_compound=item["is_compound"],
            )
        )
        existing.add(name_lower)
        inserted += 1
    db.commit()
    return inserted
