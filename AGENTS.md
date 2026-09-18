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
