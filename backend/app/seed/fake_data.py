"""Deterministic fake demo data for a fresh user.

`seed_fake_data` generates ~30 days of weight entries, strength workouts and
runs using a seeded RNG so repeated runs with the same seed produce identical
data (given the same calendar date). Intended for demos, local development and
tests, not for production accounts.

Workouts are assembled from the exercise catalog by category and named after
their contents. Every exercise uses a single deterministic working-set scheme:
constant reps, descending reps, or ascending weight with descending reps.
Bodyweight exercises stay in the 10-20 rep range with no weight. Weigh-in days
are skipped pseudo-randomly rather than on fixed weekdays.
"""

import random
from datetime import UTC, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    CardioActivity,
    Exercise,
    SetEntry,
    WeightEntry,
    Workout,
    WorkoutExercise,
)

START_WEIGHT_KG = 82.0
WEIGHT_TREND_KG_PER_DAY = -0.05
WEIGHT_NOISE_KG = 0.4

WORKOUT_WEEKDAYS = (0, 2, 4)  # Mon / Wed / Fri
CARDIO_WEEKDAYS = (1, 3, 5)  # Tue / Thu / Sat

ROUTE_NAMES = ["Riverside Loop", "City Park Circuit", "Canal Trail"]

WEIGHT_NOTES = [
    "Morning weigh-in",
    "After rest day",
    "Ate late last night",
    "Feeling lighter",
]

WARMUP_PROBABILITY = 0.5
RPE_PROBABILITY = 0.3
SKIP_PROBABILITY = 0.12

# Muscle groups that unambiguously identify each workout category in the catalog.
PUSH_MUSCLE_GROUPS = frozenset({"chest", "shoulders", "triceps"})
PULL_MUSCLE_GROUPS = frozenset({"back", "biceps", "traps"})
LEG_MUSCLE_GROUPS = frozenset({"quads", "hamstrings", "glutes", "calves"})

# Cycle of workout kinds; repeated push/pull days get an A/B suffix.
WORKOUT_ROTATION = ("push", "pull", "legs", "full")


def _round_half(value: float) -> float:
    return round(value * 2) / 2


def _bodyweight_exercise(exercise: Exercise) -> bool:
    return exercise.equipment in ("bodyweight", "other")


def _base_weight_kg(rng: random.Random, exercise: Exercise) -> float | None:
    if _bodyweight_exercise(exercise):
        return None
    if exercise.is_compound:
        return _round_half(rng.uniform(40.0, 100.0))
    return _round_half(rng.uniform(10.0, 40.0))


def _working_rep_range(exercise: Exercise) -> tuple[int, int]:
    if _bodyweight_exercise(exercise):
        return 10, 20
    if exercise.is_compound:
        return 5, 10
    return 8, 15


