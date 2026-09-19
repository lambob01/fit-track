import uuid
from datetime import timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    CardioActivity,
    Exercise,
    SetEntry,
    TemplateExercise,
    User,
    WeightEntry,
    Workout,
    WorkoutExercise,
    WorkoutTemplate,
)
from app.seed.exercises import seed_exercises
from app.seed.fake_data import seed_fake_data

PUSH_MUSCLE_GROUPS = {"chest", "shoulders", "triceps"}
PULL_MUSCLE_GROUPS = {"back", "biceps", "traps"}
LEG_MUSCLE_GROUPS = {"quads", "hamstrings", "glutes", "calves"}

EXPECTED_WORKOUT_NAMES = {
    "Push Day A",
    "Push Day B",
    "Pull Day A",
    "Pull Day B",
    "Leg Day",
    "Full Body",
}


def _fresh_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)(), engine


def _seed(db, seed=42):
    user = User(id=uuid.uuid4(), username=f"u{seed}", password_hash="x")
    db.add(user)
    db.commit()
    seed_exercises(db, user.id)
    seed_fake_data(db, user.id, days=30, seed=seed)
    return user


def _workout_details(db):
    details = []
    workouts = db.scalars(select(Workout).order_by(Workout.performed_at)).all()
    for workout in workouts:
        rows = db.execute(
            select(WorkoutExercise, Exercise)
            .join(Exercise, Exercise.id == WorkoutExercise.exercise_id)
            .where(WorkoutExercise.workout_id == workout.id)
            .order_by(WorkoutExercise.position)
        ).all()
        exercises = []
        for workout_exercise, exercise in rows:
            sets = db.scalars(
                select(SetEntry)
                .where(SetEntry.workout_exercise_id == workout_exercise.id)
                .order_by(SetEntry.set_number)
            ).all()
            exercises.append((exercise, sets))
        details.append((workout, exercises))
    return details


def _workout_signature(db):
    return [
        (
            workout.performed_at,
            workout.name,
            [
                (
                    exercise.name,
                    [
                        (
                            entry.set_number,
                            entry.weight_kg,
                            entry.reps,
                            entry.rpe,
                            entry.is_warmup,
                        )
                        for entry in sets
                    ],
                )
                for exercise, sets in exercises
            ],
        )
        for workout, exercises in _workout_details(db)
    ]


def _template_signature(db):
    templates = db.scalars(
        select(WorkoutTemplate).order_by(WorkoutTemplate.name_lower)
    ).all()
    signature = []
    for template in templates:
        rows = db.execute(
            select(TemplateExercise, Exercise)
            .join(Exercise, Exercise.id == TemplateExercise.exercise_id)
            .where(TemplateExercise.template_id == template.id)
            .order_by(TemplateExercise.position)
        ).all()
        signature.append(
            (
                template.name,
                [
                    (
                        exercise.name,
                        row.target_sets,
                        row.target_reps,
                        row.target_weight_kg,
                    )
                    for row, exercise in rows
                ],
            )
        )
    return signature


def _seed_and_snapshot(seed=42):
    db, engine = _fresh_session()
    _seed(db, seed)
    weights = [
        row.weight_kg
        for row in db.scalars(select(WeightEntry).order_by(WeightEntry.measured_at))
    ]
    cardio = db.scalars(select(CardioActivity)).all()
    workouts = db.scalars(select(Workout)).all()
    signature = _workout_signature(db)
    templates = _template_signature(db)
    engine.dispose()
    return weights, len(cardio), len(workouts), signature, templates


def _expected_prefix(muscle_groups):
    groups = set(muscle_groups)
    if groups <= PUSH_MUSCLE_GROUPS:
        return "Push"
    if groups <= PULL_MUSCLE_GROUPS:
        return "Pull"
    if groups <= LEG_MUSCLE_GROUPS:
        return "Leg"
    return "Full"


def test_fake_data_is_deterministic():
    first = _seed_and_snapshot()
    second = _seed_and_snapshot()
    assert first == second


def test_fake_data_volume_and_realism():
    weights, cardio_count, workout_count, _, _ = _seed_and_snapshot()
    assert 25 <= len(weights) <= 31, "roughly one weight entry per day"
    assert 6 <= cardio_count <= 16, "~3 runs/week over 30 days"
    assert 8 <= workout_count <= 18, "~3 workouts/week over 30 days"


def test_fake_data_creates_workout_templates():
    db, engine = _fresh_session()
    _seed(db)
    templates = db.scalars(select(WorkoutTemplate).order_by(WorkoutTemplate.name_lower)).all()
    details = [
        (
            template,
            db.scalars(
                select(TemplateExercise)
                .where(TemplateExercise.template_id == template.id)
                .order_by(TemplateExercise.position)
            ).all(),
        )
        for template in templates
    ]
    engine.dispose()

    assert len(templates) >= 3, "demo data should create workout templates"
    for template, rows in details:
        assert 3 <= len(rows) <= 6, f"{template.name} has {len(rows)} template exercises"
        assert [row.position for row in rows] == list(range(len(rows)))
        for row in rows:
            assert row.target_sets is not None and row.target_sets > 0, (
                f"{template.name} has a non-positive target_sets"
            )
            assert row.target_reps is not None and row.target_reps > 0, (
                f"{template.name} has a non-positive target_reps"
            )


def test_generated_workouts_reference_templates():
    db, engine = _fresh_session()
    _seed(db)
    template_ids = set(db.scalars(select(WorkoutTemplate.id)).all())
    workouts = db.scalars(select(Workout)).all()
    engine.dispose()

    assert len(template_ids) >= 3
    referenced = [workout for workout in workouts if workout.template_id is not None]
    assert referenced, "expected seeded workouts to reference workout templates"
    for workout in referenced:
        assert workout.template_id in template_ids


