import os
import sqlite3
import subprocess
import sys
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_migration_round_trip_and_constraints(tmp_path):
    db_path = tmp_path / "mig.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path}", "SECRET_KEY": "test"}

    def alembic(*args: str) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", *args],
            cwd=BACKEND_DIR, env=env, capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stderr

    alembic("upgrade", "head")
    alembic("downgrade", "base")

    con = sqlite3.connect(db_path)
    downgraded_tables = {
        row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert "weekly_plans" not in downgraded_tables
    assert "weekly_plan_slots" not in downgraded_tables
    assert "cardio_splits" not in downgraded_tables
    downgraded_columns = {row[1] for row in con.execute("PRAGMA table_info(users)")}
    assert "height_cm" not in downgraded_columns
    assert "goal_weight_target_kg" not in downgraded_columns
    con.close()

    alembic("upgrade", "head")

    con = sqlite3.connect(db_path)
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "exercises" in tables and "workout_templates" in tables
    assert "weekly_plans" in tables and "weekly_plan_slots" in tables and "cardio_splits" in tables

    con.execute("PRAGMA foreign_keys=ON")
    con.execute(
        "INSERT INTO users (id, username, password_hash, unit_system, timezone, created_at, updated_at)"
        " VALUES (?, 'a', 'x', 'metric', 'UTC', '2026-01-01', '2026-01-01')",
        (str(uuid.uuid4()),),
    )
    user_id = con.execute("SELECT id FROM users").fetchone()[0]

    user_columns = {row[1] for row in con.execute("PRAGMA table_info(users)")}
    assert {
        "goal_rate_kg_per_week",
        "goal_monthly_mode",
        "goal_monthly_target_kg",
        "goal_monthly_rate_kg",
        "height_cm",
        "goal_weight_target_date",
        "goal_weight_target_kg",
    } <= user_columns

    migrated_exercise_columns = {row[1] for row in con.execute("PRAGMA table_info(exercises)")}
    assert {
        "goal_weight_kg",
        "goal_reps",
        "goal_target_date",
        "goal_reps_bodyweight",
    } <= migrated_exercise_columns

    exercise_columns = (
        "id, user_id, name, name_lower, muscle_group, category, equipment,"
        " is_compound, is_archived, created_at, updated_at"
    )
    first = (str(uuid.uuid4()), user_id, "Bench Press", "bench press", "chest", "push",
             "barbell", 0, 0, "2026-01-01", "2026-01-01")
    duplicate = (str(uuid.uuid4()), user_id, "bench press", "bench press", "chest", "push",
                 "barbell", 0, 0, "2026-01-01", "2026-01-01")
    con.execute(f"INSERT INTO exercises ({exercise_columns}) VALUES (?,?,?,?,?,?,?,?,?,?,?)", first)
    con.commit()
    try:
        con.execute(f"INSERT INTO exercises ({exercise_columns}) VALUES (?,?,?,?,?,?,?,?,?,?,?)", duplicate)
        raised = False
    except sqlite3.IntegrityError:
        raised = True
    assert raised, "duplicate (user_id, name_lower) must violate the unique constraint"

    workout_id = str(uuid.uuid4())
    con.execute(
        "INSERT INTO workouts (id, user_id, performed_at, created_at, updated_at)"
        " VALUES (?, ?, '2026-01-01', '2026-01-01', '2026-01-01')",
        (workout_id, user_id),
    )
    workout_exercise_id = str(uuid.uuid4())
    con.execute(
        "INSERT INTO workout_exercises (id, workout_id, exercise_id, position, created_at, updated_at)"
        " VALUES (?, ?, ?, 0, '2026-01-01', '2026-01-01')",
        (workout_exercise_id, workout_id, first[0]),
    )
    con.commit()

    set_columns = (
        "id, workout_exercise_id, set_number, weight_kg, reps, rpe, is_warmup, is_drop_set,"
        " notes, created_at, updated_at"
    )

    def try_insert_set(*, weight_kg, reps, parent=workout_exercise_id) -> bool:
        try:
            con.execute(
                f"INSERT INTO sets ({set_columns})"
                " VALUES (?,?,1,?,?,NULL,0,0,NULL,'2026-01-01','2026-01-01')",
                (str(uuid.uuid4()), parent, weight_kg, reps),
            )
            return True
        except sqlite3.IntegrityError:
            return False
        finally:
            con.rollback()

    assert not try_insert_set(weight_kg=80, reps=0), "reps=0 must violate the CHECK"
    assert not try_insert_set(weight_kg=-1, reps=5), "weight=-1 must violate the CHECK"
    assert not try_insert_set(weight_kg=80, reps=5, parent=str(uuid.uuid4())), (
        "a set referencing a missing workout_exercise must violate the FK"
    )
    assert try_insert_set(weight_kg=None, reps=10), "bodyweight (NULL weight) must be allowed"

    index_row = con.execute(
        "SELECT sql FROM sqlite_master WHERE type='index'"
        " AND name='uq_weekly_plans_active_per_user'"
    ).fetchone()
    assert index_row is not None, "the partial unique index must exist"
    assert "WHERE is_active = 1" in index_row[0]

    plan_columns = "id, user_id, name, name_lower, is_active, created_at, updated_at"
    con.execute(
        f"INSERT INTO weekly_plans ({plan_columns}) VALUES (?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), user_id, "Upper/Lower", "upper/lower", 1, "2026-01-01", "2026-01-01"),
    )
    con.commit()
    try:
        con.execute(
            f"INSERT INTO weekly_plans ({plan_columns}) VALUES (?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), user_id, "PPL", "ppl", 1, "2026-01-01", "2026-01-01"),
        )
        second_active_raised = False
    except sqlite3.IntegrityError:
        second_active_raised = True
    assert second_active_raised, "a second active plan must violate the partial unique index"
    con.rollback()

    try:
        con.execute(
            "INSERT INTO users (id, username, password_hash, unit_system, timezone, height_cm,"
            " created_at, updated_at) VALUES (?, 'bad', 'x', 'metric', 'UTC', -1,"
            " '2026-01-01', '2026-01-01')",
            (str(uuid.uuid4()),),
        )
        bad_height_raised = False
    except sqlite3.IntegrityError:
        bad_height_raised = True
    assert bad_height_raised, "height_cm=-1 must violate the CHECK in the migrated schema"
    con.rollback()
    con.close()
