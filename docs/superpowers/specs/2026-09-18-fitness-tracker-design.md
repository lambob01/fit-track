# Self-Hosted Fitness Tracker — Design Spec

- **Date:** 2026-09-18
- **Status:** Approved (pending plan review)
- **Scope:** MVP, single user, multi-user-ready schema

## 1. Overview

A self-hosted fitness tracker for one user, deployable as a single Docker container behind
Caddy or Tailscale. The MVP covers body weight tracking, lifting, running/cardio, a dashboard,
and JSON/CSV export/import. The schema and API are shaped so Phase 2 features (measurements,
photos, tags, shoes, HR zones, multi-user) can be added without reworking existing tables.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Python 3.12 + FastAPI | Matches `AGENTS.md`; free OpenAPI at `/docs`; Pydantic validation |
| ORM / DB | SQLAlchemy 2.x + SQLite | Single-user simplicity; zero-ops |
| Migrations | Alembic | Single source of truth for production schema |
| Packaging | uv + `pyproject.toml` | Fast, lockfile, reproducible Docker builds |
| Frontend | React 19 + Vite + TypeScript | Spec requirement |
| Styling | TailwindCSS v4 | Mobile-first, dark default |
| Data fetching | TanStack Query | Caching, optimistic updates for fast set logging |
| Routing | React Router | Four MVP views + detail routes |
| Charts | Recharts | Spec requirement |
| Dates/units | date-fns-tz, custom `lib/units.ts` | Single conversion boundary |
| PWA | vite-plugin-pwa (Workbox) | Installable on mobile |
| Frontend tests | Vitest | Unit tests for conversions/parsers |
| Backend tests | pytest + httpx/TestClient | Happy path per entity + analytics units |
| Lint/format | ruff (backend), ESLint + tsc (frontend) | |

## 3. Architecture

- **Single container in production.** Multi-stage Dockerfile builds the React app with Node,
  then FastAPI serves the built SPA and the API on one port. No CORS, no second web server.
- **Development** runs Vite's dev server with a proxy from `/api` to `localhost:8000`, so the
  browser sees one origin and session cookies work unchanged.
- **Backend layering:** `routers/` (HTTP) → `services/` (analytics and domain logic) →
  `models/` (SQLAlchemy). Pydantic schemas in `schemas/` define request/response contracts.
- **Database:** SQLite on a mounted volume, WAL journal mode, `PRAGMA foreign_keys=ON` on every
  connection (required for `ON DELETE CASCADE`/`SET NULL` to work), single uvicorn worker.
- **Auth:** signed session cookie; auth dependency applied per protected router.

## 4. Data model rationale

- **UUID primary keys** (stored as 32-char hex, serialized as canonical UUID strings) because
  clients generate IDs for idempotent workout creates/retries, JSON import can upsert by ID,
  and multi-user merging later stays trivial. Integer autoincrement would make all three messy.
- **Canonical units in storage:** kg, meters, seconds, cm. The display unit preference
  (`users.unit_system`) is applied only in the frontend. No stored value ever changes meaning
  when preferences change.
- **PRs are computed on read, never stored.** The dataset is tiny; a denormalized PR table
  drifts and needs rebuild logic. A `services/analytics.py` module computes them with unit tests.
- **Phase 2 tables are pre-created now** (body_measurements, progress_photos, tags,
  workout_tags, shoes) and their routes return 501. Adding tables later is cheap, but adding
  columns/FKs to MVP tables (e.g. `cardio_activities.shoe_id`, `workouts.notes`,
  `sets.notes`/`is_drop_set`) after data exists is the painful kind of migration. Pre-creating
  costs one migration now.
- **All datetimes are UTC**, serialized as ISO 8601 with `Z`. Timezone conversion happens only
  in the frontend via `lib/datetime.ts`.

## 5. Database schema

All tables have `id` (UUID PK), `created_at`, `updated_at` (UTC, server-set) unless noted.