def _descending_reps(rng: random.Random, exercise: Exercise, set_count: int) -> list[int]:
    low, high = _working_rep_range(exercise)
    max_step = max(1, min(3, (high - low) // max(set_count - 1, 1)))
    step = rng.randint(1, max_step)
    floor = low + step * (set_count - 1)
    start = rng.randint(floor, high)
    return [start - step * index for index in range(set_count)]


def _seed_sets(
    db: Session,
    workout_exercise_id: UUID,
    exercise: Exercise,
    working_weight: float | None,
    rng: random.Random,
) -> int:
    """Insert one exercise's sets and return the number of rows created.

    One scheme is chosen per exercise and applied to every working set. A
    compound lift may open with a single warmup set at ~50% of the working
    weight.
    """
    set_number = 1
    created = 0

    if working_weight is not None and exercise.is_compound and rng.random() < WARMUP_PROBABILITY:
        db.add(
            SetEntry(
                workout_exercise_id=workout_exercise_id,
                set_number=set_number,
                weight_kg=_round_half(working_weight * 0.5),
                reps=rng.randint(5, 8),
                is_warmup=True,
            )
        )
        set_number += 1
        created += 1

    set_count = rng.randint(3, 4)
    if working_weight is None:
        scheme = rng.choice(("constant", "descending"))
    else:
        scheme = rng.choice(("constant", "descending", "ascending_weight"))

    if scheme == "constant":
        reps = [rng.randint(*_working_rep_range(exercise))] * set_count
        weights = [working_weight] * set_count
    else:
        reps = _descending_reps(rng, exercise, set_count)
        if scheme == "ascending_weight":
            increment = rng.choice((2.5, 5.0))
            weights = [
                _round_half(working_weight + increment * index) for index in range(set_count)
            ]
        else:
            weights = [working_weight] * set_count

    for reps_value, weight in zip(reps, weights, strict=True):
        rpe = rng.choice([7.0, 7.5, 8.0, 8.5, 9.0]) if rng.random() < RPE_PROBABILITY else None
        db.add(
            SetEntry(
                workout_exercise_id=workout_exercise_id,
                set_number=set_number,
                weight_kg=weight,
                reps=reps_value,
                rpe=rpe,
            )
        )
        set_number += 1
        created += 1

    return created


def _seed_weights(
    db: Session, user_id: UUID, start: datetime, days: int, rng: random.Random
) -> int:
    count = 0
    for day_index in range(days + 1):
        if day_index not in (0, days) and rng.random() < SKIP_PROBABILITY:
            continue
        weight = (
            START_WEIGHT_KG
            + WEIGHT_TREND_KG_PER_DAY * day_index
            + rng.uniform(-WEIGHT_NOISE_KG, WEIGHT_NOISE_KG)
        )
        body_fat = rng.uniform(18.0, 20.0) if rng.random() < 0.25 else None
        notes = rng.choice(WEIGHT_NOTES) if rng.random() < 0.1 else None
        measured_at = start + timedelta(days=day_index)
        db.add(
            WeightEntry(
                user_id=user_id,
                measured_at=datetime.combine(measured_at.date(), time(7, 30), tzinfo=UTC),
                weight_kg=round(weight, 2),
                body_fat_pct=round(body_fat, 1) if body_fat is not None else None,
                notes=notes,
                source="seed",
            )
        )
        count += 1
    return count


def _load_exercises(db: Session, user_id: UUID) -> list[Exercise]:
    return list(
        db.scalars(
            select(Exercise)
            .where(Exercise.user_id == user_id, Exercise.is_archived.is_(False))
            .order_by(Exercise.name)
        )
    )


def _exercise_pools(exercises: list[Exercise]) -> dict[str, list[Exercise]]:
    pools: dict[str, list[Exercise]] = {"push": [], "pull": [], "legs": []}
    for exercise in exercises:
        if exercise.category == "push" and exercise.muscle_group in PUSH_MUSCLE_GROUPS:
            pools["push"].append(exercise)
        elif exercise.category == "pull" and exercise.muscle_group in PULL_MUSCLE_GROUPS:
            pools["pull"].append(exercise)
        elif exercise.category == "legs" and exercise.muscle_group in LEG_MUSCLE_GROUPS:
            pools["legs"].append(exercise)
    return pools


def _sample_exercises(
    rng: random.Random, pools: dict[str, list[Exercise]], workout_type: str
) -> list[Exercise]:
    if workout_type == "full":
        size = rng.randint(4, 6)
        categories = rng.sample(("push", "pull", "legs"), 3)
        base, remainder = divmod(size, len(categories))
        selected: list[Exercise] = []
        for index, category in enumerate(categories):
            take = min(base + (1 if index < remainder else 0), len(pools[category]))
            selected.extend(rng.sample(pools[category], take))
        return selected
    pool = pools[workout_type]
    return rng.sample(pool, min(rng.randint(4, 6), len(pool)))


def _seed_workouts(
    db: Session,
    user_id: UUID,
    start: datetime,
    days: int,
    rng: random.Random,
    exercises: list[Exercise],
) -> tuple[int, int, int]:
    pools = _exercise_pools(exercises)
    if not any(pools.values()):
        return 0, 0, 0

    base_weights = {exercise.id: _base_weight_kg(rng, exercise) for exercise in exercises}
    workout_count = 0
    workout_exercise_count = 0
    set_count = 0
    push_day_names = 0
    pull_day_names = 0

    for day_index in range(days + 1):
        day = start + timedelta(days=day_index)
        if day.weekday() not in WORKOUT_WEEKDAYS:
            continue
        if day_index not in (0, days) and rng.random() < SKIP_PROBABILITY:
            continue

        workout_type = WORKOUT_ROTATION[workout_count % len(WORKOUT_ROTATION)]
        selected = _sample_exercises(rng, pools, workout_type)
        if not selected:
            continue

        if workout_type == "push":
            name = f"Push Day {'A' if push_day_names % 2 == 0 else 'B'}"
            push_day_names += 1
        elif workout_type == "pull":
            name = f"Pull Day {'A' if pull_day_names % 2 == 0 else 'B'}"
            pull_day_names += 1
        elif workout_type == "legs":
            name = "Leg Day"
        else:
            name = "Full Body"

        performed_at = datetime.combine(day.date(), time(18, 0), tzinfo=UTC) + timedelta(
            minutes=rng.randint(0, 45)
        )
        workout = Workout(user_id=user_id, performed_at=performed_at, name=name)
        db.add(workout)
        db.flush()

        week = day_index // 7
        for position, exercise in enumerate(selected):
            workout_exercise = WorkoutExercise(
                workout_id=workout.id,
                exercise_id=exercise.id,
                position=position,
            )
            db.add(workout_exercise)
            db.flush()

            base = base_weights[exercise.id]
            working_weight = None if base is None else _round_half(base + week * 2.5)
            set_count += _seed_sets(db, workout_exercise.id, exercise, working_weight, rng)
            workout_exercise_count += 1

        workout_count += 1

    return workout_count, workout_exercise_count, set_count


def _seed_cardio(
    db: Session, user_id: UUID, start: datetime, days: int, rng: random.Random
) -> int:
    count = 0
    for day_index in range(days + 1):
        day = start + timedelta(days=day_index)
        if day.weekday() not in CARDIO_WEEKDAYS:
            continue
        if day_index not in (0, days) and rng.random() < SKIP_PROBABILITY:
            continue

        distance_km = rng.uniform(5.0, 12.0)
        base_pace_s = rng.uniform(320.0, 375.0)
        pace_s = base_pace_s - day_index * rng.uniform(0.2, 0.6) + rng.uniform(-8.0, 8.0)
        pace_s = min(max(pace_s, 300.0), 375.0)
        duration_s = max(int(distance_km * pace_s), 1)
        performed_at = datetime.combine(day.date(), time(7, 0), tzinfo=UTC) + timedelta(
            minutes=rng.randint(0, 30)
        )
        db.add(
            CardioActivity(
                user_id=user_id,
                performed_at=performed_at,
                type="run",
                distance_m=round(distance_km * 1000, 1),
                duration_s=duration_s,
                avg_hr=rng.randint(140, 165),
                route_name=ROUTE_NAMES[count % len(ROUTE_NAMES)],
                source="seed",
            )
        )
        count += 1
    return count


def seed_fake_data(db: Session, user_id: UUID, days: int = 30, seed: int = 42) -> dict[str, int]:
    """Populate ~`days` of deterministic demo data for `user_id`.

    Returns a summary of the number of rows created in each table.
    """
    rng = random.Random(seed)
    today = datetime.now(UTC)
    start = today - timedelta(days=days)

    weight_count = _seed_weights(db, user_id, start, days, rng)
    exercises = _load_exercises(db, user_id)
    workout_count, workout_exercise_count, set_count = _seed_workouts(
        db, user_id, start, days, rng, exercises
    )
    cardio_count = _seed_cardio(db, user_id, start, days, rng)

    db.commit()
    return {
        "weight_entries": weight_count,
        "workouts": workout_count,
        "workout_exercises": workout_exercise_count,
        "sets": set_count,
        "cardio_activities": cardio_count,
    }
