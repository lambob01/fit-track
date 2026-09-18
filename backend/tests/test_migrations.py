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
    alembic("upgrade", "head")

    con = sqlite3.connect(db_path)
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "exercises" in tables and "workout_templates" in tables

    con.execute("PRAGMA foreign_keys=ON")
    con.execute(
        "INSERT INTO users (id, username, password_hash, unit_system, timezone, created_at, updated_at)"
        " VALUES (?, 'a', 'x', 'metric', 'UTC', '2026-01-01', '2026-01-01')",
        (str(uuid.uuid4()),),
    )
    user_id = con.execute("SELECT id FROM users").fetchone()[0]
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
    con.close()