### users
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| username | TEXT | NOT NULL, UNIQUE |
| password_hash | TEXT | NOT NULL (bcrypt) |
| unit_system | TEXT | NOT NULL, DEFAULT `'metric'`, CHECK in (`metric`,`imperial`) |
| timezone | TEXT | NOT NULL, DEFAULT `'UTC'` (IANA name) |
| goal_weight_kg | REAL | NULL |
| weekly_run_goal_m | REAL | NULL |
| max_hr | INTEGER | NULL, CHECK 100–250 |

### weight_entries
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | FK users.id | NOT NULL, ON DELETE CASCADE |
| measured_at | DATETIME | NOT NULL, indexed with user_id |
| weight_kg | REAL | NOT NULL, CHECK > 0 |
| body_fat_pct | REAL | NULL, CHECK 0 < x < 100 |
| notes | TEXT | NULL |
| source | TEXT | NOT NULL, DEFAULT `'manual'` (stub for future imports) |

### exercises
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | FK users.id | NOT NULL, ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| name_lower | TEXT | NOT NULL (case-insensitive uniqueness) |
| muscle_group | TEXT | NOT NULL, DEFAULT `'other'` |
| category | TEXT | NOT NULL, DEFAULT `'other'`, CHECK in (`push`,`pull`,`legs`,`other`) |
| equipment | TEXT | NOT NULL, DEFAULT `'other'` |
| is_compound | BOOL | NOT NULL, DEFAULT false |
| is_archived | BOOL | NOT NULL, DEFAULT false |

Constraint: `uq_exercises_user_id_name_lower UNIQUE (user_id, name_lower)`.
Index: `(user_id, is_archived)`.

### workout_templates
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | FK users.id | NOT NULL, ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| name_lower | TEXT | NOT NULL |
| notes | TEXT | NULL |
| is_archived | BOOL | NOT NULL, DEFAULT false |

Constraint: `uq_workout_templates_user_id_name_lower UNIQUE (user_id, name_lower)`.

### template_exercises
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| template_id | FK workout_templates.id | NOT NULL, ON DELETE CASCADE |
| exercise_id | FK exercises.id | NOT NULL, ON DELETE RESTRICT |
| position | INTEGER | NOT NULL, CHECK >= 0 |
| target_sets | INTEGER | NULL, CHECK > 0 |
| target_reps | INTEGER | NULL, CHECK > 0 |
| target_weight_kg | REAL | NULL, CHECK > 0 |

Constraint: `uq_template_exercises_template_position UNIQUE (template_id, position)`.

### workouts
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | FK users.id | NOT NULL, ON DELETE CASCADE |
| performed_at | DATETIME | NOT NULL, indexed with user_id |
| name | TEXT | NULL (snapshot of template name at creation) |
| template_id | FK workout_templates.id | NULL, ON DELETE SET NULL |
| notes | TEXT | NULL (Phase 2) |

### workout_exercises
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| workout_id | FK workouts.id | NOT NULL, ON DELETE CASCADE |
| exercise_id | FK exercises.id | NOT NULL, ON DELETE RESTRICT |
| position | INTEGER | NOT NULL, CHECK >= 0 |
| notes | TEXT | NULL (Phase 2) |
| superset_group | INTEGER | NULL (Phase 2) |

Constraint: `uq_workout_exercises_workout_position UNIQUE (workout_id, position)`.

### sets
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| workout_exercise_id | FK workout_exercises.id | NOT NULL, ON DELETE CASCADE |
| set_number | INTEGER | NOT NULL, CHECK >= 1 |
| weight_kg | REAL | NULL, CHECK > 0 (NULL = bodyweight) |
| reps | INTEGER | NOT NULL, CHECK >= 1 |
| rpe | REAL | NULL, CHECK 0–10 (0.5 steps) |
| is_warmup | BOOL | NOT NULL, DEFAULT false |
| is_drop_set | BOOL | NOT NULL, DEFAULT false (Phase 2) |
| notes | TEXT | NULL (Phase 2) |

