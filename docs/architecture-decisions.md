# Architecture Decisions

This document records the architecture decisions for the self-hosted fitness tracker MVP. It
mirrors the decisions log in the design spec
(`docs/superpowers/specs/2026-09-18-fitness-tracker-design.md`, section 13), expands the
security/operations non-goals from section 9, and logs the beyond-plan changes that were
explicitly approved during implementation. The spec remains the source of truth.

Scope: single user, multi-user-ready schema, one Docker container behind Caddy or Tailscale.

## Stack and architecture decisions

| Decision | Rationale | Where |
|---|---|---|
| FastAPI over Node | Matches `AGENTS.md`; free OpenAPI at `/docs`; Pydantic validation; Python analytics and testing | `backend/app/main.py`, `backend/pyproject.toml` |
| Single container | Simplest ops, no CORS, one volume; Vite's `/api` proxy covers development | `Dockerfile`, `docker-compose.yml`, `frontend/vite.config.ts` |
| UUID primary keys (32-char hex in SQLite, canonical UUID strings in JSON) | Client-generated IDs make workout creates idempotent and retries safe, JSON import can upsert by ID, future multi-user merging stays trivial | `backend/app/models/base.py`, `frontend/src/lib/uuid.ts` |
| Canonical units in storage: kg, meters, seconds, cm | Unit preference is presentation-only, so no stored value ever changes meaning when preferences change | `backend/app/models/`, `frontend/src/lib/units.ts` |
| PRs computed on read, never stored | The dataset is tiny; a denormalized PR table drifts and needs rebuild logic | `backend/app/services/analytics.py`, `backend/app/routers/workouts.py` |
| Epley e1RM capped at reps ≤ 12 | Epley overestimates beyond ~12 reps, so higher-rep sets are excluded from e1RM series and `best_e1rm` (they stay in weight/reps/volume series) | `backend/app/services/analytics.py` (`EPLEY_MAX_REPS = 12`) |
| 7-day moving average hardcoded | Meets the spec without a settings surface; easy to expose later | `backend/app/services/analytics.py` (`MOVING_AVERAGE_DAYS = 7`) |
| Goal columns nullable; null means omit the goal UI | Null must never render as 0% or NaN and must not divide by zero | `backend/app/routers/weight.py`, `backend/app/routers/cardio.py`, `backend/app/routers/dashboard.py` |
| Workout upsert = replace children | Simple, deterministic, and exactly idempotent when clients send stable child UUIDs; existing `workout_exercises`/sets are deleted before the payload tree is re-inserted | `backend/app/routers/workouts.py` (`_delete_children`, `upsert_workout`) |
| No placeholder sets from templates | Placeholder rows would require nullable `reps` (taxing every analytics query) and would corrupt volume/PRs if treated as completed; `from-template` persists zero sets and returns a `planned` sibling | `backend/app/routers/workouts.py` (`/api/workouts/from-template/{template_id}`) |
| Session cookie over JWT | Single user, same origin; revocation is rotating `SECRET_KEY`; `SessionMiddleware` sets HttpOnly, SameSite=Lax, and Secure when `COOKIE_SECURE=true` | `backend/app/main.py`, `backend/app/security.py`, `backend/app/deps.py` |
| WAL + `Connection.backup()` | WAL mode makes raw file copies unsafe while the app runs; the CLI backup uses SQLite's online backup API for a consistent snapshot. JSON export is the portable backup | `backend/app/database.py` (`apply_sqlite_pragmas`), `backend/app/cli.py` (`backup`) |
| Phase 2 tables pre-created now, routes return 501 | Adding tables later is cheap, but adding columns/FKs to populated MVP tables is the painful migration; pre-creating costs one migration now | `backend/app/models/phase2.py`, `backend/app/routers/phase2.py`, `backend/alembic/versions/069cd172c734_initial_schema.py` |
| Import reassigns all rows to the current user | Single-user import should just work; a user mismatch in the file is expected, not an error. Logged once per entity at INFO | `backend/app/services/import_export.py` |
| HR zones derived on read (Phase 2) | Only session-average `avg_hr` exists, so zones are activity-level approximations; nothing is stored | Spec section 7; no MVP code (Phase 2 tables/routes are 501) |

## Security and operations decisions

- **No rate limiting in MVP.** A single-user app behind Tailscale/Caddy does not justify it.
  Its absence is deliberate, not an oversight (spec section 9; spec section 12 locks it out of
  scope).
- **CSRF stance: no token in MVP.** The API is JSON-only, served same-origin from the single
  container, and the session cookie is SameSite=Lax. `SessionMiddleware` is configured in
  `backend/app/main.py`.
