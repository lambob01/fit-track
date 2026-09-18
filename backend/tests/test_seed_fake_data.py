import uuid

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import CardioActivity, User, WeightEntry, Workout
from app.seed.exercises import seed_exercises
from app.seed.fake_data import seed_fake_data


def _fresh_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)(), engine


def _seed_and_snapshot(seed=42):
    db, engine = _fresh_session()
    user = User(id=uuid.uuid4(), username=f"u{seed}", password_hash="x")
    db.add(user)
    db.commit()
    seed_exercises(db, user.id)
    seed_fake_data(db, user.id, days=30, seed=seed)
    weights = [
        row.weight_kg
        for row in db.scalars(select(WeightEntry).order_by(WeightEntry.measured_at))
    ]
    cardio = db.scalars(select(CardioActivity)).all()
    workouts = db.scalars(select(Workout)).all()
    engine.dispose()
    return weights, len(cardio), len(workouts)


def test_fake_data_is_deterministic():
    first = _seed_and_snapshot()
    second = _seed_and_snapshot()
    assert first == second


def test_fake_data_volume_and_realism():
    weights, cardio_count, workout_count = _seed_and_snapshot()
    assert 25 <= len(weights) <= 31, "roughly one weight entry per day"
    assert 6 <= cardio_count <= 16, "~3 runs/week over 30 days"
    assert 8 <= workout_count <= 18, "~3 workouts/week over 30 days"