Constraint: `uq_sets_workout_exercise_set_number UNIQUE (workout_exercise_id, set_number)`.

### cardio_activities
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | FK users.id | NOT NULL, ON DELETE CASCADE |
| performed_at | DATETIME | NOT NULL, indexed with user_id |
| type | TEXT | NOT NULL, DEFAULT `'run'`, CHECK in (`run`,`cycle`,`swim`,`row`,`other`) |
| distance_m | REAL | NULL, CHECK >= 0 |
| duration_s | INTEGER | NOT NULL, CHECK > 0 |
| avg_hr | INTEGER | NULL, CHECK 30–250 |
| route_name | TEXT | NULL |
| notes | TEXT | NULL |
| shoe_id | FK shoes.id | NULL, ON DELETE SET NULL (Phase 2) |
| source | TEXT | NOT NULL, DEFAULT `'manual'` |

### Phase 2 tables (created now, routes 501)

- **body_measurements:** id, user_id FK CASCADE, measured_at NOT NULL, site TEXT NOT NULL,
  value_cm REAL NOT NULL CHECK > 0, notes NULL.
- **progress_photos:** id, user_id FK CASCADE, taken_at NOT NULL, file_path TEXT NOT NULL
  (relative to the data volume), notes NULL.
- **tags:** id, user_id FK CASCADE, name TEXT NOT NULL, `UNIQUE(user_id, name)`.
- **workout_tags:** workout_id FK CASCADE + tag_id FK CASCADE, composite PK.
- **shoes:** id, user_id FK CASCADE, name TEXT NOT NULL, purchased_at DATE NULL,
  initial_distance_m REAL NOT NULL DEFAULT 0, retired_at DATE NULL, notes NULL.

## 6. API design

- Base path `/api`; OpenAPI docs at `/docs`.
- Timestamps: ISO 8601 UTC with `Z`. IDs: canonical UUID strings.
- Errors: FastAPI default `{"detail": "..."}` with 401 (unauthenticated), 403 (wrong owner),
  404, 409 (conflict), 413 (payload too large), 422 (validation).
- List endpoints accept `limit` (default 100, max 500) and `offset`.
- Every route except `GET /api/health` and `POST /api/auth/login` requires the session cookie.
  Auth is applied **per router** via `Depends(get_current_user)` — never as an app-wide
  dependency — so health checks can never 401.

### health
- `GET /api/health` — **unauthenticated**. Runs `SELECT 1`. 200 `{"status":"ok"}`; 503
  `{"status":"error"}` if the DB is unreachable.

### auth
- `POST /api/auth/login` `{username, password}` → 204 + `Set-Cookie` (signed session, HttpOnly,
  SameSite=Lax, `Secure` when `COOKIE_SECURE=true`, 30-day max age). 401 on bad credentials
  (constant-time compare).
- `POST /api/auth/logout` → 204, clears cookie.
- `GET /api/auth/me` → current user profile.

### settings
- `GET /api/settings` → `{id, username, unit_system, timezone, goal_weight_kg,
  weekly_run_goal_m, max_hr}`.
- `PATCH /api/settings` — **partial semantics** (Pydantic v2 `model_fields_set`):
  - field absent → unchanged
  - explicit `null` → allowed for `goal_weight_kg`, `weekly_run_goal_m`, `max_hr` (clears)
  - `null` for `unit_system`/`timezone` → 422
  - unknown fields → 422; invalid `timezone` (not resolvable by `zoneinfo`) → 422.

### exercises
- `GET /api/exercises?q=&category=&muscle_group=&include_archived=false&limit&offset`
  — excludes archived by default; `q` is case-insensitive substring on `name_lower`.
