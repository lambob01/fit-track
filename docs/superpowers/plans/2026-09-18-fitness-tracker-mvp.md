# Fitness Tracker MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a self-hosted single-user fitness tracker MVP (weight, lifting, cardio, dashboard, import/export) as one Docker container with a PWA frontend and a tested FastAPI backend.

**Architecture:** FastAPI serves `/api/*` plus the built React SPA from a single container; SQLite on a mounted volume with WAL + foreign keys; Alembic owns the production schema; analytics (e1RM, PRs, pace, moving average, trendline, bucketing) live in a pure `services/analytics.py`; the frontend converts canonical kg/m/s to display units using the user's settings.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, uv, bcrypt, Starlette SessionMiddleware; pytest + httpx; React 19 + Vite + TS + Tailwind v4, TanStack Query, React Router, Recharts, date-fns-tz, vite-plugin-pwa, Vitest; multi-stage Docker.

## Global Constraints

- All primary keys are UUIDs, serialized as canonical UUID strings.
- Pydantic schemas type ID fields as `uuid.UUID` (ORM attributes are UUID objects); JSON serialization emits canonical UUID strings. Never annotate IDs as `str` in schemas fed from ORM objects.
- All datetimes are stored and transported in UTC; JSON uses ISO 8601 with `Z`.
- Canonical units: kg, meters, seconds, cm. Conversion happens only in the frontend.
- Every route except `GET /api/health` and `POST /api/auth/login` requires the session cookie.
- Auth is applied **per router** via `Depends(get_current_user)`; never app-wide (health must never 401).
- API prefix `/api`; errors use FastAPI `{"detail": ...}`; list endpoints accept `limit` (default 100, max 500) and `offset`.
- Import upload cap: 25 MB, streamed, 413 above.
- No stored PR table, no background jobs, no offline sync, no i18n, no rate limiting, no Sentry.
- Known display-time rules live in `frontend/src/lib/units.ts` and `frontend/src/lib/datetime.ts` only.

## Execution Checkpoints (user-mandated pauses)

- After Step 0 (these docs) — **pause for review**
- After Phase 1 — pause
- After Phase 2 — pause
- After Phase 3 (seed) — pause to eyeball fake data
- After Phase 5 — pause
- After Phase 7 — pause
- Phase 6 view tasks: commit per task, no pause between them

---

## Step 0 — Documentation

- [x] **0.1 Spec doc** written to `docs/superpowers/specs/2026-09-18-fitness-tracker-design.md`, self-reviewed, committed (`docs: add fitness tracker design spec`).
- [ ] **0.2 This plan doc** committed (`docs: add MVP implementation plan`).

---

## Phase 1 — Backend foundation

### Task 1.1: Repository scaffold

**Files:**
- Create: `.gitignore`, `.env.example`, `README.md` (skeleton)
- Create: `data/.gitkeep`

- [ ] **Step 1: Write `.gitignore`**

```gitignore
# Python
__pycache__/
*.py[cod]
.venv/
.pytest_cache/
.ruff_cache/

# Node
node_modules/
frontend/dist/
frontend/src/types/openapi.d.ts

# Env / data / build artifacts
.env
tracker.db*
data/*
!data/.gitkeep
backend/app/static/*
!backend/app/static/.gitkeep

# OS
.DS_Store
```

- [ ] **Step 2: Write `.env.example`** (exact keys; config in Task 1.2 must match)

```dotenv
# Required in production
SECRET_KEY=change-me-to-a-long-random-string
APP_USERNAME=albert
# Generate with: docker compose exec app python -m app.cli hash-password
APP_PASSWORD_HASH=

# Database (container default); dev default is sqlite:///./tracker.db
DATABASE_URL=sqlite:////data/tracker.db

# Set true when served over HTTPS (Caddy/Tailscale)
COOKIE_SECURE=false

# development | production
APP_ENV=development
```

- [ ] **Step 3: Write README skeleton** with sections: Setup (dev), Run (Docker), Backup, env vars — filled in Task 7.3.

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example README.md data/.gitkeep
git commit -m "chore: initialize repository scaffolding"
```

### Task 1.2: uv project and typed config

**Files:**
- Create: `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/config.py`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Produces: `app.config.Settings` (pydantic-settings) with fields `secret_key: str`, `app_username: str`, `app_password_hash: str`, `database_url: str`, `cookie_secure: bool`, `app_env: str`, `session_max_age_s: int = 2592000`, `import_max_bytes: int = 26_214_400`; module-level `settings = Settings()`.

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "tracker-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy>=2.0",
    "alembic>=1.13",
    "pydantic-settings>=2.4",
    "bcrypt>=4.2",
    "itsdangerous>=2.2",
]

[dependency-groups]
dev = ["pytest>=8", "httpx>=0.27", "ruff>=0.6"]

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
```

- [ ] **Step 2: Write the failing test `backend/tests/test_config.py`**

```python
from app.config import Settings


def test_settings_defaults(monkeypatch):
    for key in (
        "DATABASE_URL", "SECRET_KEY", "APP_USERNAME", "APP_PASSWORD_HASH",
        "COOKIE_SECURE", "APP_ENV",
    ):
        monkeypatch.delenv(key, raising=False)
    settings = Settings(_env_file=None)
    assert settings.database_url == "sqlite:///./tracker.db"
    assert settings.cookie_secure is False
    assert settings.app_env == "development"
    assert settings.import_max_bytes == 26_214_400


def test_settings_env_overrides(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/x.db")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    settings = Settings(_env_file=None)
    assert settings.database_url == "sqlite:////tmp/x.db"
    assert settings.cookie_secure is True
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.config'`.

- [ ] **Step 4: Write `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "dev-secret-change-me"
    app_username: str = "albert"
    app_password_hash: str = ""
    database_url: str = "sqlite:///./tracker.db"
    cookie_secure: bool = False
    app_env: str = "development"
    session_max_age_s: int = 2_592_000  # 30 days
    import_max_bytes: int = 26_214_400  # 25 MiB


settings = Settings()
```

Create empty `backend/app/__init__.py`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_config.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/app/__init__.py backend/app/config.py backend/tests/test_config.py
git commit -m "chore(backend): scaffold FastAPI project with typed settings"
```

### Task 1.3: Database engine and SQLAlchemy models

**Files:**
- Create: `backend/app/database.py`, `backend/app/models/__init__.py`, `backend/app/models/{user,weight,exercise,workout,cardio,phase2}.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces: `app.database.Base`, `engine`, `SessionLocal`, `get_db`, `apply_sqlite_pragmas(engine)`; models re-exported from `app.models`: `User, WeightEntry, Exercise, WorkoutTemplate, TemplateExercise, Workout, WorkoutExercise, SetEntry, CardioActivity, BodyMeasurement, ProgressPhoto, Tag, WorkoutTag, Shoe, workout_tags`.
- Conventions: UUIDs via `mapped_column(Uuid, primary_key=True, default=uuid4)`; timestamps via a shared `TimestampMixin` (`created_at`, `updated_at`, server defaults `func.now()`).

- [ ] **Step 1: Write the failing test `backend/tests/test_models.py`**

```python
from sqlalchemy import UniqueConstraint

from app.models import Base


EXPECTED_TABLES = {
    "users", "weight_entries", "exercises", "workout_templates", "template_exercises",
    "workouts", "workout_exercises", "sets", "cardio_activities",
    "body_measurements", "progress_photos", "tags", "workout_tags", "shoes",
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models'`.

- [ ] **Step 3: Write `backend/app/database.py`**

```python
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


def apply_sqlite_pragmas(engine) -> None:
    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


def make_engine(url: str):
    kwargs = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(url, **kwargs)
    apply_sqlite_pragmas(engine)
    return engine


engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Write the models**

Each module defines `Mapped` columns exactly as specified in the spec's schema section. Required shared mixin in `backend/app/models/base.py`:

```python
from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
```

Key model requirements (all from the spec):
- `Exercise`: `__table_args__ = (UniqueConstraint("user_id", "name_lower", name="uq_exercises_user_id_name_lower"), Index("ix_exercises_user_archived", "user_id", "is_archived"))`
- `WorkoutTemplate`: the named unique constraint on `(user_id, name_lower)`, plus `is_archived` and `Index("ix_workout_templates_user_archived", "user_id", "is_archived")`.
- `SetEntry` (`__tablename__ = "sets"`): `weight_kg` nullable, CHECKs (`weight_kg > 0 OR weight_kg IS NULL`, `reps >= 1`, `rpe IS NULL OR (rpe >= 0 AND rpe <= 10)`), unique `(workout_exercise_id, set_number)`. RPE 0.5-step granularity is enforced by Pydantic at the API layer, not the DB.
- `workout_tags` association table: composite PK + `Index("ix_workout_tags_tag_id", "tag_id")`.
- `cardio.py` must not import `phase2` at runtime: use `if TYPE_CHECKING: from app.models.phase2 import Shoe` and `shoe: Mapped["Shoe | None"] = relationship("Shoe")`.
- FKs: all user-owned data `ON DELETE CASCADE`; `workouts.template_id` `ON DELETE SET NULL`; `cardio_activities.shoe_id` `ON DELETE SET NULL`; exercise FKs `ON DELETE RESTRICT`.
- Phase 2 tables exactly as in spec section 5.
- `backend/app/models/__init__.py` re-exports every model and `Base`.

- [ ] **Step 5: Run test to verify structural assertions pass**

Run: `cd backend && uv run pytest tests/test_models.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/database.py backend/app/models backend/tests/test_models.py
git commit -m "feat(db): add SQLAlchemy models for MVP and Phase 2 tables"
```

### Task 1.4: Alembic initial migration (tested both directions)

**Files:**
- Create: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/versions/*_initial_schema.py`
- Test: `backend/tests/test_migrations.py`

**Interfaces:**
- Consumes: `app.database.Base.metadata`, `app.config.settings`.
- Produces: a single initial revision; `alembic upgrade head` creates every table.

- [ ] **Step 0: Apply pre-migration model updates**

Before autogenerating, modify the Task 1.3 models:
- `backend/app/models/workout.py` `SetEntry.__table_args__`: replace the RPE check with `CheckConstraint("rpe IS NULL OR (rpe >= 0 AND rpe <= 10)", name="ck_sets_rpe")` (explicit null handling; 0.5-step granularity is API-enforced).
- `backend/app/models/workout.py` `WorkoutTemplate.__table_args__`: add `Index("ix_workout_templates_user_archived", "user_id", "is_archived")`.
- `backend/app/models/phase2.py` `workout_tags`: add `Index("ix_workout_tags_tag_id", "tag_id")`.
- `backend/app/models/cardio.py`: remove the runtime `from app.models.phase2 import Shoe`; add `if TYPE_CHECKING: from app.models.phase2 import Shoe` and change the mapper line to `shoe: Mapped["Shoe | None"] = relationship("Shoe")`.
- Run `cd backend && uv run pytest tests/test_models.py -v` — expect 2 passed.

- [ ] **Step 1: Initialize Alembic**

Run: `cd backend && uv run alembic init alembic`
Then edit `alembic/env.py` to use the app metadata and settings:

```python
from alembic import context
from app.config import settings
from app.database import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)
target_metadata = Base.metadata
# offline/online run_migrations as generated, unchanged
```

- [ ] **Step 2: Autogenerate the initial migration**

Run: `cd backend && uv run alembic revision --autogenerate -m "initial schema"`
Expected: new file in `alembic/versions/` containing all 14 tables. Manually verify the named unique constraints appear as `sa.UniqueConstraint('user_id', 'name_lower', name='uq_exercises_user_id_name_lower')` and the `workout_templates` equivalent.

- [ ] **Step 3: Write the failing test `backend/tests/test_migrations.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_migrations.py -v`
Expected: PASS (upgrade → downgrade → upgrade all exit 0; duplicate unique, `reps=0`, `weight=-1`, missing-FK, and NULL-weight-set behaviors all as asserted).

**Checkpoint (user-mandated):** report the generated `upgrade()` function before committing; do not commit until the controller confirms.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic.ini backend/alembic backend/tests/test_migrations.py
git commit -m "feat(db): add initial Alembic migration with round-trip test"
```

### Task 1.5: Auth, security, CLI, health endpoint

**Files:**
- Create: `backend/app/security.py`, `backend/app/deps.py`, `backend/app/cli.py`, `backend/app/routers/__init__.py`, `backend/app/routers/auth.py`, `backend/app/main.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_auth.py`, `backend/tests/test_health.py`

**Interfaces:**
- Produces:
  - `app.security.hash_password(password: str) -> str`, `app.security.verify_password(password: str, password_hash: str) -> bool`
  - `app.deps.get_current_user(request: Request, db: Session = Depends(get_db)) -> User` (401 when no/invalid session)
  - `app.main.app` (FastAPI, SessionMiddleware, routers mounted, `/api/health`)
  - CLI: `python -m app.cli hash-password` (getpass + confirm on TTY, first stdin line otherwise), `python -m app.cli backup [--out PATH]`
  - `conftest.py` fixtures: `engine`, `db`, `user` (password `hunter2`), `client`, `auth_client`

- [ ] **Step 1: Write `backend/tests/conftest.py`** (all later tasks depend on these exact fixture names)

```python
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import User
from app.security import hash_password

