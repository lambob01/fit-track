from datetime import datetime

import pytest
from sqlalchemy import UniqueConstraint
from sqlalchemy.exc import IntegrityError

from app.database import Base
from app.models import CardioActivity, CardioSplit, Exercise, User, WeeklyPlan, WeeklyPlanSlot

PHASE2_TABLES = {"weekly_plans", "weekly_plan_slots", "cardio_splits"}
NEW_USER_COLUMNS = {
    "goal_rate_kg_per_week",
    "goal_monthly_mode",
    "goal_monthly_target_kg",
    "goal_monthly_rate_kg",
    "height_cm",
    "goal_weight_target_date",
    "goal_weight_target_kg",
}
NEW_EXERCISE_COLUMNS = {
    "goal_weight_kg",
    "goal_reps",
    "goal_target_date",
    "goal_reps_bodyweight",
}


def test_new_phase2_tables_exist():
    assert PHASE2_TABLES <= set(Base.metadata.tables)


def test_phase2_unique_constraint_names():
    def unique_names(table_name):
        return {
            c.name
            for c in Base.metadata.tables[table_name].constraints
            if isinstance(c, UniqueConstraint)
        }

    assert "uq_weekly_plans_user_id_name_lower" in unique_names("weekly_plans")
    assert "uq_weekly_plan_slots_plan_day" in unique_names("weekly_plan_slots")
    assert "uq_cardio_splits_activity_number" in unique_names("cardio_splits")

    index_names = {i.name for i in Base.metadata.tables["weekly_plans"].indexes}
    assert "uq_weekly_plans_active_per_user" in index_names


def test_users_phase2_columns_nullable():
    columns = Base.metadata.tables["users"].c
    for name in NEW_USER_COLUMNS:
        assert name in columns, f"users.{name} is missing"
        assert columns[name].nullable is True, f"users.{name} must be nullable"


def test_exercises_phase2_columns_nullable():
    columns = Base.metadata.tables["exercises"].c
    for name in NEW_EXERCISE_COLUMNS:
        assert name in columns, f"exercises.{name} is missing"
        assert columns[name].nullable is True, f"exercises.{name} must be nullable"


def test_two_active_plans_per_user_rejected(db, user):
    db.add(
        WeeklyPlan(
            user_id=user.id, name="Upper/Lower", name_lower="upper/lower", is_active=True
        )
    )
    db.commit()

    db.add(WeeklyPlan(user_id=user.id, name="PPL", name_lower="ppl", is_active=True))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_multiple_inactive_plans_allowed(db, user):
    db.add(WeeklyPlan(user_id=user.id, name="Upper/Lower", name_lower="upper/lower"))
    db.add(WeeklyPlan(user_id=user.id, name="PPL", name_lower="ppl"))
    db.commit()


def test_duplicate_plan_day_rejected(db, user):
    plan = WeeklyPlan(user_id=user.id, name="Upper/Lower", name_lower="upper/lower")
    db.add(plan)
    db.commit()

    db.add(WeeklyPlanSlot(plan_id=plan.id, day_of_week=0))
    db.add(WeeklyPlanSlot(plan_id=plan.id, day_of_week=0))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_plan_slot_references_template(db, user):
    plan = WeeklyPlan(user_id=user.id, name="Upper/Lower", name_lower="upper/lower")
    db.add(plan)
    db.commit()

    db.add(WeeklyPlanSlot(plan_id=plan.id, day_of_week=0, template_id=None))
    db.commit()


def test_duplicate_cardio_split_number_rejected(db, user):
    activity = CardioActivity(
        user_id=user.id, performed_at=datetime(2026, 1, 1), distance_m=5000, duration_s=1500
    )
    db.add(activity)
    db.commit()

    db.add(
        CardioSplit(
            cardio_activity_id=activity.id,
            split_number=1,
            distance_m=1000,
            duration_s=300,
        )
    )
    db.add(
        CardioSplit(
            cardio_activity_id=activity.id,
            split_number=1,
            distance_m=1000,
            duration_s=310,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_height_cm_check_rejects_non_positive(db):
    db.add(User(username="shorty", password_hash="x", height_cm=-1))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_goal_rate_check_rejects_zero(db):
    db.add(User(username="steady", password_hash="x", goal_rate_kg_per_week=0))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_exercise_goal_checks_reject_non_positive(db, user):
    db.add(Exercise(user_id=user.id, name="Squat", name_lower="squat", goal_reps=0))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    db.add(
        Exercise(user_id=user.id, name="Deadlift", name_lower="deadlift", goal_weight_kg=-5)
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