- `POST /api/exercises` → 201; duplicate `(user_id, name_lower)` → 409.
- `POST /api/exercises/resolve` `{name}` → 200
  `{id, name, is_archived, created}`. Get-or-create by trimmed lowercase name. Resolves
  archived exercises (so old workouts keep logging) without auto-restoring them. `created`
  drives a “new exercise created” toast in the UI.
- `PATCH /api/exercises/{id}` — partial; `name` rewrites `name_lower` (409 on duplicate);
  `is_archived` archives/restores.
- No DELETE; archiving is the lifecycle.
- **Archiving rules:** archived exercises are excluded from default listings and the picker,
  remain resolvable by name, remain fully included in workout history, progress charts, and
  PR calculations, and are restorable.

### weight
- CRUD `/api/weight/entries` (`measured_at` required, `weight_kg > 0`,
  `body_fat_pct` 0–100 exclusive).
- `GET /api/weight/series?from&to&bucket=day|week|month|year` (defaults: last 90 days, `day`):
  - Buckets are **calendar periods in the user's timezone**: `day` = calendar day,
    `week` = ISO week (Monday start), `month` = calendar month, `year` = calendar year.
  - Each bucket point is the **last measurement in the bucket** (by `measured_at`, tie-break
    `created_at`) — not the mean; users expect the current reading.
  - The trailing **7-day moving average is computed over raw entries** (hardcoded window, not
    configurable in MVP) and returned per raw entry.
  - The least-squares trendline is computed over raw entries in range; `null` when < 2 points.
  - Response includes `goal_weight_kg` only when set; omitted (or `null`) otherwise — the UI
    hides the goal line. No divide-by-zero, no 0% fallbacks.

### workouts
- `POST /api/workouts` — nested, **idempotent** create/upsert:

  ```json
  {
    "id": "optional-client-uuid",
    "performed_at": "2026-09-18T17:30:00Z",
    "name": "Push Day A",
    "template_id": "optional-uuid",
    "notes": null,
    "exercises": [
      {
        "id": "optional-uuid",
        "exercise_id": "uuid",
        "position": 0,
        "sets": [
          {"id": "optional-uuid", "set_number": 1, "weight_kg": 80, "reps": 5, "rpe": 8,
           "is_warmup": false}
        ]
      }
    ]
  }
  ```

  - Unknown `id` → **201** create. Existing `id` owned by current user → **200** upsert with
    **replace semantics**: metadata updated from payload; all existing `workout_exercises`
    and their sets are deleted, then the payload child tree is inserted. Child UUIDs supplied
    in the payload are honored (stable IDs make retries exactly idempotent). An `id` that
    exists for another user → **403**. A child UUID already attached to a different
    workout/workout-exercise → **409**.
  - `set_number`: optional in payload; when omitted the server assigns `1..n` by array order.
    When supplied it must be unique per `workout_exercise` (422 otherwise). The unique
    constraint is satisfied by construction on every upsert re-insert.
- `GET /api/workouts?from&to&limit&offset` → summaries (`id`, `performed_at`, `name`,
  `template_id`, exercise/set counts, session `volume_kg`).
- `GET /api/workouts/{id}` → full nested payload (the logger’s canonical shape).
- `PATCH /api/workouts/{id}` (metadata only), `DELETE /api/workouts/{id}` → 204.
- `POST /api/workouts/{id}/exercises`, `PATCH/DELETE /api/workout-exercises/{id}`.
- `POST /api/workout-exercises/{id}/sets` — **fast path**; `set_number = max + 1`.
- `PATCH /api/sets/{id}`, `DELETE /api/sets/{id}`.
- `GET /api/exercises/{id}/last-performance` → most recent workout’s sets for that exercise,
  used to pre-fill the logger (the <5s set entry requirement).