- **No i18n.** English-only strings; localized UI is explicitly out of scope.
- **No error-tracking service.** Logs go to stdout and Docker handles retention. The backend
  logs through the standard library from service modules (for example
  `backend/app/services/import_export.py`, `backend/app/services/users.py`).
- **Single uvicorn worker.** The entrypoint runs one worker because SQLite is a single-writer
  database (`backend/scripts/entrypoint.sh`).
- **Credentials in env.** `APP_USERNAME`, `APP_PASSWORD_HASH` (bcrypt), and `SECRET_KEY` come
  from the environment; first boot creates the `users` row if absent
  (`backend/app/config.py`, `backend/app/routers/auth.py`, `backend/app/services/users.py`).
- **`GET /api/health` stays public.** Auth is applied per router, never app-wide, so health
  checks can never 401 (`backend/app/main.py`).

## Beyond-plan changes approved during implementation

These changes went beyond the original plan text and were approved with the rationale below
before or during implementation. File references are to the code that carries them.

| Change | Rationale | Where |
|---|---|---|
| RPE DB check made explicit: `rpe IS NULL OR (rpe >= 0 AND rpe <= 10)`; 0.5-step granularity enforced by Pydantic instead of a DB half-step check | Handles null explicitly and keeps fractional granularity at the API boundary, where it can produce a clean 422; no fragile modulo check in SQLite | `backend/app/models/workout.py`, `backend/alembic/versions/069cd172c734_initial_schema.py`, `backend/app/schemas/workout.py` |
| Added `ix_workout_templates_user_archived` and `ix_workout_tags_tag_id` | Approved in the Phase 1 model addenda: named indexes backing archive filtering for templates and tag lookups for the Phase 2 join table | `backend/alembic/versions/069cd172c734_initial_schema.py` |
| `/api/health` uses `Depends(get_db)` instead of `SessionLocal` | Tests override the session dependency, so health checks never touch the development database; the route stays public because no auth dependency is added | `backend/app/main.py` |
| Pydantic ID fields typed `uuid.UUID` instead of `str` | ORM attributes are `UUID` objects; typing the schemas the same way removes casts at the session/serialization boundary | `backend/app/schemas/workout.py`, `backend/app/schemas/` |
| Seed realism rules: deterministic constant/descending/ascending-plus-descending rep schemes, bodyweight reps in the 10–20 range, workout names derived from exercise muscle groups, non-systematic weigh-in gaps | Fake data must look plausible for demos and charts while staying deterministic for a fixed seed; fixed weekly patterns would make MA/trend output misleading | `backend/app/seed/fake_data.py` |
| ESLint `no-restricted-syntax` added alongside `no-restricted-properties` | `no-restricted-properties` only catches static `Date.toLocale*` calls; the syntax selector also catches instance calls on variables | `frontend/eslint.config.js` |
| Extracted testable units: `frontend/src/lib/dateRange.ts`, `frontend/src/lib/duration.ts`, `frontend/src/lib/uuid.ts` (with a `crypto.getRandomValues` fallback when `crypto.randomUUID` is unavailable, e.g. non-secure contexts), `frontend/src/features/settings/settingsDraft.ts`, `frontend/src/features/lifting/progressSeries.ts`, `frontend/src/features/lifting/QueryErrorNotice.tsx`, `frontend/src/features/lifting/Toast.tsx` | Pure helpers and small components are unit-testable with Vitest and keep react-refresh-compatible component files; the PWA can run outside a secure context | `frontend/src/lib/`, `frontend/src/features/settings/`, `frontend/src/features/lifting/` |
| CSV export via `fetch` + blob instead of direct navigation | Downloading through `fetch` lets the UI surface non-2xx responses (for example a 401) as an error message instead of saving an error body as a `.csv` file | `frontend/src/api/client.ts`, `frontend/src/features/settings/DataPage.tsx` |
| Added `.dockerignore` | Keeps host artifacts (`backend/.venv`, `node_modules`, `dist`, `data`, `.env`) out of the build context; without it `COPY backend/ /app/` would overwrite the container's Linux venv with the host's macOS one | `.dockerignore` |
| uv image tag `ghcr.io/astral-sh/uv:0.12.17-python3.12-trixie-slim` | The `bookworm` variant for uv 0.12.17 does not exist in GHCR; trixie matches the `python:3.12-slim` runtime (both Debian 13), so the copied venv is portable | `Dockerfile` |
| Custom catch-all SPA route instead of `StaticFiles(html=True)` | Deep links return `index.html` while `/api/...` always returns a JSON 404; real static files are served directly and path traversal is rejected | `backend/app/main.py` |
| `.env.example` single-quote rule for bcrypt hashes | Docker Compose interpolates `$` in unquoted/double-quoted `env_file` values and silently corrupts bcrypt hashes; single-quoting keeps `$` literal so login works | `.env.example` |