TEST_PASSWORD = "hunter2"


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine):
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def user(db):
    u = User(
        id=str(uuid.uuid4()),
        username="albert",
        password_hash=hash_password(TEST_PASSWORD),
        unit_system="metric",
        timezone="UTC",
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def client(db):
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_client(client):
    response = client.post(
        "/api/auth/login", json={"username": "albert", "password": TEST_PASSWORD}
    )
    assert response.status_code == 204
    return client
```

- [ ] **Step 2: Write the failing tests**

`backend/tests/test_health.py`:

```python
def test_health_is_public(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

`backend/tests/test_auth.py`:

```python
from fastapi.testclient import TestClient

from app.main import app


def test_login_with_bad_password(client):
    response = client.post("/api/auth/login", json={"username": "albert", "password": "wrong"})
    assert response.status_code == 401


def test_me_requires_session(client):
    assert client.get("/api/auth/me").status_code == 401


def test_login_me_logout_flow(client):
    assert client.post(
        "/api/auth/login", json={"username": "albert", "password": "hunter2"}
    ).status_code == 204
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "albert"
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_health_has_no_auth_dependency():
    schema = app.openapi()
    assert "/api/health" in schema["paths"]
    assert "/api/auth/login" in schema["paths"]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_health.py tests/test_auth.py -v`
Expected: FAIL (`ModuleNotFoundError: app.main` / `app.security`).

- [ ] **Step 4: Write `backend/app/security.py`**

```python
import bcrypt


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    return bcrypt.checkpw(password.encode(), password_hash.encode())
```

- [ ] **Step 5: Write `backend/app/deps.py`**

```python
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.get(User, user_id)
    if user is None:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
```

- [ ] **Step 6: Write `backend/app/routers/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.security import verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    unit_system: str
    timezone: str
    goal_weight_kg: float | None
    weekly_run_goal_m: float | None
    max_hr: int | None

    model_config = {"from_attributes": True}


@router.post("/login", status_code=204)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> None:
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    request.session["user_id"] = user.id


@router.post("/logout", status_code=204)
def logout(request: Request) -> None:
    request.session.clear()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
```

- [ ] **Step 7: Write `backend/app/main.py`** (health is public; routers opt into auth)

```python
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.database import get_db
from app.routers import auth

app = FastAPI(title="Fitness Tracker", version="0.1.0")
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    same_site="lax",
    https_only=settings.cookie_secure,
    max_age=settings.session_max_age_s,
)


@app.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail={"status": "error"})
    return {"status": "ok"}


app.include_router(auth.router)
# Later phases: routers with dependencies=[Depends(get_current_user)] or per-route Depends
```

**Note:** use `Depends(get_db)` (not `SessionLocal`) so tests override the session and never touch the dev database file. `get_db` does not trigger auth; `/api/health` stays public.

**R1 note:** `/api/health` is declared directly on the app with no dependency. Never add it to a protected router or an app-wide dependency.

- [ ] **Step 8: Write `backend/app/cli.py`** (password never via argv)

```python
import argparse
import getpass
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.security import hash_password


def _read_password() -> str:
    if not sys.stdin.isatty():
        line = sys.stdin.readline().strip()
        if not line:
            print("error: empty password on stdin", file=sys.stderr)
            raise SystemExit(1)
        return line
    first = getpass.getpass("Password: ")
    second = getpass.getpass("Confirm password: ")
    if first != second:
        print("error: passwords do not match", file=sys.stderr)
        raise SystemExit(1)
    return first


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("hash-password")
    backup = sub.add_parser("backup")
    backup.add_argument("--out", default=None)
    args = parser.parse_args(argv)

    if args.command == "hash-password":
        print(hash_password(_read_password()))
    elif args.command == "backup":
        source = settings.database_url.removeprefix("sqlite:///")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        target = Path(args.out) if args.out else Path(source).parent / "backups" / f"tracker-{stamp}.db"
        target.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(source) as src, sqlite3.connect(target) as dst:
            src.backup(dst)
        print(target)


if __name__ == "__main__":
    main()
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_auth.py tests/test_health.py -v`
Expected: PASS (5 passed).

Also verify the CLI stdin path:

Run: `cd backend && printf 'secret\n' | uv run python -m app.cli hash-password`
Expected: prints a bcrypt hash beginning `$2b$`; no password in process list.

- [ ] **Step 10: Commit**

```bash
git add backend/app/security.py backend/app/deps.py backend/app/cli.py backend/app/routers backend/app/main.py backend/tests
git commit -m "feat(auth): session login, password CLI, and public health endpoint"
```

### Task 1.6: Settings router and user bootstrap

**Files:**
- Create: `backend/app/services/__init__.py`, `backend/app/services/users.py`, `backend/app/routers/settings.py`, `backend/app/schemas/settings.py`
- Test: `backend/tests/test_settings.py`

**Interfaces:**
- Produces: `app.services.users.ensure_default_user(db) -> User | None` (creates from env when users table is empty; logs once); `GET/PATCH /api/settings`; login calls `ensure_default_user` before lookup.
- PATCH semantics: absent = unchanged; explicit null clears `goal_weight_kg`/`weekly_run_goal_m`/`max_hr`; null on `unit_system`/`timezone` → 422; unknown fields → 422; invalid timezone → 422.

- [ ] **Step 1: Write the failing test `backend/tests/test_settings.py`**

```python
from app.models import User
from app.services.users import ensure_default_user


def test_ensure_default_user_creates_from_env(db, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "app_username", "owner")
    monkeypatch.setattr(settings, "app_password_hash", "$2b$12$abcdefghijklmnopqrstuv")
    user = ensure_default_user(db)
    assert user is not None and user.username == "owner"
    assert ensure_default_user(db) is None  # no-op once present


def test_get_settings(auth_client):
    response = auth_client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["unit_system"] == "metric" and body["timezone"] == "UTC"


def test_patch_absent_fields_unchanged(auth_client):
    auth_client.patch("/api/settings", json={"goal_weight_kg": 80.0})
    response = auth_client.patch("/api/settings", json={"unit_system": "imperial"})
    assert response.json()["goal_weight_kg"] == 80.0
    assert response.json()["unit_system"] == "imperial"


def test_patch_explicit_null_clears_goal(auth_client):
    auth_client.patch("/api/settings", json={"goal_weight_kg": 80.0, "max_hr": 190})
    response = auth_client.patch("/api/settings", json={"goal_weight_kg": None, "max_hr": None})
    assert response.json()["goal_weight_kg"] is None
    assert response.json()["max_hr"] is None


def test_patch_null_on_non_nullable_rejected(auth_client):
    assert auth_client.patch("/api/settings", json={"timezone": None}).status_code == 422
    assert auth_client.patch("/api/settings", json={"unit_system": None}).status_code == 422


def test_patch_invalid_timezone_and_unknown_field(auth_client):
    assert auth_client.patch("/api/settings", json={"timezone": "Mars/Olympus"}).status_code == 422
    assert auth_client.patch("/api/settings", json={"nope": 1}).status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_settings.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.users`).

- [ ] **Step 3: Implement `app/services/users.py`**

```python
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User

logger = logging.getLogger(__name__)


def ensure_default_user(db: Session) -> User | None:
    if db.scalar(select(User).limit(1)) is not None:
        return None
    if not settings.app_username or not settings.app_password_hash:
        logger.warning("No user exists and APP_USERNAME/APP_PASSWORD_HASH are unset; login impossible")
        return None
    user = User(
        username=settings.app_username,
        password_hash=settings.app_password_hash,
        unit_system="metric",
        timezone="UTC",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Created default user %s from environment", user.username)
    return user
```

Call `ensure_default_user(db)` at the top of `login` in `routers/auth.py` (before the user lookup) so first login bootstraps from env.

- [ ] **Step 4: Implement `app/routers/settings.py` and `app/schemas/settings.py`**

```python
# app/schemas/settings.py
from pydantic import BaseModel, ConfigDict, field_validator
from zoneinfo import ZoneInfo


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
    unit_system: str
    timezone: str
    goal_weight_kg: float | None
    weekly_run_goal_m: float | None
    max_hr: int | None


class SettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    unit_system: str | None = None
    timezone: str | None = None
    goal_weight_kg: float | None = None
    weekly_run_goal_m: float | None = None
    max_hr: int | None = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        ZoneInfo(value)  # raises for unknown zones
        return value
```

```python
# app/routers/settings.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.settings import SettingsOut, SettingsPatch

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_settings(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("", response_model=SettingsOut)
def patch_settings(
    payload: SettingsPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    supplied = payload.model_fields_set
    for field in supplied:
        value = getattr(payload, field)
        if value is None and field in {"unit_system", "timezone"}:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
        setattr(user, field, value)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_settings.py -v`
Expected: PASS (6 passed).

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && uv run pytest -v && uv run ruff check .`
Expected: all green, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services backend/app/routers/settings.py backend/app/schemas backend/tests/test_settings.py
git commit -m "feat(settings): user bootstrap and partial-update settings endpoint"
```

---

### Task 1.7: Settings validation hardening (deferred-finding fix)

**Files:**
- Modify: `backend/app/schemas/settings.py`, `backend/tests/test_settings.py`

**Interfaces:**
- Produces: value-domain validation so invalid settings values return 422 instead of a DB `IntegrityError` → 500.

- [ ] **Step 1: Add failing tests to `backend/tests/test_settings.py`**

```python
def test_patch_rejects_out_of_domain_values(auth_client):
    assert auth_client.patch("/api/settings", json={"unit_system": "banana"}).status_code == 422
    assert auth_client.patch("/api/settings", json={"max_hr": 99}).status_code == 422
    assert auth_client.patch("/api/settings", json={"max_hr": 251}).status_code == 422
    assert auth_client.patch("/api/settings", json={"goal_weight_kg": 0}).status_code == 422
    assert auth_client.patch("/api/settings", json={"goal_weight_kg": -5}).status_code == 422
    assert auth_client.patch("/api/settings", json={"weekly_run_goal_m": 0}).status_code == 422


def test_patch_weekly_run_goal_value_and_null(auth_client):
    auth_client.patch("/api/settings", json={"weekly_run_goal_m": 20000})
    assert auth_client.get("/api/settings").json()["weekly_run_goal_m"] == 20000
    auth_client.patch("/api/settings", json={"weekly_run_goal_m": None})
    assert auth_client.get("/api/settings").json()["weekly_run_goal_m"] is None
```

- [ ] **Step 2: Run to verify RED**

Run: `cd backend && uv run pytest tests/test_settings.py -v`
Expected: the out-of-domain tests FAIL with 500 (DB CHECK violation), not 422.

- [ ] **Step 3: Implement**

```python
from typing import Literal

class SettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    unit_system: Literal["metric", "imperial"] | None = None
    timezone: str | None = None
    goal_weight_kg: float | None = Field(default=None, gt=0)
    weekly_run_goal_m: float | None = Field(default=None, gt=0)
    max_hr: int | None = Field(default=None, ge=100, le=250)
    # timezone validator unchanged
```

- [ ] **Step 4: Run to verify GREEN**

Run: `cd backend && uv run pytest -v && uv run ruff check .`
Expected: 20 passed, ruff clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/settings.py backend/tests/test_settings.py
git commit -m "fix(settings): validate value domains so bad input returns 422"
```

## Phase 2 — MVP routers and analytics

### Task 2.0: Pure analytics service

**Files:**
- Create: `backend/app/services/analytics.py`
- Test: `backend/tests/test_analytics.py`

**Interfaces:**
- Produces: `epley_1rm(weight_kg: float, reps: int) -> float | None` (None when reps outside 1..12), `session_volume_kg(sets) -> float`, `session_reps_volume(sets) -> int`, `pace_s_per_km(distance_m: float | None, duration_s: int) -> float | None`, `moving_average(entries: list[tuple[datetime, float]], window_days: int = 7) -> list[float | None]`, `linear_trend(entries: list[tuple[datetime, float]]) -> dict | None`, `bucket_start(dt_utc: datetime, tz: str, bucket: str) -> datetime` (UTC instant of the local bucket start), `last_in_bucket(entries, tz, bucket) -> list[tuple[datetime, float]]`.
- `sets` args are objects with `.weight_kg`, `.reps`, `.is_warmup`.

- [ ] **Step 1: Write the failing test `backend/tests/test_analytics.py`**

```python
from datetime import datetime, timedelta, timezone

import pytest

from app.services.analytics import (
    bucket_start,
    epley_1rm,
    linear_trend,
    moving_average,
    pace_s_per_km,
    session_reps_volume,
    session_volume_kg,
)


class FakeSet:
    def __init__(self, weight_kg, reps, is_warmup=False):
        self.weight_kg = weight_kg
        self.reps = reps
        self.is_warmup = is_warmup


def test_epley_bounds():
    assert epley_1rm(100.0, 1) == pytest.approx(103.33, rel=1e-3)
    assert epley_1rm(100.0, 12) == pytest.approx(140.0)
    assert epley_1rm(100.0, 13) is None
    assert epley_1rm(None, 5) is None
    assert epley_1rm(100.0, 0) is None


def test_volume_excludes_warmups_and_bodyweight():
    sets = [FakeSet(100, 5), FakeSet(100, 5, is_warmup=True), FakeSet(None, 20)]
    assert session_volume_kg(sets) == 500
    assert session_reps_volume(sets) == 25  # 5 + 20; warmups excluded, bodyweight included


def test_pace():
    assert pace_s_per_km(10_000, 3000) == 300.0
    assert pace_s_per_km(None, 3000) is None
    assert pace_s_per_km(0, 3000) is None


def test_moving_average_trailing_window():
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    entries = [
        (base, 80.0),
        (base + timedelta(days=1), 82.0),
        (base + timedelta(days=8), 90.0),
    ]
    values = moving_average(entries)
    assert values[0] == pytest.approx(80.0)
    assert values[1] == pytest.approx(81.0)
    assert values[2] == pytest.approx(90.0)  # first entry aged out of the 7-day window


def test_linear_trend_perfect_line():
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    entries = [(base + timedelta(days=i), 80.0 + 0.1 * i) for i in range(5)]
    trend = linear_trend(entries)
    assert trend is not None
    assert trend["slope_per_day"] == pytest.approx(0.1)
    assert trend["from_value"] == pytest.approx(80.0)
    assert trend["to_value"] == pytest.approx(80.4)
    assert linear_trend([(base, 80.0)]) is None


def test_bucket_start_in_user_timezone():
    # 2026-01-04 is a Sunday; 23:30 London = 23:30 UTC in winter.
    moment = datetime(2026, 1, 4, 23, 30, tzinfo=timezone.utc)
    # ISO Monday start means the week containing Jan 4 begins Dec 29 00:00 London.
    week_start = bucket_start(moment, "Europe/London", "week")
    assert week_start == datetime(2025, 12, 29, 0, 0, tzinfo=timezone.utc)
    assert bucket_start(moment, "Europe/London", "day") == datetime(2026, 1, 4, tzinfo=timezone.utc)
    assert bucket_start(moment, "Europe/London", "month") == datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert bucket_start(moment, "Europe/London", "year") == datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_last_in_bucket_returns_last_entry_and_keeps_last_seen_tie():
    from app.services.analytics import last_in_bucket

    morning = datetime(2026, 1, 5, 8, 0, tzinfo=timezone.utc)
    evening = datetime(2026, 1, 5, 20, 0, tzinfo=timezone.utc)
    # Ordered by (measured_at, created_at); the duplicate evening timestamps
    # model a created_at tie-break, so the later-seen weight must win.
    entries = [(morning, 80.0), (evening, 79.0), (evening, 78.5)]
    assert last_in_bucket(entries, "UTC", "day") == [
        (datetime(2026, 1, 5, tzinfo=timezone.utc), evening, 78.5)
    ]


def test_linear_trend_zero_variance_returns_none():
    same = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert linear_trend([(same, 80.0), (same, 81.0)]) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_analytics.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.analytics`).

- [ ] **Step 3: Implement `backend/app/services/analytics.py`**

```python
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

EPLEY_MAX_REPS = 12
MOVING_AVERAGE_DAYS = 7


def epley_1rm(weight_kg: float | None, reps: int) -> float | None:
    if weight_kg is None or reps < 1 or reps > EPLEY_MAX_REPS:
        return None
    return weight_kg * (1 + reps / 30)


def session_volume_kg(sets) -> float:
    return sum(s.weight_kg * s.reps for s in sets if not s.is_warmup and s.weight_kg is not None)


def session_reps_volume(sets) -> int:
    return sum(s.reps for s in sets if not s.is_warmup)


def pace_s_per_km(distance_m: float | None, duration_s: int) -> float | None:
    if not distance_m:
        return None
    return duration_s / (distance_m / 1000)


def moving_average(entries, window_days: int = MOVING_AVERAGE_DAYS):
    values = []
    for index, (moment, _weight) in enumerate(entries):
        window_start = moment - timedelta(days=window_days)
        window = [w for t, w in entries[: index + 1] if window_start < t <= moment]
        values.append(sum(window) / len(window))
    return values


def linear_trend(entries):
    if len(entries) < 2:
        return None
    base = entries[0][0]
    xs = [(t - base).total_seconds() / 86400 for t, _ in entries]
    ys = [w for _, w in entries]
    n = len(xs)
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator == 0:
        return None
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denominator
    intercept = mean_y - slope * mean_x
    return {
        "slope_per_day": slope,
        "intercept": intercept,
        "from_value": intercept,
        "to_value": intercept + slope * xs[-1],
    }


def _local(dt_utc: datetime, tz: str) -> datetime:
    return dt_utc.astimezone(ZoneInfo(tz))


def bucket_start(dt_utc: datetime, tz: str, bucket: str) -> datetime:
    local = _local(dt_utc, tz)
    if bucket == "day":
        start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    elif bucket == "week":
        start = (local - timedelta(days=local.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    elif bucket == "month":
        start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif bucket == "year":
        start = local.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        raise ValueError(f"unknown bucket: {bucket}")
    return start.astimezone(timezone.utc)


def last_in_bucket(entries, tz: str, bucket: str):
    """Return (bucket_start, measured_at, weight_kg) per bucket, ascending.

    Callers must pass entries ordered by (measured_at, created_at); equal
    timestamps keep the later-seen row (matches the spec's created_at tie-break).
    """
    grouped: dict[datetime, tuple[datetime, float]] = {}
    for moment, weight in entries:
        key = bucket_start(moment, tz, bucket)
        current = grouped.get(key)
        if current is None or moment >= current[0]:
            grouped[key] = (moment, weight)
    return [(key, grouped[key][0], grouped[key][1]) for key in sorted(grouped)]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_analytics.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics.py backend/tests/test_analytics.py
git commit -m "feat(analytics): e1RM, volume, pace, moving average, trend, bucketing"
```

### Task 2.1: Exercises router (archive lifecycle + resolve)

**Files:**
- Create: `backend/app/routers/exercises.py`, `backend/app/schemas/exercise.py`
- Test: `backend/tests/test_exercises.py`

**Interfaces:**
- Consumes: `get_current_user`, `get_db`, models.
- Produces: endpoints exactly as spec section “exercises”; `ExerciseOut` with `id, name, muscle_group, category, equipment, is_compound, is_archived`.

- [ ] **Step 1: Write the failing test `backend/tests/test_exercises.py`**

```python
import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Exercise


def test_create_and_duplicate(auth_client):
    created = auth_client.post("/api/exercises", json={"name": "Bench Press"})
    assert created.status_code == 201
    again = auth_client.post("/api/exercises", json={"name": "bench press"})
    assert again.status_code == 409


def test_duplicate_name_violates_db_constraint(db, user):
    db.add(Exercise(id=str(uuid.uuid4()), user_id=user.id, name="Bench Press", name_lower="bench press"))
    db.commit()
    db.add(Exercise(id=str(uuid.uuid4()), user_id=user.id, name="bench press", name_lower="bench press"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_resolve_creates_then_reuses_case_insensitively(auth_client):
    first = auth_client.post("/api/exercises/resolve", json={"name": "  Zercher Squat "})
    assert first.status_code == 200
    body = first.json()
    assert body["created"] is True
    assert body["name"] == "Zercher Squat" and body["is_archived"] is False
    second = auth_client.post("/api/exercises/resolve", json={"name": "zercher squat"})
    assert second.status_code == 200
    assert second.json() == {**body, "created": False}


def test_archive_excludes_from_listing_but_stays_resolvable(auth_client):
    exercise = auth_client.post("/api/exercises", json={"name": "Deadlift"}).json()
    patched = auth_client.patch(f"/api/exercises/{exercise['id']}", json={"is_archived": True})
    assert patched.status_code == 200 and patched.json()["is_archived"] is True

    names = [e["name"] for e in auth_client.get("/api/exercises").json()]
    assert "Deadlift" not in names
    names = [e["name"] for e in auth_client.get("/api/exercises?include_archived=true").json()]
    assert "Deadlift" in names

    resolved = auth_client.post("/api/exercises/resolve", json={"name": "deadlift"}).json()
    assert resolved["id"] == exercise["id"]
    assert resolved["is_archived"] is True and resolved["created"] is False

    restored = auth_client.patch(f"/api/exercises/{exercise['id']}", json={"is_archived": False})
    assert restored.json()["is_archived"] is False


def test_search_and_filters(auth_client):
    auth_client.post("/api/exercises", json={"name": "Incline Bench", "category": "push", "muscle_group": "chest"})
    auth_client.post("/api/exercises", json={"name": "Barbell Row", "category": "pull", "muscle_group": "back"})
    hits = auth_client.get("/api/exercises?q=bench").json()
    assert [e["name"] for e in hits] == ["Incline Bench"]
    pushes = auth_client.get("/api/exercises?category=push").json()
    assert [e["name"] for e in pushes] == ["Incline Bench"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_exercises.py -v`
Expected: FAIL (`404` because router not mounted / module missing).

- [ ] **Step 3: Implement `app/schemas/exercise.py` and `app/routers/exercises.py`**

Key implementation points:
- `router = APIRouter(prefix="/api/exercises", tags=["exercises"], dependencies=[Depends(get_current_user)])`; user obtained via `Depends(get_current_user)` where the handler needs `user.id`.
- Create: `name = payload.name.strip()`, `name_lower = name.lower()`, duplicate check via `select(Exercise).where(Exercise.user_id == user.id, Exercise.name_lower == name_lower)` → 409.
- Resolve: same lookup including archived; if found return `{id, name, is_archived, created: False}`; else create with defaults `muscle_group/category/equipment='other'`, `is_compound=False` → `created: True`.
- List: `include_archived` (default false) filters `is_archived.is_(False)`; `q` → `Exercise.name_lower.contains(q.strip().lower())`; plus `category`, `muscle_group` filters; `limit`/`offset`.
- PATCH: partial via `model_fields_set`; `name` rewrites `name_lower` and 409s on collision; `is_archived` toggles.
- No DELETE route.
- Mount in `main.py`: `app.include_router(exercises.router)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_exercises.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/exercises.py backend/app/schemas/exercise.py backend/app/main.py backend/tests/test_exercises.py
git commit -m "feat(exercises): library CRUD with archive lifecycle and resolve"
```

### Task 2.2: Weight entries and series endpoint

**Files:**
- Create: `backend/app/routers/weight.py`, `backend/app/schemas/weight.py`
- Test: `backend/tests/test_weight.py`

**Interfaces:**
- Consumes: `analytics.moving_average`, `linear_trend`, `last_in_bucket`.
- Produces: CRUD `/api/weight/entries`; `GET /api/weight/series` response:
  `{bucket, from, to, points: [{bucket_start, measured_at, weight_kg}], moving_average: [{measured_at, value}], trend: {...}|null, goal_weight_kg: float|null}`.

- [ ] **Step 1: Write the failing test `backend/tests/test_weight.py`**

```python
def test_weight_crud_and_validation(auth_client):
    created = auth_client.post(
        "/api/weight/entries",
        json={"measured_at": "2026-09-01T06:00:00Z", "weight_kg": 80.5, "body_fat_pct": 18.0},
    )
    assert created.status_code == 201
    assert created.json()["weight_kg"] == 80.5
    assert auth_client.post(
        "/api/weight/entries", json={"measured_at": "2026-09-01T06:00:00Z", "weight_kg": 0}
    ).status_code == 422
    assert auth_client.post(
        "/api/weight/entries",
        json={"measured_at": "2026-09-01T06:00:00Z", "weight_kg": 80, "body_fat_pct": 100},
    ).status_code == 422


def test_series_day_bucket_uses_last_measurement(auth_client):
    for ts, kg in [("2026-09-01T06:00:00Z", 80.0), ("2026-09-01T20:00:00Z", 79.5)]:
        auth_client.post("/api/weight/entries", json={"measured_at": ts, "weight_kg": kg})
    response = auth_client.get(
        "/api/weight/series?from=2026-09-01T00:00:00Z&to=2026-09-02T00:00:00Z&bucket=day"
    )
    body = response.json()
    assert len(body["points"]) == 1
    assert body["points"][0]["weight_kg"] == 79.5
    assert body["points"][0]["measured_at"] == "2026-09-01T20:00:00Z"


def test_series_week_bucket_in_user_timezone(auth_client):
    auth_client.patch("/api/settings", json={"timezone": "Europe/London"})
    # Sunday 23:30 London (winter) belongs to the ISO week starting Monday Dec 29.
    auth_client.post(
        "/api/weight/entries", json={"measured_at": "2026-01-04T23:30:00Z", "weight_kg": 81.0}
    )
    body = auth_client.get(
        "/api/weight/series?from=2025-12-28T00:00:00Z&to=2026-01-05T00:00:00Z&bucket=week"
    ).json()
    assert len(body["points"]) == 1
    assert body["points"][0]["bucket_start"] == "2025-12-29T00:00:00Z"


def test_series_goal_null_semantics(auth_client):
    auth_client.post("/api/weight/entries", json={"measured_at": "2026-09-01T06:00:00Z", "weight_kg": 80})
    unset = auth_client.get("/api/weight/series").json()
    assert unset["goal_weight_kg"] is None
    auth_client.patch("/api/settings", json={"goal_weight_kg": 75.0})
    set_goal = auth_client.get("/api/weight/series").json()
    assert set_goal["goal_weight_kg"] == 75.0


def test_series_moving_average_and_trend(auth_client):
    for day in range(1, 9):
        auth_client.post(
            "/api/weight/entries",
            json={"measured_at": f"2026-09-{day:02d}T06:00:00Z", "weight_kg": 80 + day * 0.1},
        )
    body = auth_client.get("/api/weight/series?from=2026-09-01T00:00:00Z&to=2026-09-09T00:00:00Z").json()
    assert len(body["moving_average"]) == 8
    # 8th entry at Sep 8: trailing 7-day window excludes Sep 1.
    assert body["moving_average"][-1]["value"] == pytest.approx((80.2 + 80.3 + 80.4 + 80.5 + 80.6 + 80.7 + 80.8) / 7)
    assert body["trend"]["slope_per_day"] == pytest.approx(0.1)
```

Add `import pytest` at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_weight.py -v`
Expected: FAIL (404 / module missing).

- [ ] **Step 3: Implement**

- Schemas: `WeightEntryCreate` (`measured_at: datetime`, `weight_kg: float = Field(gt=0)`, `body_fat_pct: float | None = Field(default=None, gt=0, lt=100)`, `notes: str | None`), `WeightEntryPatch` (all optional, `model_fields_set` semantics), `WeightEntryOut`.
- Router CRUD with ownership checks (`db.get(WeightEntry, id)` + `entry.user_id != user.id → 404`).
- Series handler: load user's entries in `[from, to]` ordered by `(measured_at, created_at)` (defaults: `to = now UTC`, `from = to - 90 days`, `bucket = "day"`), map to `(measured_at, weight_kg)`, call `moving_average` and `linear_trend` from `app.services.analytics`, and unpack `last_in_bucket(entries, user.timezone, bucket)` triples into points `{bucket_start, measured_at, weight_kg}`.
- Ensure `measured_at` is coerced to UTC: if naive → 422; if aware → `astimezone(timezone.utc)`.
- Mount router in `main.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_weight.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/weight.py backend/app/schemas/weight.py backend/app/main.py backend/tests/test_weight.py
git commit -m "feat(weight): entries and series with last-in-bucket, MA7, trend, goal"
```

### Task 2.3: Workouts router (idempotent nested create, fast set path, progress, PRs)

**Files:**
- Create: `backend/app/routers/workouts.py`, `backend/app/schemas/workout.py`
- Test: `backend/tests/test_workouts.py`

**Interfaces:**
- Produces: endpoints per spec section “workouts”; nested response shape `{id, performed_at, name, template_id, notes, exercises: [{id, exercise_id, position, notes, superset_group, sets: [...]}]}`; PR payload per spec.
- Consumes: `epley_1rm`, `session_volume_kg`, `session_reps_volume`.

- [ ] **Step 1: Write the failing tests `backend/tests/test_workouts.py`** (covers R7 explicitly)

```python
import uuid
from datetime import datetime, timezone

import pytest

from app.models import User, Workout


def _payload(exercise_id, workout_id=None):
    return {
        "id": workout_id or str(uuid.uuid4()),
        "performed_at": "2026-09-18T17:30:00Z",
        "name": "Push Day A",
        "exercises": [
            {
                "id": str(uuid.uuid4()),
                "exercise_id": exercise_id,
                "position": 0,
                "sets": [
                    {"id": str(uuid.uuid4()), "weight_kg": 80.0, "reps": 5},
                    {"id": str(uuid.uuid4()), "weight_kg": 82.5, "reps": 3, "is_warmup": False},
                ],
            }
        ],
    }


def test_nested_create_and_get(auth_client, exercise):
    payload = _payload(exercise["id"])
    created = auth_client.post("/api/workouts", json=payload)
    assert created.status_code == 201
    body = created.json()
    assert body["exercises"][0]["sets"][1]["weight_kg"] == 82.5
    fetched = auth_client.get(f"/api/workouts/{payload['id']}")
    assert fetched.status_code == 200
    assert len(fetched.json()["exercises"][0]["sets"]) == 2


def test_workout_upsert_replay_is_idempotent(auth_client, exercise):
    payload = _payload(exercise["id"])
    first = auth_client.post("/api/workouts", json=payload)
    assert first.status_code == 201
    first_set_ids = [s["id"] for s in first.json()["exercises"][0]["sets"]]
    first_numbers = [s["set_number"] for s in first.json()["exercises"][0]["sets"]]
    assert first_numbers == [1, 2]

    replay = auth_client.post("/api/workouts", json=payload)
    assert replay.status_code == 200
    assert [s["id"] for s in replay.json()["exercises"][0]["sets"]] == first_set_ids
    assert [s["set_number"] for s in replay.json()["exercises"][0]["sets"]] == first_numbers

    listing = auth_client.get("/api/workouts").json()
    assert len(listing) == 1  # no duplicate workout from the retry


def test_workout_uuid_owned_by_other_user_forbidden(auth_client, db, exercise):
    other = User(
        id=str(uuid.uuid4()), username="other", password_hash="x",
        unit_system="metric", timezone="UTC",
    )
    db.add(other)
    db.commit()
    workout = Workout(
        id=str(uuid.uuid4()), user_id=other.id,
        performed_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
    )
    db.add(workout)
    db.commit()

    response = auth_client.post("/api/workouts", json=_payload(exercise["id"], str(workout.id)))
    assert response.status_code == 403


def test_set_number_assigned_when_omitted_and_duplicate_rejected(auth_client, exercise):
    workout_id, wex_id = str(uuid.uuid4()), str(uuid.uuid4())
    payload = _payload(exercise["id"], workout_id)
    payload["exercises"][0]["id"] = wex_id
    for index, s in enumerate(payload["exercises"][0]["sets"]):
        s.pop("set_number", None)
    assert auth_client.post("/api/workouts", json=payload).status_code == 201

    duplicate_numbers = _payload(exercise["id"], str(uuid.uuid4()))
    duplicate_numbers["exercises"][0]["sets"][0]["set_number"] = 1
    duplicate_numbers["exercises"][0]["sets"][1]["set_number"] = 1
    assert auth_client.post("/api/workouts", json=duplicate_numbers).status_code == 422


def test_fast_set_add_increments_number(auth_client, exercise):
    created = auth_client.post("/api/workouts", json=_payload(exercise["id"])).json()
    workout_exercise_id = created["exercises"][0]["id"]
    response = auth_client.post(
        f"/api/workout-exercises/{workout_exercise_id}/sets",
        json={"weight_kg": 85.0, "reps": 1},
    )
    assert response.status_code == 201
    assert response.json()["set_number"] == 3


def test_progress_and_prs_bodyweight_only(auth_client, exercise):
    payload = _payload(exercise["id"])
    payload["exercises"][0]["sets"] = [
        {"weight_kg": None, "reps": 10},
        {"weight_kg": None, "reps": 12},
        {"weight_kg": 200.0, "reps": 1, "is_warmup": True},
    ]
    auth_client.post("/api/workouts", json=payload)

    session = auth_client.get(f"/api/exercises/{exercise['id']}/progress").json()["sessions"][0]
    assert session["volume_kg"] == 0
    assert session["reps_volume"] == 22
    assert session["top_set_kg"] is None
    assert session["e1rm_kg"] is None

    prs = auth_client.get(f"/api/exercises/{exercise['id']}/prs").json()
    assert prs["best_reps"]["reps"] == 12
    assert prs["heaviest_weight"] is None
    assert prs["best_e1rm"] is None
    assert prs["best_session_volume"] is None


def test_e1rm_excluded_above_12_reps_but_volume_counted(auth_client, exercise):
    payload = _payload(exercise["id"])
    payload["exercises"][0]["sets"] = [{"weight_kg": 100.0, "reps": 13}]
    auth_client.post("/api/workouts", json=payload)

    session = auth_client.get(f"/api/exercises/{exercise['id']}/progress").json()["sessions"][0]
    assert session["volume_kg"] == 1300
    assert session["top_set_kg"] == 100.0
    assert session["e1rm_kg"] is None  # reps > 12 are excluded from e1RM only

    prs = auth_client.get(f"/api/exercises/{exercise['id']}/prs").json()
    assert prs["heaviest_weight"]["weight_kg"] == 100.0
    assert prs["best_e1rm"] is None
    assert prs["best_session_volume"]["volume_kg"] == 1300
    assert prs["best_reps"]["reps"] == 13


def test_last_performance_returns_latest_sets(auth_client, exercise):
    auth_client.post("/api/workouts", json=_payload(exercise["id"]))
    response = auth_client.get(f"/api/exercises/{exercise['id']}/last-performance")
    assert response.status_code == 200
    assert len(response.json()["sets"]) == 2
```

Add the `exercise` fixture to `conftest.py`:

```python
@pytest.fixture()
def exercise(auth_client):
    return auth_client.post("/api/exercises", json={"name": "Bench Press", "category": "push"}).json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_workouts.py -v`
Expected: FAIL (router not mounted).

- [ ] **Step 3: Implement**

Order of operations for `POST /api/workouts`:
1. Parse body; validate `set_number`s unique per exercise when supplied (model validator).
2. `db.get(Workout, payload.id)` unscoped: if found and `user_id != current` → 403; if found and same user → replace mode (delete `workout_exercises` via ORM cascade, flush, update metadata), status 200; else create, status 201.
3. For each exercise item: create `WorkoutExercise` (honor provided `id`; if that id exists already under a different workout → 409), assign `position` from payload.
4. For each set: `set_number = provided or index + 1`; validate uniqueness → 409/422.
5. Commit, reload with `selectinload`, return nested payload.

Other routes:
- `GET /api/workouts` summaries compute `volume_kg` with `session_volume_kg`.
- `GET /api/workouts/{id}` nested (404 for other users — do not leak existence).
- `PATCH/DELETE` metadata; `POST /{id}/exercises`; `PATCH/DELETE /api/workout-exercises/{id}`; `POST /api/workout-exercises/{id}/sets` (set_number = max+1); `PATCH/DELETE /api/sets/{id}`.
- `GET /api/exercises/{id}/progress` groups non-warmup sets by workout, computes `top_set_kg`, `e1rm_kg` (max `epley_1rm`), `volume_kg`, `reps_volume`; sorted ascending.
- `GET /api/exercises/{id}/prs` computes the four PRs per spec; archived exercises included (no archive filter).
- `GET /api/exercises/{id}/last-performance` returns the most recent workout’s sets or `null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_workouts.py -v`
Expected: PASS (8 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/workouts.py backend/app/schemas/workout.py backend/app/main.py backend/tests/conftest.py backend/tests/test_workouts.py
git commit -m "feat(workouts): idempotent nested logging, fast set path, progress, PRs"
```

### Task 2.4: Templates and start-from-template

**Files:**
- Create: `backend/app/routers/templates.py`, `backend/app/schemas/template.py`
- Test: `backend/tests/test_templates.py`

- [ ] **Step 1: Write the failing tests `backend/tests/test_templates.py`** (R6 + R9)

```python
def test_template_crud_and_archive_listing(auth_client, exercise):
    created = auth_client.post(
        "/api/templates",
        json={
            "name": "Push Day A",
            "exercises": [
                {"exercise_id": exercise["id"], "position": 0, "target_sets": 3,
                 "target_reps": 8, "target_weight_kg": 60.0}
            ],
        },
    )
    assert created.status_code == 201
    template = created.json()

    archived = auth_client.patch(f"/api/templates/{template['id']}", json={"is_archived": True})
    assert archived.json()["is_archived"] is True
    assert template["id"] not in [t["id"] for t in auth_client.get("/api/templates").json()]
    listed = auth_client.get("/api/templates?include_archived=true").json()
    assert template["id"] in [t["id"] for t in listed]


def test_from_template_creates_workout_with_planned_zero_sets(auth_client, exercise):
    template = auth_client.post(
        "/api/templates",
        json={
            "name": "Push Day A",
            "exercises": [
                {"exercise_id": exercise["id"], "position": 0, "target_sets": 3,
                 "target_reps": 8, "target_weight_kg": 60.0},
                {"exercise_id": exercise["id"], "position": 1, "target_sets": 2},
            ],
        },
    ).json()
    response = auth_client.post(f"/api/workouts/from-template/{template['id']}")
    assert response.status_code == 201
    body = response.json()

    workout = body["workout"]
    assert len(workout["exercises"]) == 2
    assert all(item["sets"] == [] for item in workout["exercises"])
    assert body["planned"] == [
        {"exercise_id": exercise["id"], "position": 0, "sets": 3, "reps": 8, "weight_kg": 60.0},
        {"exercise_id": exercise["id"], "position": 1, "sets": 2, "reps": None, "weight_kg": None},
    ]


def test_from_template_resumes_like_get_workout(auth_client, exercise):
    template = auth_client.post(
        "/api/templates",
        json={
            "name": "Leg Day",
            "exercises": [{"exercise_id": exercise["id"], "position": 0, "target_sets": 1}],
        },
    ).json()
    body = auth_client.post(f"/api/workouts/from-template/{template['id']}").json()
    fetched = auth_client.get(f"/api/workouts/{body['workout']['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == body["workout"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_templates.py -v`
Expected: FAIL (404 / module missing).

- [ ] **Step 3: Implement**

- Nested template CRUD; `name_lower` uniqueness (409); `is_archived` PATCH; `?include_archived`.
- `POST /api/workouts/from-template/{template_id}`: load template (any archive state, 404 for other users), create `Workout` with `name=template.name`, `template_id=template.id`, `performed_at=now UTC`, copy `template_exercises` → `workout_exercises` (ordered), **no sets**. Respond 201 with `{workout: <nested payload>, planned: [{exercise_id, position, sets: target_sets or 0, reps: target_reps, weight_kg: target_weight_kg}]}`.
- Mount both routers.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_templates.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/templates.py backend/app/schemas/template.py backend/app/main.py backend/tests/test_templates.py
git commit -m "feat(templates): routine CRUD, archiving, and start-from-template"
```

### Task 2.5: Cardio router

**Files:**
- Create: `backend/app/routers/cardio.py`, `backend/app/schemas/cardio.py`
- Test: `backend/tests/test_cardio.py`

- [ ] **Step 1: Write the failing tests `backend/tests/test_cardio.py`**

```python
def test_activity_crud_and_pace(auth_client):
    created = auth_client.post(
        "/api/cardio",
        json={"performed_at": "2026-09-18T06:00:00Z", "type": "run",
              "distance_m": 10000, "duration_s": 3000, "avg_hr": 150, "route_name": "River loop"},
    )
    assert created.status_code == 201
    assert created.json()["pace_s_per_km"] == 300.0
    assert auth_client.post(
        "/api/cardio",
        json={"performed_at": "2026-09-18T06:00:00Z", "type": "run", "duration_s": 0},
    ).status_code == 422


def test_summary_totals(auth_client):
    for distance, duration in [(5000, 1500), (10000, 3300)]:
        auth_client.post("/api/cardio", json={
            "performed_at": "2026-09-15T06:00:00Z", "type": "run",
            "distance_m": distance, "duration_s": duration,
        })
    body = auth_client.get(
        "/api/cardio/summary?from=2026-09-14T00:00:00Z&to=2026-09-21T00:00:00Z&type=run"
    ).json()
    assert body["total_distance_m"] == 15000
    assert body["total_duration_s"] == 4800
    assert body["activity_count"] == 2
    assert body["avg_pace_s_per_km"] == pytest.approx(320.0)
    assert "weekly_goal_m" not in body  # goal omitted for range summaries


def test_week_goal_null_and_set(auth_client):
    auth_client.post("/api/cardio", json={
        "performed_at": "2026-09-15T06:00:00Z", "type": "run",
        "distance_m": 5000, "duration_s": 1500,
    })
    unset = auth_client.get("/api/cardio/week?week_start=2026-09-14").json()
    assert unset["weekly_goal_m"] is None and unset["goal_progress_pct"] is None
    auth_client.patch("/api/settings", json={"weekly_run_goal_m": 20000})
    set_goal = auth_client.get("/api/cardio/week?week_start=2026-09-14").json()
    assert set_goal["weekly_goal_m"] == 20000
    assert set_goal["goal_progress_pct"] == 25.0


def test_other_cardio_types_supported(auth_client):
    response = auth_client.post("/api/cardio", json={
        "performed_at": "2026-09-15T06:00:00Z", "type": "row",
        "distance_m": 5000, "duration_s": 1200,
    })
    assert response.status_code == 201 and response.json()["type"] == "row"
    assert auth_client.post("/api/cardio", json={
        "performed_at": "2026-09-15T06:00:00Z", "type": "skiing", "duration_s": 600,
    }).status_code == 422
```

Add `import pytest` at the top.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_cardio.py -v`
Expected: FAIL (404 / module missing).

- [ ] **Step 3: Implement**

- CRUD with `type` CHECK (Pydantic `Literal`), `duration_s > 0`, `distance_m >= 0 or None`, `avg_hr` 30–250; response adds computed `pace_s_per_km` via `analytics.pace_s_per_km`.
- `GET /api/cardio/summary?from&to&type`: aggregate totals and `avg_pace_s_per_km = total_duration_s / (total_distance_m / 1000)` when distance > 0 else null; never include goal fields.
- `GET /api/cardio/week?week_start=YYYY-MM-DD`: default = current ISO week Monday in the user’s timezone (via `analytics.bucket_start(now, tz, "week")`); range is `[week_start, week_start + 7 days)`; include `weekly_goal_m` and `goal_progress_pct` computed from `users.weekly_run_goal_m`; when null, return both as `null` (explicit null is fine here; UI hides).
- Mount router.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_cardio.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/cardio.py backend/app/schemas/cardio.py backend/app/main.py backend/tests/test_cardio.py
git commit -m "feat(cardio): activity logging, summary, and weekly goal"
```

### Task 2.6: Dashboard router

**Files:**
- Create: `backend/app/routers/dashboard.py`
- Test: `backend/tests/test_dashboard.py`

- [ ] **Step 1: Write the failing tests `backend/tests/test_dashboard.py`**

```python
import pytest


def test_dashboard_empty(auth_client):
    body = auth_client.get("/api/dashboard").json()
    assert body["latest_weight"] is None
    assert body["weight_goal"] is None
    assert body["last_workout"] is None
    assert body["week_cardio"]["activity_count"] == 0
    assert body["week_cardio"]["weekly_goal_m"] is None


def test_dashboard_populated(auth_client, exercise):
    auth_client.post("/api/weight/entries", json={"measured_at": "2026-09-15T06:00:00Z", "weight_kg": 80.0})
    auth_client.patch("/api/settings", json={"goal_weight_kg": 75.0, "weekly_run_goal_m": 20000})
    auth_client.post("/api/workouts", json={
        "performed_at": "2026-09-16T17:00:00Z",
        "exercises": [{"exercise_id": exercise["id"], "position": 0,
                       "sets": [{"weight_kg": 100.0, "reps": 5}]}],
    })
    auth_client.post("/api/cardio", json={
        "performed_at": "2026-09-17T06:00:00Z", "type": "run",
        "distance_m": 5000, "duration_s": 1500,
    })
    # Pin "today" so week_cardio is deterministic regardless of when tests run.
    body = auth_client.get("/api/dashboard").json()
    assert body["latest_weight"]["weight_kg"] == 80.0
    assert body["weight_goal"]["goal_weight_kg"] == 75.0
    assert body["last_workout"]["volume_kg"] == 500.0
    assert body["week_cardio"]["total_distance_m"] >= 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_dashboard.py -v`
Expected: FAIL (404 / module missing).

- [ ] **Step 3: Implement**

`GET /api/dashboard` composes: latest weight entry; `weight_goal` (`{goal_weight_kg, latest_weight_kg}` or null); last workout summary (same shape as `/api/workouts` list item); `week_cardio` = current-week totals (type=run) with goal fields per `/api/cardio/week` null semantics. Reuse service functions; do not duplicate analytics logic. Mount router.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_dashboard.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/dashboard.py backend/app/main.py backend/tests/test_dashboard.py
git commit -m "feat(dashboard): today snapshot endpoint"
```

### Task 2.7: Export/Import (JSON + CSV, capped streaming upload)

**Files:**
- Create: `backend/app/routers/data.py`, `backend/app/services/import_export.py`
- Test: `backend/tests/test_export_import.py`

- [ ] **Step 1: Write the failing tests `backend/tests/test_export_import.py`** (R2 + reassignment)

```python
import json
import uuid


def test_export_round_trip_and_idempotent_import(auth_client, exercise):
    auth_client.post("/api/weight/entries", json={"measured_at": "2026-09-15T06:00:00Z", "weight_kg": 80.0})
    auth_client.post("/api/workouts", json={
        "performed_at": "2026-09-16T17:00:00Z",
        "exercises": [{"exercise_id": exercise["id"], "position": 0,
                       "sets": [{"weight_kg": 100.0, "reps": 5}]}],
    })
    exported = auth_client.get("/api/export/json").json()
    assert exported["format"] == "tracker-export" and exported["version"] == 1
    assert len(exported["data"]["weight_entries"]) == 1
    assert len(exported["data"]["sets"]) == 1

    first = auth_client.post("/api/import/json", json=exported)
    assert first.status_code == 200
    assert first.json()["created"] == {}
    assert all(count == 0 for count in first.json()["updated"].values())

    second = auth_client.post("/api/import/json", json=exported)
    assert all(count == 0 for count in second.json()["created"].values())


def test_import_reassigns_foreign_user_rows(auth_client, exercise, db, user):
    envelope = {
        "format": "tracker-export", "version": 1, "exported_at": "2026-09-18T00:00:00Z",
        "settings": {}, "data": {
            "exercises": [], "workout_templates": [], "template_exercises": [],
            "workouts": [{"id": str(uuid.uuid4()), "user_id": str(uuid.uuid4()),
                          "performed_at": "2026-09-01T00:00:00Z", "name": None,
                          "template_id": None, "notes": None}],
            "workout_exercises": [], "sets": [], "weight_entries": [],
            "cardio_activities": [], "body_measurements": [], "progress_photos": [],
            "tags": [], "workout_tags": [], "shoes": [],
        },
    }
    response = auth_client.post("/api/import/json", json=envelope)
    assert response.status_code == 200
    assert response.json()["created"]["workouts"] == 1
    assert auth_client.get("/api/workouts").json()[0]["id"] == envelope["data"]["workouts"][0]["id"]


def test_import_rejects_bad_version(auth_client):
    response = auth_client.post("/api/import/json", json={"format": "tracker-export", "version": 2})
    assert response.status_code == 422


def test_import_rejects_oversized_body(auth_client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "import_max_bytes", 512)
    response = auth_client.post(
        "/api/import/json",
        content=json.dumps({"blob": "x" * 4096}),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_csv_export_one_endpoint_per_entity(auth_client, exercise):
    auth_client.post("/api/weight/entries", json={"measured_at": "2026-09-15T06:00:00Z", "weight_kg": 80.0})
    response = auth_client.get("/api/export/weight_entries.csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "weight_kg" in response.text
    assert auth_client.get("/api/export/nope.csv").status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_export_import.py -v`
Expected: FAIL (404 / module missing).

- [ ] **Step 3: Implement**

- `data.py`: `GET /export/json` builds the envelope (models → dict, `settings` block from the user; credentials never exported). `GET /export/{entity}.csv` with an allowlist mapping entity name → model; use `csv.DictWriter` over `StringIO`; unknown entity → 404.
- `POST /import/json` **must not** declare a Pydantic body model; declare `request: Request` and parse manually:
  1. `content-length` header > `settings.import_max_bytes` → 413.
  2. `body = await request.body()` is forbidden; instead accumulate chunks:
     ```python
     chunks, total = [], 0
     async for chunk in request.stream():
         total += len(chunk)
         if total > settings.import_max_bytes:
             raise HTTPException(status_code=413, detail="Payload too large")
         chunks.append(chunk)
     payload = json.loads(b"".join(chunks))
     ```
  3. Validate `format`/`version`; 422 otherwise.
  4. For each entity in FK order, upsert by `id`, forcing `user_id = current_user.id` (log per-entity counts at INFO: `import: reassigned %d %s to user %s`).
  5. Single transaction; missing parent references → 422 with the offending entity/id.
  6. Response `{"created": {...}, "updated": {...}}`.
- Mount router.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_export_import.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/data.py backend/app/services/import_export.py backend/app/main.py backend/tests/test_export_import.py
git commit -m "feat(data): JSON/CSV export and capped idempotent import"
```

### Task 2.8: Phase 2 stub routers (501)

**Files:**
- Create: `backend/app/routers/phase2.py`, `backend/app/schemas/phase2.py`
- Test: `backend/tests/test_phase2_stubs.py`

- [ ] **Step 1: Write the failing test `backend/tests/test_phase2_stubs.py`**

```python
import pytest


@pytest.mark.parametrize("prefix", ["/api/measurements", "/api/photos", "/api/tags", "/api/shoes"])
def test_phase2_endpoints_return_501(auth_client, prefix):
    assert auth_client.get(prefix).status_code == 501
    assert auth_client.post(prefix, json={}).status_code == 501
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_phase2_stubs.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Implement**

Four `APIRouter`s (or one module with four routers) with documented Pydantic schemas for list/create; every handler raises `HTTPException(status_code=501, detail="Not implemented in MVP")`. Mount in `main.py` under `dependencies=[Depends(get_current_user)]` so they 401 before 501 when unauthenticated.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_phase2_stubs.py -v`
Expected: PASS (8 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/phase2.py backend/app/schemas/phase2.py backend/app/main.py backend/tests/test_phase2_stubs.py
git commit -m "feat(api): stub Phase 2 endpoints with 501 responses"
```

---

## Phase 3 — Seed data

### Task 3.1: Exercise library (~50 lifts)

**Files:**
- Create: `backend/app/seed/__init__.py`, `backend/app/seed/exercises.py`
- Test: `backend/tests/test_seed_exercises.py`

- [ ] **Step 1: Write the failing test `backend/tests/test_seed_exercises.py`**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_seed_exercises.py -v`
Expected: FAIL (`ModuleNotFoundError: app.seed`).

- [ ] **Step 3: Implement**

`EXERCISES` is a list of 50 dicts with `name, muscle_group, category, equipment, is_compound`. `seed_exercises(db, user_id)` inserts only missing names (skip by `name_lower`) and commits once. Include: bench press, incline bench, dumbbell bench, close-grip bench, push-up, dip, overhead press, dumbbell shoulder press, lateral raise, front raise, tricep pushdown, skull crusher, cable fly, pec deck, squat, front squat, goblet squat, leg press, Romanian deadlift, leg curl, leg extension, calf raise, hip thrust, Bulgarian split squat, lunge, deadlift, sumo deadlift, barbell row, dumbbell row, seated cable row, lat pulldown, pull-up, chin-up, face pull, shrug, rear delt fly, upright row, bicep curl, hammer curl, preacher curl, cable curl, back extension, ab wheel, plank, hanging leg raise, Russian twist, farmer's carry, kettlebell swing, clean and press, power clean, snatch.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_seed_exercises.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/seed backend/tests/test_seed_exercises.py
git commit -m "feat(seed): add 50-exercise library"
```

### Task 3.2: Deterministic 30-day fake data

**Files:**
- Create: `backend/app/seed/fake_data.py`
- Test: `backend/tests/test_seed_fake_data.py`

- [ ] **Step 1: Write the failing test `backend/tests/test_seed_fake_data.py`**

```python
import uuid

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import CardioActivity, User, WeightEntry, Workout
from app.seed.exercises import seed_exercises
from app.seed.fake_data import seed_fake_data


def _fresh_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)(), engine


def _seed_and_snapshot(seed=42):
    db, engine = _fresh_session()
    user = User(id=str(uuid.uuid4()), username=f"u{seed}", password_hash="x")
    db.add(user)
    db.commit()
    seed_exercises(db, user.id)
    seed_fake_data(db, user.id, days=30, seed=seed)
    weights = [row.weight_kg for row in db.scalars(select(WeightEntry).order_by(WeightEntry.measured_at))]
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_seed_fake_data.py -v`
Expected: FAIL (`ModuleNotFoundError: app.seed.fake_data`).

- [ ] **Step 3: Implement**

`seed_fake_data(db, user_id, days=30, seed=42)`:
- `rng = random.Random(seed)`; window = `[today - days, today]` UTC.
- Weight: one entry/day with `start_kg + trend * day_index + noise(±0.4)`; start 82.0, trend −0.05 kg/day; occasional body fat ~18–20% and notes on ~10% of entries.
- Workouts: 3/week on Mon/Wed/Fri, picking a 4–6 exercise subset from the user’s exercises, 3–4 sets each with progressive overload `base + week * 2.5` kg, reps 3–10, occasional RPE and warmup sets. Use `workouts`, `workout_exercises`, `sets` tables directly.
- Cardio: 3/week (Tue/Thu/Sat), runs 5–12 km, pace 5:00–6:15 min/km with slight improvement, `avg_hr` 140–165, 2–3 distinct `route_name` values.
- Commit once. Must be safe to run on a fresh user’s DB.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_seed_fake_data.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/seed/fake_data.py backend/tests/test_seed_fake_data.py
git commit -m "feat(seed): deterministic 30-day demo data"
```

### Task 3.3: Seed CLI

**Files:**
- Create: `backend/app/seed/__main__.py`
- Modify: `backend/app/cli.py` (add `seed` command)
- Test: manual verification (CLI covered by `test_seed_exercises` / `test_seed_fake_data`)

- [ ] **Step 1: Implement `python -m app.seed --days 30 --seed 42 [--reset]`**

```python
# backend/app/seed/__main__.py
import argparse

from app.database import SessionLocal
from app.seed.exercises import seed_exercises
from app.seed.fake_data import seed_fake_data
from app.services.users import ensure_default_user


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.seed")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--reset", action="store_true", help="delete the user's data first")
    args = parser.parse_args()
    with SessionLocal() as db:
        user = ensure_default_user(db)
        if user is None:
            from sqlalchemy import select
            from app.models import User
            user = db.scalars(select(User).limit(1)).one()
        if args.reset:
            # delete in FK-safe order for this user
            ...
        seed_exercises(db, user.id)
        seed_fake_data(db, user.id, days=args.days, seed=args.seed)
        print(f"seeded user {user.username}: 50 exercises, ~{args.days} days of data")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify on a scratch DB**

Run:
```bash
cd backend && DATABASE_URL=sqlite:///./scratch.db uv run alembic upgrade head && DATABASE_URL=sqlite:///./scratch.db uv run python -m app.seed && DATABASE_URL=sqlite:///./scratch.db uv run python -m app.seed --reset && rm scratch.db*
```
Expected: prints the seeded summary twice; no errors; rerunning without `--reset` does not duplicate exercises/data.

- [ ] **Step 3: Commit**

```bash
git add backend/app/seed/__main__.py backend/app/cli.py
git commit -m "feat(seed): add seed CLI with reset support"
```

---

## Phase 4 — Backend verification

### Task 4.1: Full gate

- [ ] **Step 1:** `cd backend && uv run pytest -v` — every test passes.
- [ ] **Step 2:** `cd backend && uv run ruff check . && uv run ruff format --check .` — no findings.
- [ ] **Step 3:** Confirm coverage of these edge cases exists (they gate earlier tasks): e1RM reps 1/12/13, null weight, warmup exclusion, idempotent workout replay (R7), archive rules, PATCH settings absent/null/value (R5), goal-null omission (R4), import 413 (R2), migration round-trip (R3).
- [ ] **Step 4:** Commit any fixes:

```bash
git add -A && git commit -m "test(backend): close remaining edge-case gaps"
```

---

## Phase 5 — Frontend foundation

### Task 5.1: Vite app, Tailwind, shell, dark theme

**Files:**
- Create: `frontend/` (Vite `react-ts` template), `frontend/vite.config.ts`, `frontend/src/index.css`, `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`, `frontend/eslint.config.js`, `frontend/src/lib/datetime.ts` (placeholder moved here in 5.2)
- Modify: `frontend/package.json` scripts

- [ ] **Step 1: Scaffold**

Run: `npm create vite@latest frontend -- --template react-ts && cd frontend && npm install`
Then: `npm install tailwindcss @tailwindcss/vite react-router-dom @tanstack/react-query recharts date-fns date-fns-tz`
Dev deps: `npm install -D vitest @vitest/coverage-v8`

- [ ] **Step 2: Configure**

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:8000" } },
});
```

`package.json` scripts:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "typecheck": "tsc -b --noEmit",
  "lint": "eslint .",
  "test": "vitest run"
}
```

`src/index.css`: `@import "tailwindcss";` plus dark-first base styles. `index.html` gets `class="dark"` on `<html>`.

- [ ] **Step 3: App shell**

`App.tsx`: `QueryClientProvider`, `BrowserRouter`, routes from spec section 8, auth guard (redirect to `/login` when `GET /api/auth/me` 401), `Layout` with a fixed bottom nav (Dashboard, Weight, Lifting, Running) plus a settings icon, mobile-first (`max-w-2xl` centered on desktop).

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`
Expected: all pass; `dist/` produced.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(web): scaffold Vite app with dark mobile shell and routing"
```

### Task 5.2: API client, auth/settings context, unit and datetime libs

**Files:**
- Create: `frontend/src/api/client.ts`, `frontend/src/api/types.ts`, `frontend/src/context/AuthContext.tsx`, `frontend/src/context/SettingsContext.tsx`
- Create: `frontend/src/lib/units.ts`, `frontend/src/lib/datetime.ts`, `frontend/src/lib/parseNumber.ts`
- Test: `frontend/src/lib/units.test.ts`, `frontend/src/lib/datetime.test.ts`, `frontend/src/lib/parseNumber.test.ts`
- Modify: `frontend/eslint.config.js`

**Interfaces:**
- `units.ts`: `kgToLb`, `lbToKg`, `mToMi`, `miToM`, `mToFt`, `ftToM`, `cmToIn`, `inToCm`, `formatWeight(kg, system)`, `formatDistance(m, system)`, `formatPace(sPerKm, system)`.
- `datetime.ts`: `formatLocal(iso: string, timezone: string, pattern: string)`, `toUtcIso(date: Date)`, `localDateKey(iso, timezone)`.
- `parseNumber.ts`: `parseDecimalInput(raw: string): number | null`.

- [ ] **Step 1: Write the failing tests**

`units.test.ts` (R11):

```ts
import { describe, expect, it } from "vitest";
import { cmToIn, ftToM, inToCm, kgToLb, lbToKg, miToM, mToFt, mToMi } from "./units";

const roundTrips = [
  ["kg↔lb", kgToLb, lbToKg, 80],
  ["m↔mi", mToMi, miToM, 10000],
  ["m↔ft", mToFt, ftToM, 100],
  ["cm↔in", cmToIn, inToCm, 90],
] as const;

describe("unit round trips", () => {
  it.each(roundTrips)("%s returns the original value", (_name, to, from, value) => {
    expect(from(to(value))).toBeCloseTo(value, 6);
  });
});
```

`datetime.test.ts` (R12):

```ts
import { describe, expect, it } from "vitest";
import { formatLocal, localDateKey } from "./datetime";

describe("datetime", () => {
  it("formats a UTC instant in the user timezone", () => {
    expect(formatLocal("2026-01-04T23:30:00Z", "Europe/London", "yyyy-MM-dd HH:mm"))
      .toBe("2026-01-04 23:30");
  });
  it("crosses a date boundary when the timezone requires it", () => {
    expect(localDateKey("2026-01-05T01:00:00Z", "America/New_York")).toBe("2026-01-04");
  });
});
```

`parseNumber.test.ts` (R13):

```ts
import { describe, expect, it } from "vitest";
import { parseDecimalInput } from "./parseNumber";

describe("parseDecimalInput", () => {
  it("parses plain and padded numbers", () => {
    expect(parseDecimalInput("08")).toBe(8);
    expect(parseDecimalInput("82.5")).toBe(82.5);
  });
  it("accepts comma decimal separators", () => {
    expect(parseDecimalInput("82,5")).toBe(82.5);
  });
  it("returns null for empty input", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("  ")).toBeNull();
  });
  it("returns null for garbage", () => {
    expect(parseDecimalInput("abc")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

- `units.ts`: constants `KG_PER_LB = 0.45359237`, `M_PER_MI = 1609.344`, `M_PER_FT = 0.3048`, `CM_PER_IN = 2.54`; pure functions wrapping them; formatters that append `kg`/`lb`, `km`/`mi`, and convert pace `s/km` ↔ `s/mi` (multiply by `M_PER_MI / 1000`).
- `datetime.ts`: `formatInTimeZone` from `date-fns-tz`; `toUtcIso` returns `date.toISOString()`; `localDateKey` returns `yyyy-MM-dd` in the timezone.
- `parseNumber.ts`: trim, replace `,` with `.`, strip leading `+`, drop leading zeros, `Number.isFinite` check, return `null` when blank/NaN.
- `client.ts`: `api<T>(path, init?)` wrapper using `fetch(path, { credentials: "include", ... })`, JSON body handling, throws `ApiError` with status + detail; query helpers for all endpoints.
- `AuthContext`: holds `user | null`, `login`, `logout`, bootstraps `GET /api/auth/me`.
- `SettingsContext`: wraps `GET/PATCH /api/settings`, exposes `unitSystem`, `timezone`, `goalWeightKg`, `weeklyRunGoalM`, `maxHr`.

- [ ] **Step 4: Add the ESLint restriction (R12)**

In `eslint.config.js`:

```js
{
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/lib/datetime.ts"],
  rules: {
    "no-restricted-properties": [
      "error",
      { object: "Date", property: "toLocaleString", message: "Use lib/datetime.ts" },
      { object: "Date", property: "toLocaleDateString", message: "Use lib/datetime.ts" },
      { object: "Date", property: "toLocaleTimeString", message: "Use lib/datetime.ts" },
    ],
  },
}
```

- [ ] **Step 5: Verify**

Run: `cd frontend && npm run test && npm run typecheck && npm run lint && npm run build`
Expected: all green (9 unit tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src frontend/eslint.config.js
git commit -m "feat(web): API client, auth/settings context, unit and date conversion libs"
```

### Task 5.3: PWA

**Files:**
- Modify: `frontend/vite.config.ts`, `frontend/index.html`, `frontend/package.json`
- Create: `frontend/public/icons/icon-192.png`, `frontend/public/icons/icon-512.png`, `frontend/public/icons/maskable-512.png`

- [ ] **Step 1: Install and configure**

Run: `cd frontend && npm install -D vite-plugin-pwa`
`vite.config.ts` adds:

```ts
import { VitePWA } from "vite-plugin-pwa";

VitePWA({
  registerType: "autoUpdate",
  manifest: {
    name: "Fitness Tracker",
    short_name: "Tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    navigateFallback: "/index.html",
    runtimeCaching: [
      {
        urlPattern: /^\/api\//,
        handler: "NetworkOnly",
      },
    ],
  },
})
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run build`
Expected: `dist/manifest.webmanifest` and `dist/sw.js` exist; `npm run typecheck` passes.

- [ ] **Step 3: Commit**

```bash
git add frontend
git commit -m "feat(web): PWA manifest and service worker with NetworkOnly API"
```

### Task 5.4: Shared components (range picker, charts, quick-add, progress bar)

**Files:**
- Create: `frontend/src/components/DateRangePicker.tsx`, `frontend/src/components/ChartCard.tsx`, `frontend/src/components/QuickAddBar.tsx`, `frontend/src/components/ProgressBar.tsx`, `frontend/src/components/NumberField.tsx`

- [ ] **Step 1: Implement**

- `DateRangePicker`: presets (7D, 30D, 90D, 1Y, All, Custom) emitting `{from, to}` UTC ISO; native date inputs in custom mode.
- `ChartCard`: title + range picker + `ResponsiveContainer` wrapper; empty-state text when no data (never render an empty axis).
- `QuickAddBar`: buttons for weight / workout / run that route to the right view with the form open (`/weight?add=1`).
- `ProgressBar`: value + optional max; **renders nothing when max is null** (R4).
- `NumberField`: `type="text"`, `inputMode` prop, delegates parsing to `parseDecimalInput`, strips leading zeros on blur, displays comma input as typed (R13).

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components
git commit -m "feat(web): shared range picker, chart card, quick add, progress, number field"
```

---

## Phase 6 — Frontend views (commit per task, no pause)

### Task 6.1: Dashboard

- Create `frontend/src/features/dashboard/DashboardPage.tsx`.
- Cards: latest weight (+ goal line/progress hidden when null), last workout (name/date/volume), this week's running mileage + goal bar (hidden when goal null), `QuickAddBar`.
- Verify: `npm run typecheck && npm run lint && npm run build`.
- Commit: `feat(web): dashboard view`.

### Task 6.2: Weight

- Create `frontend/src/features/weight/WeightPage.tsx`, `WeightChart.tsx`, `WeightForm.tsx`.
- List + entry form (`measured_at` defaults to now, weight required, body fat/notes optional), delete/edit.
- Chart: bucket toggle day/week/month/year via the series endpoint, 7-day MA line, trendline, goal reference line (omit when null), `DateRangePicker`.
- Verify + commit: `feat(web): weight tracking view`.

### Task 6.3: Lifting (library, logger, templates)

- Create `frontend/src/features/lifting/{LiftingPage,ExerciseLibraryPage,WorkoutLoggerPage,TemplateListPage,TemplateEditorPage}.tsx`, `ExercisePicker.tsx`, `SetRow.tsx`.
- Exercise picker: search + inline create through `POST /api/exercises/resolve`; show a “new exercise created” toast when `created: true` (R10); archived results labeled and not offered for new entries unless selected deliberately.
- Logger: start blank or from template (`planned` pre-fills input rows, zero persisted sets), prefill from `/last-performance`, big `+`/`-` steppers, `NumberField` with `inputMode="decimal"` for weight and `"numeric"` for reps, optimistic add-set mutation, per-exercise grouping by `position`, session notes field.
- Template editor: ordered exercise list, target sets/reps/weight (nullable), archive/restore.
- Verify + commit: `feat(web): lifting library, fast logger, and templates`.

### Task 6.4: Exercise progress

- Create `frontend/src/features/lifting/ExerciseProgressPage.tsx`.
- PR cards (heaviest, best e1RM, best reps, best session volume — show “—” for nulls), chart metric switcher top set / e1RM / volume with reps fallback when no weighted sets, `DateRangePicker`.
- Verify + commit: `feat(web): exercise progress view`.

### Task 6.5: Running

- Create `frontend/src/features/running/{RunningPage,CardioForm}.tsx`.
- List + form (type selector, distance, duration with `mm:ss` or minutes input, avg HR, route, notes), pace display via `formatPace`, summary cards for the selected range, weekly goal `ProgressBar` (hidden when goal null).
- Verify + commit: `feat(web): running view`.

### Task 6.6: Settings and data

- Create `frontend/src/features/settings/SettingsPage.tsx`, `frontend/src/features/settings/DataPage.tsx`.
- Settings form: unit system, timezone (browser default), goal weight, weekly run goal, max HR; PATCH sends only changed fields; clearing sends explicit `null`.
- Data: JSON export download, CSV links per entity, JSON import with size hint and result summary (`created`/`updated` counts), error states for 413/422.
- Verify + commit: `feat(web): settings and data import/export UI`.

---

## Phase 7 — Deploy, docs, smoke test

### Task 7.1: Multi-stage Dockerfile, entrypoint, static serving

**Files:**
- Create: `Dockerfile`, `backend/scripts/entrypoint.sh`
- Modify: `backend/app/main.py` (mount built SPA when present)

- [ ] **Step 1: Static SPA serving in `main.py`** (after all routers)

```python
from pathlib import Path
from fastapi.staticfiles import StaticFiles

static_dir = Path(__file__).parent / "static"
if (static_dir / "index.html").exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="spa")
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:0.5-python3.12-bookworm-slim AS deps
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim
RUN useradd --create-home appuser
WORKDIR /app
COPY --from=deps /app/.venv /app/.venv
COPY backend/ /app/
COPY --from=web /web/dist /app/app/static
RUN mkdir -p /data && chown -R appuser:appuser /data /app
USER appuser
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
```

- [ ] **Step 3: Write `backend/scripts/entrypoint.sh`**

```sh
#!/bin/sh
set -e
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Run: `chmod +x backend/scripts/entrypoint.sh`

- [ ] **Step 4: Verify the image builds**

Run: `docker build -t tracker-test .`
Expected: build succeeds; `docker run --rm -e SECRET_KEY=x tracker-test python -c "import app.main"` exits 0.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile backend/scripts/entrypoint.sh backend/app/main.py
git commit -m "build: add multi-stage Dockerfile with healthcheck and SPA serving"
```

### Task 7.2: docker-compose

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write**

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "8000:8000"
    volumes:
      - ./data:/data
```

- [ ] **Step 2: Verify end to end (also covers Task 7.5 steps 1–5)**

```bash
cp .env.example .env
# fill SECRET_KEY and generate APP_PASSWORD_HASH:
printf 'choose-a-password\n' | (cd backend && uv run python -m app.cli hash-password)
docker compose up --build -d
docker compose exec app python -m app.seed
curl -sf http://localhost:8000/api/health
curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:8000/docs
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "build: add docker-compose with SQLite volume"
```

### Task 7.3: README (setup, run, backup)

- Sections: prerequisites (Docker, or Node 22 + Python 3.12 + uv for dev); dev setup (`uv sync`, `alembic upgrade head`, `python -m app.seed`, `uv run uvicorn app.main:app --reload`, `cd frontend && npm install && npm run dev`); Docker setup; env vars table; backup (JSON export, `python -m app.cli backup`, raw-copy warning with WAL); Caddy/Tailscale reverse proxy note; test/lint commands.
- Commit: `docs: add setup, run, and backup instructions`.

### Task 7.4: Architecture decisions doc

- `docs/architecture-decisions.md` mirroring spec section 13, plus: no rate limiting, WAL + `Connection.backup()` rationale, no i18n, stdout logging/no Sentry, single worker due to SQLite.
- Commit: `docs: add architecture decisions`.

### Task 7.5: Clean-DB E2E smoke

- [ ] **Step 1:** `docker compose down && rm -rf data && docker compose up --build -d`
- [ ] **Step 2:** `docker compose exec app python -m app.seed`
- [ ] **Step 3:** Verify: `/api/health` 200, `/docs` 200, login via browser, `/api/dashboard` returns seeded weight/workout/run values, charts render in all four views, PWA install prompt appears.
- [ ] **Step 4:** Commit fixes (if any): `fix: resolve smoke-test findings`.

### Task 7.6: Update AGENTS.md with real commands

- Replace the greenfield note with: backend (`cd backend && uv run pytest`, `uv run ruff check .`, `uv run alembic upgrade head`, `uv run python -m app.seed`), frontend (`cd frontend && npm run dev|typecheck|lint|test|build`), Docker (`docker compose up --build`), and the order rule (backend first, then frontend).
- Commit: `docs: document developer commands in AGENTS.md`.

---

## Self-Review

**Spec coverage:** every MVP feature maps to a task — weight (2.2, 6.2), lifting (2.1, 2.3, 2.4, 6.3, 6.4), running (2.5, 6.5), dashboard (2.6, 6.1), export/import (2.7, 6.6), auth/settings (1.5, 1.6), PWA (5.3), Docker (7.1, 7.2). Non-functional requirements: mobile-first (5.1, 6.x), <5s set entry (2.3 fast path + 5.4 NumberField + 6.3 prefill), UTC (global constraints + 5.2), unit preference (1.6 + 5.2), dark default (5.1), range picker on every chart (5.4), seeds (3.1–3.3), tests (1.4, 4.1, 5.2), docs (7.3, 7.4, 7.6).

**Refinements visible in tasks:** R1 (1.5 step 7 + test), R2 (2.7 step 3), R3 (1.4 step 3), R4 (2.2, 2.5, 2.6 tests + 5.4 ProgressBar), R5 (1.6 test), R6 (2.4 test), R7 (2.3 replay test), R8 (2.2 week test + analytics), R9 (2.4 from-template test), R10 (2.1 resolve shape), R11/R12/R13 (5.2, 6.3), R14 (this plan).

**Type consistency:** canonical field names are identical across plan and spec (`weight_kg`, `distance_m`, `duration_s`, `performed_at`, `measured_at`, `name_lower`, `is_archived`); response wrappers use `{workout, planned}` for from-template and `{sessions}` for progress; `SettingsPatch` null/absent semantics are defined once in 1.6 and reused by 5.2.

**Placeholder scan:** no TBD/TODO/"handle edge cases" steps; every backend task has runnable test code and exact commands.

## Execution Handoff

Use **subagent-per-task with review between tasks** (user-selected). Required sub-skill: `superpowers:subagent-driven-development`. Pause for user review after Step 0, Phase 1, Phase 2, Phase 3, Phase 5, and Phase 7; commit per task without pausing across Phase 6.