- `GET /api/exercises/{id}/progress?from&to` → per-session series with:
  - `top_set_kg` = max weight among non-warmup weighted sets (null if none)
  - `e1rm_kg` = max Epley estimate, only for non-warmup sets with `1 <= reps <= 12` and
    non-null weight (null if none)
  - `volume_kg` = Σ(weight × reps) over non-warmup weighted sets
  - `reps_volume` = Σ(reps) over all non-warmup sets (fallback series for bodyweight work)
- `GET /api/exercises/{id}/prs` → `heaviest_weight`, `best_e1rm`, `best_reps`
  (max reps in one non-warmup set — works for bodyweight exercises), `best_session_volume`
  (weighted sessions only). Each is `null` when no eligible set exists. Archived exercises
  are included.

### templates
- Nested CRUD `/api/templates` + `?include_archived=false` listing with parity to exercises:
  archived templates are excluded from the default list/picker, remain addressable by ID, and
  are restorable via PATCH. DELETE is allowed; existing workouts keep working via
  `ON DELETE SET NULL`.
- `POST /api/workouts/from-template/{template_id}` — **creates the workout immediately**
  (archived templates are allowed when addressed by ID). It copies `template_exercises` into
  `workout_exercises` in `position` order and persists **zero sets** (placeholder rows are
  deliberately not persisted: nullable `reps` would tax every analytics query, and persisting
  targets as completed sets would corrupt volume/PRs). The response is the same full workout
  payload as `GET /api/workouts/{id}` (zero sets) **plus a top-level `planned` sibling**:

  ```json
  {
    "workout": { "...": "standard workout payload, sets: []" },
    "planned": [
      {"exercise_id": "uuid", "position": 0, "sets": 3, "reps": 8, "weight_kg": 60.0}
    ]
  }
  ```

  `sets` = `target_sets ?? 0`; `reps`/`weight_kg` may be null because the template columns are
  nullable — the frontend renders blank inputs for nulls. Template-started and resumed
  in-progress workouts therefore feed the logger identically.

### cardio
- CRUD `/api/cardio` (`type`, `distance_m` nullable, `duration_s`, `avg_hr`, `route_name`,
  `notes`). Computed pace = `duration_s / (distance_m / 1000)` seconds per km; null when no
  distance.
- `GET /api/cardio/summary?from&to&type` → `{total_distance_m, total_duration_s,
  activity_count, avg_pace_s_per_km}` for the range (goal fields omitted).
- `GET /api/cardio/week?week_start=` (defaults to the current ISO week Monday in the user’s
  timezone) → same totals plus `weekly_goal_m` and `goal_progress_pct` when the goal is set;
  both omitted when `weekly_run_goal_m` is null (no 0%, no divide-by-zero).

### dashboard
- `GET /api/dashboard` →
  `{latest_weight | null, weight_goal | null, last_workout | null, week_cardio}`.
  `weight_goal` is omitted/null when `goal_weight_kg` is null. `week_cardio` follows the same
  goal-null semantics as `/api/cardio/week`, scoped to runs.

### data
- `GET /api/export/json` → envelope:

  ```json
  {"format": "tracker-export", "version": 1, "exported_at": "...Z",
   "settings": {"unit_system": "...", "timezone": "...", "goal_weight_kg": null,
                "weekly_run_goal_m": null, "max_hr": null},
   "data": {"exercises": [], "workout_templates": [], "template_exercises": [],
            "workouts": [], "workout_exercises": [], "sets": [], "weight_entries": [],
            "cardio_activities": [], "body_measurements": [], "progress_photos": [],
            "tags": [], "workout_tags": [], "shoes": []}}
  ```

- `GET /api/export/{entity}.csv` for every entity above; one row per record, model columns as
  headers, `text/csv` attachment.