## Escalations

During Phases 4–7 the reviewer operated under expanded authority. No escalation was required:
there were no out-of-scope changes, no changes to canonical units or UTC storage, no changes to
the auth model, and no security issues. Every beyond-plan item listed above was approved with
the stated rationale.

## Phase 2

The Phase 2 spec (`docs/superpowers/specs/2026-09-19-phase2-design.md`) is additive: the MVP spec
and the decisions above still govern anything it does not change. This section mirrors the Phase 2
decisions log (section 13), records the monochrome conversion list required by section 10.3, and
logs the Phase 2 beyond-plan changes.

### Phase 2 decisions

| Decision | Rationale | Where |
|---|---|---|
| Weekly plan slots reference templates with SET NULL | Deleting a template must not destroy plans; the day becomes rest | `backend/app/models/workout.py` (`WeeklyPlanSlot.template_id`), `backend/app/routers/plans.py` |
| Day completion = any workout on the local date | Template-match completion would miss ad-hoc sessions and edits | `backend/app/routers/plans.py` (`get_calendar`) |
| Partial unique index for one active plan | Database-enforced invariant instead of best-effort app logic | `backend/alembic/versions/223a04bfe427_phase2_schema.py` (`uq_weekly_plans_active_per_user`), `backend/app/routers/plans.py` (`activate_plan`) |
| Profiles are `users` rows with unusable hashes | Schema already scopes everything by `user_id`; no auth-model change | `backend/app/routers/profiles.py`, `backend/app/services/users.py` |
| Environment login profile is undeletable (409) | Deleting it would permanently break login; protects the existing auth model | `backend/app/routers/profiles.py` (`is_login_account`), `frontend/src/features/profiles/ProfileManager.tsx` |
| Destructive password check against env credentials | Profiles have no usable passwords; env credentials are the login account | `backend/app/routers/profiles.py`, `backend/app/routers/data_delete.py`, `backend/app/security.py` (`verify_password`) |
| `POST /api/data/demo` added | First-run "Load demo data" requirement needs a server path; CLI-only would break the flow | `backend/app/routers/profiles.py` (`demo_router.seed_demo`) |
| Fastest-distance PRs require stored splits | Average-pace-derived "PRs" would be fabricated; longest distance/duration still global | `backend/app/services/running.py` (`_fastest_window`, `personal_records`), `backend/app/routers/cardio.py` (`GET /api/cardio/prs`) |
| Zone time from average HR | Only session averages exist; streams are out of scope | `backend/app/services/running.py` (`hr_zones`), `frontend/src/features/running/ZonesBar.tsx` |
| BMI computed in frontend, never stored | Height and latest weight are both available client-side; avoids staleness | `frontend/src/lib/bmi.ts`, `frontend/src/features/weight/WeightPage.tsx`, `frontend/src/features/weight/WeightChart.tsx` |
| Required-rate math in one shared helper | Weight dated targets and lift goals must not diverge; the `"expired"` sentinel lives with it | `backend/app/services/analytics.py` (`required_rate_per_week`, `compare_rate`), `frontend/src/lib/goals.ts` |
| Dated target takes precedence over undated final goal on charts | One overlay source of truth when both exist; the undated goal remains available | `backend/app/routers/weight.py`, `frontend/src/features/weight/WeightChart.tsx`, `frontend/src/features/settings/SettingsPage.tsx` |
| e1RM-at-fixed-reps uses the session's best e1RM | Like-for-like comparisons across weeks with varying reps; inverse Epley conversion | `backend/app/routers/workouts.py` (`estimated_weight_at_reps`), `frontend/src/features/lifting/progressSeries.ts` |
| Monochrome chrome, colour only in charts | User mandate; series still differentiated by secondary channels for accessibility | `frontend/src/index.css`, `frontend/src/lib/chartTheme.ts` |

### Colour to icon/text/weight (section 10.3 record)

The monochrome conversion was styling-only (no structure, layout, or behaviour changes). Components
that previously conveyed meaning with colour now convey it with icon, text, or weight:

| Component(s) | Previous colour cue | Now |
|---|---|---|
| Every `role="alert"` error line (login, weight, cardio/run detail, shoe form, profiles, workout logger, templates, exercise library/picker/goal form, plans/calendar, settings/data/backup, delete flows) | Red text | `role="alert"` + message text + `font-medium` weight (no new glyph) |
| Block-level destructive buttons (`DeleteFlow`, `TypeToConfirm`, `ConfirmDialog.destructive`, `DangerZone`, `ProfilePicker`) | Red border/text/fill | Explicit "Delete …" label + heavier neutral border (`line-strong`) + `hover:bg-content/10` |
| Row-level delete/remove actions (set trash, workout remove/delete, template delete, weight/run deletion rows, goal remove, plan delete) | Red hover | Explicit label + neutral hover emphasis |
| Shoe mileage warning | Red-adjacent emphasis | `! Over 800 km — consider replacing` (icon + text), neutral |
| Dashboard weight-goal status | Red/green-ish accent | `↑ Ahead` / `→ On pace` / `↓ Behind` / `! Target date has passed.`, neutral |
| Calendar day completion | Accent colour | `✓ Done`, neutral |
| BMI card category | Colour categories | Category label + grey-gradient position marker |
| Toast (undo) | Accent border/action | Neutral border; "Undo" in neutral emphasis |
| Import/success status boxes | Accent-tinted border | Neutral border + result text |

Charts keep colour (`chart-1..chart-6` OKLCH variables with light/dark variants) and are never the
sole channel: within a chart each series also differs by dash pattern and marker shape.

### Beyond-plan changes approved during implementation (Phase 2)

| Change | Rationale | Where |
|---|---|---|
| Test engine now enforces FK pragmas | The `ON DELETE SET NULL` behavior took effect in production but not in the test engine, so the real FK action was not exercised; the `engine` fixture now runs `apply_sqlite_pragmas` so API tests use the production pragmas | `backend/tests/conftest.py`, `backend/app/database.py`, `backend/tests/test_plans.py` |
| Shared `delete_user_data` reset helper | `DELETE /api/data/all` and `seed --reset` must clear the same FK-safe table set (including `weekly_plans`/`weekly_plan_slots` and `cardio_splits`); one helper prevents the two paths drifting | `backend/app/services/user_data.py`, `backend/app/routers/data_delete.py`, `backend/app/seed/__main__.py` |
| Export envelope extended with Phase 2 settings | The `settings` object in the JSON export now also carries `goal_rate_kg_per_week`, `goal_monthly_mode`, `goal_monthly_target_kg`, `goal_monthly_rate_kg`, `goal_weight_target_date`, `goal_weight_target_kg`, and `height_cm`, so a backup includes them; settings are export-only — import upserts the `data` entities and ignores `settings` (restoring settings remains manual) | `backend/app/services/import_export.py` (`export_envelope`), `backend/tests/test_export_import.py` |
| Added `GET /api/shoes/{id}` | Completes CRUD read and gives direct ownership coverage for the promoted shoes router | `backend/app/routers/shoes.py` |
| Phase 2 frontend pure helpers: `lib/stepper.ts`, `lib/bmi.ts`, `lib/goals.ts`, `lib/pace.ts`, `lib/chartTheme.ts` | Step math, BMI formula/categories/disclaimer, the required-rate mirror and projections, pace/split inference, and the chart palette plus secondary channels are all unit-testable with Vitest when kept out of components. `lib/dateRange.ts`, `lib/duration.ts`, and `lib/uuid.ts` are unchanged from the MVP table above | `frontend/src/lib/` |
| Logic extractions: `deleteStages`, extended `settingsDraft` and `progressSeries` | Keeps stateful components small and react-refresh compatible; `deleteStages` encodes the section 4 friction matrix, `settingsDraft` gained the goal/height fields and null semantics, `progressSeries` gained the new progress metrics and goal helpers | `frontend/src/components/deleteStages.ts`, `frontend/src/features/settings/settingsDraft.ts`, `frontend/src/features/lifting/progressSeries.ts` |
| Playwright viewport smoke verification | Chrome is not installed on this machine, so Task D3 uses Playwright's headless Chromium to log in through the real form and assert no horizontal overflow on `/`, `/weight`, `/lifting`, `/running`, `/calendar`, and `/settings` at 375×667 and 414×896, saving screenshots; if the Chromium download fails, D3 records the exact error instead of claiming a pass. Not yet run at the time of this entry (F1/F2/F3 deferred browser verification to D3) | `docs/superpowers/plans/2026-09-19-phase2.md` (Task D3, `viewport-smoke.mjs`) |
