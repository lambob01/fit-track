# Tracker

Self-hosted fitness tracker: body weight, lifting, running/cardio, a dashboard, and JSON/CSV
export/import. Single user; FastAPI serves both the API and the built React SPA on one port.

- Web UI and API: <http://localhost:8000>
- OpenAPI docs (Swagger UI): <http://localhost:8000/docs>
- Health check: `GET /api/health`

## Prerequisites

- **Docker (recommended):** Docker Engine with the Compose plugin.
- **Development:** Python 3.12 and [uv](https://docs.astral.sh/uv/), plus Node.js 22 and npm.

## Development setup

Run the backend and frontend as two processes. Vite proxies `/api` to `http://localhost:8000`,
so the browser sees one origin and session cookies work unchanged.

### 1. Backend

```sh
cd backend
uv sync
uv run alembic upgrade head
```

The app creates its single user from `APP_USERNAME` / `APP_PASSWORD_HASH` when the account does
not exist yet, so create `backend/.env` (git-ignored) before starting:

```sh
APP_USERNAME=albert
APP_PASSWORD_HASH='$2b$12$...'
SECRET_KEY=dev-secret-change-me
```

Generate the hash with the CLI (it prompts twice, or reads the first stdin line when piped):

```sh
uv run python -m app.cli hash-password
```

Optional demo data (~50 common exercises plus 30 days of workouts, weight, and cardio):

```sh
uv run python -m app.seed            # flags: --days N, --seed N, --reset
```

Start the API on <http://localhost:8000>:

```sh
uv run uvicorn app.main:app --reload
```

The dev database defaults to `sqlite:///./tracker.db`, i.e. `backend/tracker.db` when the
backend is run from `backend/`.

### 2. Frontend

```sh
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173> and log in with the username and password from `backend/.env`.

## Docker setup

A single container serves the SPA, the API, and SQLite. Data lives in `./data` on the host
(mounted at `/data`).

1. Create the environment file:

   ```sh
   cp .env.example .env
   ```

   Edit `.env` and set at least `SECRET_KEY` (a long random string) and `APP_USERNAME`.

2. Build the image and generate the password hash:

   ```sh
   docker compose build
   docker compose run --rm app python -m app.cli hash-password
   ```

   Paste the printed hash into `.env` as `APP_PASSWORD_HASH='$2b$12$...'` — **single-quoted**,
   see [Quoting the password hash](#quoting-the-password-hash).

3. Start it:

   ```sh
   docker compose up -d
   ```

   The entrypoint runs `alembic upgrade head` before starting uvicorn. The app is now at
   <http://localhost:8000> and the database is `./data/tracker.db`.

4. Optional demo data:

   ```sh
   docker compose exec app python -m app.seed
   ```

Common operations:

```sh
docker compose logs -f app   # follow logs
docker compose down          # stop and remove the container (data stays in ./data)
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `dev-secret-change-me` | Signs the session cookie. Set a long random value in production; changing it invalidates all sessions. |
| `APP_USERNAME` | `albert` | Username of the single account; used to create the user when it does not exist. |
| `APP_PASSWORD_HASH` | *(empty)* | bcrypt hash of the account password. Login is impossible until this and `APP_USERNAME` are set. Generate with `python -m app.cli hash-password`. |
| `DATABASE_URL` | `sqlite:///./tracker.db` (Compose sets `sqlite:////data/tracker.db`) | SQLAlchemy database URL. |
| `COOKIE_SECURE` | `false` | Set to `true` when served over HTTPS (Caddy/Tailscale) so the session cookie is marked `Secure`. |
| `APP_ENV` | `development` | `development` or `production`. |
| `SESSION_MAX_AGE_S` | `2592000` (30 days) | Session cookie lifetime in seconds. |
| `IMPORT_MAX_BYTES` | `26214400` (25 MiB) | Maximum accepted JSON import size. |

### Quoting the password hash

Docker Compose interpolates values in `.env` and treats `$` as the start of a variable
reference. bcrypt hashes contain `$`, so an unquoted `APP_PASSWORD_HASH=$2b$12$...` gets
mangled. **Single-quote the hash** — Compose strips the quotes and keeps the `$` characters
literal:

```sh
APP_PASSWORD_HASH='$2b$12$...'
```

Use single quotes in the shell as well (e.g. when exporting the value) for the same reason.

## Backup and restore

The database is SQLite. Three options, safest first:

1. **JSON export (portable):** in the UI, go to **Settings → Data → Export** and download the
   JSON file. It contains every row plus settings and can be re-imported from the same page (or
   via `POST /api/import/json`). This is the recommended cross-version backup.

2. **Consistent file snapshot (CLI):** uses SQLite's online backup API, so it is safe while the
   app is running:

   ```sh
   docker compose exec app python -m app.cli backup
   ```

   Writes `/data/backups/tracker-<UTC timestamp>.db` inside the container (on the host:
   `./data/backups/`). Choose an explicit path with `--out`:

   ```sh
   docker compose exec app python -m app.cli backup --out /data/backups/before-upgrade.db
   ```

   In development:

   ```sh
   cd backend && uv run python -m app.cli backup   # -> backend/backups/
   ```

3. **Raw file copy (only while stopped):** SQLite runs in WAL mode, so copying `tracker.db`
   while the app is running can capture a torn, inconsistent snapshot. Stop the container
   first:

   ```sh
   docker compose stop app
   cp -a data data-backup
   docker compose start app
   ```

**Restore:** import a JSON export via **Settings → Data → Import**, or stop the app, replace
`data/tracker.db` with the snapshot (remove stale `tracker.db-wal` / `tracker.db-shm` files),
and start it again.

## Reverse proxy (Caddy / Tailscale)

The container serves plain HTTP on port 8000; terminate TLS at a reverse proxy and set
`COOKIE_SECURE=true` in `.env` (then `docker compose up -d` to apply) so the session cookie is
only sent over HTTPS.

Caddy:

```caddyfile
tracker.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

Tailscale Serve (HTTPS over your tailnet, no public ports):

```sh
tailscale serve --bg 8000
```

## Tests and lint

Backend, from `backend/`:

```sh
uv run pytest -q       # includes the migration upgrade/downgrade/upgrade check
uv run ruff check .
```

Frontend, from `frontend/`:

```sh
npm run typecheck
npm run lint
npm test
npm run build          # tsc -b plus the production Vite build
```