- `POST /api/import/json`:
  - **Max size 25 MB.** `Content-Length` over the cap → 413; the body is streamed and the
    cumulative size is checked (never buffered unbounded) → 413.
  - Validates `format == "tracker-export"` and `version == 1` (else 422).
  - Upserts by UUID in FK-safe order inside a single transaction; missing parent references
    fail the whole import with 422 (atomic).
  - **All rows are reassigned to the current user**, silently, with one `INFO` log line per
    entity type and counts. Never errors on user mismatch.
  - Idempotent: importing the same file twice creates 0 rows the second time.

### Phase 2 stubs
- `/api/measurements`, `/api/photos`, `/api/tags`, `/api/shoes`: documented schemas,
  list/create routes return **501** `{"detail": "Not implemented in MVP"}`.

## 7. Domain rules (summary)

- **Epley e1RM** = `weight_kg × (1 + reps / 30)`, computed only for `1 <= reps <= 12` and
  non-null weight. Epley drifts high above ~12 reps, so those sets are excluded from e1RM
  series and `best_e1rm` (they remain in weight/reps/volume series).
- **Bodyweight sets** (`weight_kg = NULL`) are valid; they count toward `reps_volume` and can
  set `best_reps`, but not toward `volume_kg`, `heaviest_weight`, or `best_e1rm`.
- **Warmup sets** are stored but excluded from volume, progress, and PR calculations.
- **7-day moving average** is a fixed trailing window; not configurable.
- **Null goals** always mean “omit the goal UI”, never 0%.
- **HR zones** (Phase 2) are derived on read from `avg_hr` and `users.max_hr`; only session
  averages exist, so zones are activity-level approximations. Nothing is stored.
- **Import/user reassignment** logged per entity, never an error.

## 8. Frontend design

- Routes: `/login`, `/` (dashboard), `/weight`, `/lifting`, `/lifting/exercises/:id`,
  `/lifting/workouts/:id`, `/lifting/templates`, `/running`, `/settings`.
- **All `Date` objects in memory are UTC.** All user-local formatting goes through
  `lib/datetime.ts`; an ESLint restriction bans `toLocaleDateString`, `toLocaleTimeString`,
  and `toLocaleString` elsewhere. Noted in `AGENTS.md`.
- **Units:** `lib/units.ts` converts canonical ↔ display (kg↔lb, m↔mi, m↔ft, cm↔in) with
  floating-point-tolerant round-trips; unit preference comes from settings.
- **Numeric inputs:** `type="text"` with `inputMode="decimal"`/`"numeric"` (avoids mobile
  number-input quirks), strip leading zeros, accept both `.` and `,` decimal separators,
  parse to float, always submit canonical kg.
- **Fast set logging (<5s):** quick-add button on dashboard; logger pre-fills weight/reps from
  `last-performance`; each set is a single optimistic TanStack Query mutation; large touch
  targets; no modal chains.
- **Charts:** every chart has the shared `DateRangePicker`; weight chart supports
  day/week/month/year buckets, MA7 overlay, trendline, goal line; exercise chart switches
  top set / e1RM / volume (reps fallback when no weighted sets).
- **PWA:** manifest + service worker; app shell precached; `/api` is NetworkOnly (no stale
  auth/data). Offline logging is explicitly out of scope.
- **Dark mode default** (Tailwind `dark` class on `<html>`), light toggle persisted in
  `localStorage`.

## 9. Security

- Credentials in env: `APP_USERNAME`, `APP_PASSWORD_HASH` (bcrypt), `SECRET_KEY` for session
  signing. First boot creates the `users` row from env if absent.
- `python -m app.cli hash-password`: no password argument ever; TTY uses `getpass` with
  confirmation, non-TTY reads the first stdin line for scripting.
- Session cookie: HttpOnly, SameSite=Lax, Secure when `COOKIE_SECURE=true`.
- CSRF stance: JSON-only API, same-origin single container, Lax cookie — no CSRF token in MVP.
- **No rate limiting in MVP.** A single-user app behind Tailscale/Caddy does not justify it;
  noted here so its absence is deliberate.
