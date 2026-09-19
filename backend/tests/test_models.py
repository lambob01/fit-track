from sqlalchemy import UniqueConstraint

from app.models import Base

EXPECTED_TABLES = {
    "users", "weight_entries", "exercises", "workout_templates", "template_exercises",
    "workouts", "workout_exercises", "sets", "cardio_activities",
    "body_measurements", "progress_photos", "tags", "workout_tags", "shoes",
    "weekly_plans", "weekly_plan_slots", "cardio_splits",
}


def test_all_tables_present():
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_named_unique_constraints():
    def names(table_name):
        return {
            c.name
            for c in Base.metadata.tables[table_name].constraints
            if isinstance(c, UniqueConstraint)
        }

    assert "uq_exercises_user_id_name_lower" in names("exercises")
    assert "uq_workout_templates_user_id_name_lower" in names("workout_templates")
    assert "uq_sets_workout_exercise_set_number" in names("sets")
    assert "uq_workout_exercises_workout_position" in names("workout_exercises")
    assert "uq_template_exercises_template_position" in names("template_exercises")