def test_demo_seed_reuses_an_existing_template_name():
    db, engine = _fresh_session()
    user = User(id=uuid.uuid4(), username="u-existing-template", password_hash="x")
    db.add(user)
    db.commit()
    seed_exercises(db, user.id)
    existing = WorkoutTemplate(user_id=user.id, name="Push Day A", name_lower="push day a")
    db.add(existing)
    db.commit()
    existing_id = existing.id

    summary = seed_fake_data(db, user.id, days=30, seed=42)

    same_name = db.scalars(
        select(WorkoutTemplate).where(WorkoutTemplate.name_lower == "push day a")
    ).all()
    all_count = len(db.scalars(select(WorkoutTemplate.id)).all())
    push_workouts = db.scalars(
        select(Workout).where(Workout.template_id == existing_id)
    ).all()
    engine.dispose()

    assert len(same_name) == 1, "pre-existing template should be reused, not duplicated"
    assert summary["workout_templates"] == 3, "only the other three templates are created"
    assert all_count == 4
    assert push_workouts, "generated push workouts should reference the pre-existing template"


def test_working_sets_follow_realistic_schemes():
    db, engine = _fresh_session()
    _seed(db)
    details = _workout_details(db)
    engine.dispose()

    checked = 0
    for _, exercises in details:
        for exercise, sets in exercises:
            working = [entry for entry in sets if not entry.is_warmup]
            assert len(working) >= 3, f"{exercise.name} has fewer than 3 working sets"
            reps = [entry.reps for entry in working]
            assert reps == sorted(reps, reverse=True), (
                f"{exercise.name} reps {reps} are not constant or descending"
            )
            weights = [entry.weight_kg for entry in working]
            if any(weight is None for weight in weights):
                assert all(weight is None for weight in weights), (
                    f"{exercise.name} mixes weighted and bodyweight working sets"
                )
            else:
                assert weights == sorted(weights), (
                    f"{exercise.name} weights {weights} are neither constant nor ascending"
                )
            checked += 1

    assert checked >= 32, "expected at least 8 workouts with 4 exercises"


def test_working_sets_use_all_three_schemes():
    db, engine = _fresh_session()
    _seed(db)
    details = _workout_details(db)
    engine.dispose()

    schemes = set()
    for _, exercises in details:
        for _, sets in exercises:
            working = [entry for entry in sets if not entry.is_warmup]
            reps = [entry.reps for entry in working]
            weights = [entry.weight_kg for entry in working]
            if len(set(reps)) == 1:
                schemes.add("constant")
            elif len(set(weights)) > 1:
                schemes.add("ascending_weight")
            else:
                schemes.add("descending")

    assert schemes == {"constant", "descending", "ascending_weight"}


def test_bodyweight_working_sets_use_10_to_20_reps():
    db, engine = _fresh_session()
    _seed(db)
    details = _workout_details(db)
    engine.dispose()

    bodyweight_sets = 0
    for _, exercises in details:
        for exercise, sets in exercises:
            for entry in sets:
                if entry.is_warmup or entry.weight_kg is not None:
                    continue
                bodyweight_sets += 1
                assert 10 <= entry.reps <= 20, (
                    f"{exercise.name} bodyweight set has {entry.reps} reps (want 10-20)"
                )

    assert bodyweight_sets > 0, "seed data should include bodyweight working sets"


def test_workout_names_match_their_exercise_muscle_groups():
    db, engine = _fresh_session()
    _seed(db)
    details = _workout_details(db)
    engine.dispose()

    prefixes = set()
    for workout, exercises in details:
        assert workout.name in EXPECTED_WORKOUT_NAMES, f"unexpected name {workout.name!r}"
        muscle_groups = {exercise.muscle_group for exercise, _ in exercises}
        expected = _expected_prefix(muscle_groups)
        assert workout.name.startswith(expected), (
            f"{workout.name!r} contains muscle groups {sorted(muscle_groups)} "
            f"(expected {expected})"
        )
        prefixes.add(workout.name.split()[0])

    assert prefixes == {"Push", "Pull", "Leg", "Full"}


def test_warmup_sets_are_single_light_openers():
    db, engine = _fresh_session()
    _seed(db)
    details = _workout_details(db)
    engine.dispose()

    warmups = 0
    for _, exercises in details:
        for exercise, sets in exercises:
            warmup_sets = [entry for entry in sets if entry.is_warmup]
            assert len(warmup_sets) <= 1, f"{exercise.name} has multiple warmup sets"
            if not warmup_sets:
                continue
            warmup = warmup_sets[0]
            working = [entry for entry in sets if not entry.is_warmup]
            assert warmup.set_number == 1
            assert exercise.is_compound
            assert warmup.weight_kg is not None
            opening_weight = working[0].weight_kg
            assert opening_weight is not None
            assert 0.4 * opening_weight <= warmup.weight_kg <= 0.6 * opening_weight
            warmups += 1

    assert warmups > 0, "seed data should include warmup sets"


def test_weight_entry_gaps_are_not_systematic():
    db, engine = _fresh_session()
    _seed(db)
    dates = [
        row.measured_at.date()
        for row in db.scalars(select(WeightEntry).order_by(WeightEntry.measured_at))
    ]
    engine.dispose()

    present = set(dates)
    first, last = min(present), max(present)
    window = [first + timedelta(days=offset) for offset in range((last - first).days + 1)]
    missing = [day for day in window if day not in present]
    assert missing, "seed data should skip some weigh-in days"
    missing_weekdays = {day.weekday() for day in missing}
    assert len(missing_weekdays) >= 2, (
        f"weigh-in gaps fall on a single weekday set {missing_weekdays}: {missing}"
    )