- **No error tracking service.** Logs go to stdout; Docker handles retention.
- **No i18n.** English-only strings.

## 10. Deployment & operations

- Multi-stage `Dockerfile`: Node builds the SPA → uv installs backend deps → `python:3.12-slim`
  runtime runs as a non-root user with `/data` volume.
- `scripts/entrypoint.sh`: `alembic upgrade head` then `exec uvicorn app.main:app`
  (single worker — SQLite).
- `docker-compose.yml`: one `app` service, `./data:/data` volume,
  `DATABASE_URL=sqlite:////data/tracker.db`, `env_file: .env`, healthcheck via
  `GET /api/health` (Python urllib, no curl dependency).
- **Backups:** `python -m app.cli backup` uses `sqlite3.Connection.backup()` because WAL mode
  makes raw file copies unsafe while the app is running. JSON export is the portable backup;
  raw file copies are safe only with the container stopped.
- Caddy/Tailscale terminate TLS and proxy to port 8000.

## 11. Testing strategy

- **Backend:** pytest with in-memory SQLite (StaticPool) and dependency override; a logged-in
  client fixture; happy-path tests per entity plus edge cases (idempotent workout replay,
  archive rules, PATCH settings absent/null/value, import cap 413, goal-null omission, PR
  formulas, e1RM bounds).
- **Migrations:** `alembic upgrade head → downgrade base → upgrade head` must all succeed on a
  temp DB, with the named unique constraints asserted after the final upgrade.
- **Frontend:** Vitest for units round-trips (kg↔lb, m↔mi, m↔ft, cm↔in), datetime conversion,
  and numeric parsing; `tsc -b` + `vite build` in the verification gate.
- **E2E smoke (Phase 7.5):** clean volume → compose up → migrate → seed → `/api/health`,
  `/docs`, `/api/dashboard`, PWA install prompt.

## 12. Explicitly out of scope (locked)

- Offline logging / sync queue
- Background job queue (Celery, Redis, etc.)
- Stored PR table
- Third-party imports (Strava, Apple Health, Garmin, Strong, Hevy) beyond the `source` columns
- Multi-user UI (schema is ready; routes/UX are not)
- i18n / localized strings
- Rate limiting / login brute-force protection
- Notifications (email, PR alerts), rest timer, plate calculator, superset/drop-set UI
- Progress photo storage and heart-rate stream storage

## 13. Decisions log

| Decision | Rationale |
|---|---|
| FastAPI over Node | Existing `AGENTS.md`, free OpenAPI, Python analytics/testing |
| Single container | Simplest ops, no CORS, one volume; Vite proxy covers dev |
| UUID PKs | Client-generated IDs for idempotent creates, import upsert, future multi-user |
| Canonical kg/m/s/cm | Unit preference is presentation-only; no data rewrites |
| PRs computed on read | Tiny data; avoids drift and rebuild logic |
| Epley capped at reps ≤ 12 | Epley overestimates beyond ~12 reps; higher-rep sets excluded from e1RM |
| 7-day MA hardcoded | Meets spec without settings surface; easy to expose later |
| Goal columns nullable | Null means omit goal UI, never 0%/NaN |
| Workout upsert = replace children | Simple, deterministic, exactly idempotent when clients send stable child UUIDs |
| No placeholder sets from templates | Would require nullable `reps` and pollute analytics |
| Session cookie over JWT | Single user, same origin, revocable by rotating `SECRET_KEY` |
| WAL + `Connection.backup()` | WAL makes live file copies unsafe; CLI backup is consistent |
| No i18n, no Sentry, no rate limiting | Deliberate MVP non-goals; stdout logs + reverse proxy suffice |
| Phase 2 tables pre-created | Avoids painful later migrations on populated MVP tables |
| Import reassigns to current user | Single-user import should just work; mismatch is expected, not an error |
| HR zones on read | No stream data; averages only; nothing to denormalize |
