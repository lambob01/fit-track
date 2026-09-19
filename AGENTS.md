# AGENTS.md

Self-hosted fitness tracker (single user). FastAPI serves the API and the built React SPA on one
port.

## Stack

- Backend: Python + FastAPI
- Database: SQLite + SQLAlchemy (Alembic migrations)
- Frontend: React + Vite + TypeScript + TailwindCSS
- Charts: Recharts

## Required workflow

1. Before writing any code, propose the database schema and folder structure and get approval.
2. Implement backend first, then frontend.

## Commands

### Backend (from `backend/`)

Python is pinned to 3.12 via `backend/.python-version`; uv manages the virtualenv. The app reads
`backend/.env` for `APP_USERNAME` / `APP_PASSWORD_HASH` / `SECRET_KEY`.

```sh
uv sync
uv run alembic upgrade head
uv run python -m app.seed [--reset]   # --reset wipes the user's data first
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
uv run ruff check .
```

### Frontend (from `frontend/`)

```sh
npm install
npm run dev        # Vite proxies /api to http://localhost:8000
npm run typecheck
npm run lint
npm run test
npm run build
```

### Docker (from repo root)

```sh
cp .env.example .env
docker compose up --build -d
docker compose exec app python -m app.seed
```

Health check: <http://localhost:8000/api/health>. API docs: <http://localhost:8000/docs>.

Single-quote `APP_PASSWORD_HASH` in `.env` with single quotes (`APP_PASSWORD_HASH='$2b$12$...'`):
bcrypt hashes contain `$` and Compose interpolates unquoted values. Generate a hash with
`python -m app.cli hash-password` — it prompts (or reads the first line of stdin) and never takes
the password as an argument.

Phase 2 added no new project commands; the lists above are complete.

## Phase 2 additions

### API

- Plans/calendar: `/api/plans` CRUD plus `POST /api/plans/{id}/activate`;
  `GET /api/calendar?week_start=YYYY-MM-DD` (must be a Monday, else 422). Exactly one active plan
  per profile; a local day counts as completed when any workout happened on it.
- Profiles: `/api/profiles` (list/create), `POST /api/profiles/{id}/switch` (rewrites session
  `user_id`), `DELETE /api/profiles/{id}` (body `{password}` checked against the env credentials;
  the active, login, and last profiles cannot be deleted). A profile is a `users` row with an
  unusable password hash; only the env login account can sign in.
- Data: `DELETE /api/data/{entity}` where entity is `weight_entries | measurements | workouts |
  cardio_activities | sets | plans` (optional paired `from`/`to` UTC instants, else whole category);
  `DELETE /api/data/all` and profile deletion require the env password; `POST /api/data/demo` seeds
  only into a profile with no data.
- Shoes: `/api/shoes` CRUD is implemented (list returns computed `mileage_m`).
- Cardio analytics, computed on read: `/api/cardio/prs`, `/api/cardio/streaks`,
  `/api/cardio/comparison`, `/api/cardio/{id}/zones`, `/api/cardio/splits/{id}`.
- Sets: `POST /api/workout-exercises/{id}/reorder-sets` with the complete ordered `{set_ids}`.
- Goals: `PATCH /api/settings` gains nullable `goal_rate_kg_per_week`, `goal_monthly_mode`,
  `goal_monthly_target_kg`, `goal_monthly_rate_kg`, `goal_weight_target_date`,
  `goal_weight_target_kg`, and `height_cm`; `PATCH /api/exercises/{id}` gains `goal_weight_kg`,
  `goal_reps`, `goal_target_date`, and `goal_reps_bodyweight`.
- `/api/measurements`, `/api/photos`, `/api/tags` remain 501 stubs.

### Conventions

- Canonical units (kg, m, s, cm) and UTC storage are unchanged; convert only at the UI edge via
  `lib/units.ts` and `lib/datetime.ts`.
- Goal columns are nullable: absent = unchanged, explicit null clears; never render unset goals as
  `0`. Rate math lives only in `required_rate_per_week` / `compare_rate`
  (`backend/app/services/analytics.py`).
- BMI is computed in the frontend from the latest weight and `height_cm`; never stored.
- UI chrome is monochrome; colour exists only in chart series (`chart-1`…`chart-6` CSS vars).
- Mobile: tap targets ≥44 px (`min-h-11`), safe-area padding on fixed bars, `max-h-[85dvh]` sheets.

Verification note: viewport smoke checks are ad-hoc (`npx playwright`), not a project command.

## Operational notes

- Run a single uvicorn worker: SQLite does not support concurrent writers.
- WAL mode means raw file copies are unsafe while the app runs. Use
  `python -m app.cli backup` (SQLite online backup API) or the JSON export.
- Alembic migrations are the production schema source of truth; the container entrypoint runs
  `alembic upgrade head` before starting uvicorn.
- Tests use in-memory SQLite with the fixtures in `backend/tests/conftest.py`.

## Project conventions

- Mobile-first responsive UI.
- Set entry flow must be completable in under 5 seconds of interaction.
- Store all timestamps in UTC (convert only at the UI edge).
- Dark mode is the default.
- DB seeding: ~50 common exercises and ~30 days of fake workout data.
