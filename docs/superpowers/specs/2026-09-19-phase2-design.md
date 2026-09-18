# Phase 2 — Feature Expansion Design Spec (Additive)

- **Date:** 2026-09-19
- **Status:** Approved scope (user brief); deltas from MVP spec called out explicitly
- **Base spec:** `docs/superpowers/specs/2026-09-18-fitness-tracker-design.md` (the MVP spec remains authoritative for anything not changed here)

## 0. How to read this document

Everything in the MVP spec still applies: canonical units (kg, m, s, cm), UTC storage, UUID PKs,
session-cookie auth with `/api/health` and `/api/auth/login` as the only public routes, per-router
auth, idempotent workouts, computed-on-read analytics, nullable goals never rendering as 0.

This document lists **deltas only**. If a rule is not repeated here, the MVP spec governs.

## 1. Weekly workout calendar

### 1.1 Data model (new tables)

```
weekly_plans
  id UUID PK, user_id FK users CASCADE, name TEXT NOT NULL, name_lower TEXT NOT NULL,
  is_active BOOL NOT NULL DEFAULT false, created_at, updated_at
  UNIQUE(user_id, name_lower)              -- uq_weekly_plans_user_id_name_lower
  partial UNIQUE(user_id) WHERE is_active  -- uq_weekly_plans_active_per_user

weekly_plan_slots
  id UUID PK, plan_id FK weekly_plans CASCADE,
  day_of_week INT NOT NULL CHECK 0..6,     -- 0 = Monday … 6 = Sunday
  template_id FK workout_templates NULL ON DELETE SET NULL,
  created_at, updated_at
  UNIQUE(plan_id, day_of_week)             -- uq_weekly_plan_slots_plan_day
```

- A slot with `template_id NULL` is a rest day.
- Deleting a template nulls its slots (plan survives; that day becomes rest).
- Exactly one active plan per user, enforced by a partial unique index plus app logic
  (`POST /api/plans/{id}/activate` deactivates others then activates one, in one transaction).
  No active plan → calendar shows all-rest days.

### 1.2 API

- `GET /api/plans` — list with nested slots and template names.
- `POST /api/plans` — `{name, is_active?, slots: [{day_of_week, template_id|null}]}`; 409 on
  duplicate name; activating a new plan deactivates others.
- `GET /api/plans/{id}` — nested.
- `PATCH /api/plans/{id}` — partial: `name`, `slots` (replace semantics for slots). Activation is
  only through `POST /api/plans/{id}/activate`; `is_active` is not patchable (avoids an undefined
  path around the partial unique index).
- `DELETE /api/plans/{id}` — 204; deleting the active plan leaves no active plan.
- `POST /api/plans/{id}/activate` — 200; deactivates any other active plan.
- `GET /api/calendar?week_start=YYYY-MM-DD` — week_start defaults to the current ISO week Monday
  in the user's timezone, and must be a Monday (else 422). Response:

  ```json
  {
    "week_start": "2026-09-14T00:00:00Z",
    "week_end": "2026-09-21T00:00:00Z",
    "plan": {"id": "...", "name": "Upper/Lower"} | null,
    "days": [
      {"date": "2026-09-14", "day_of_week": 0, "template_id": "...", "template_name": "Upper A",
       "completed": true, "workout_ids": ["..."]}
    ],
    "adherence": {"planned_days": 4, "completed_days": 3}
  }
  ```

  - `week_start`/`week_end` are UTC instants of local midnight in the user's timezone;
    `week_end` is the exclusive next Monday. The example above assumes a UTC user.
  - `date` is the local calendar date in the user's timezone (date-only string, not an instant).
  - `completed` is true when at least one workout was performed on that local date; `workout_ids`
    lists them (may be more than one; completion is by day, not by template match).
  - `adherence.planned_days` counts slots with a template in the active plan;
    `completed_days` counts those days where `completed` is true.
  - Weeks with no active plan still return seven days with null templates and zero adherence.
- Starting a workout from the calendar uses the existing
  `POST /api/workouts/from-template/{template_id}`; completion appears on the next calendar fetch
  (no extra write path).

### 1.3 Frontend

- `/calendar` route with a week view (7 rows/cards), previous/next week navigation, "today"
  highlighting, and a plan selector. Tapping a day opens a bottom sheet to assign/change/clear the
  template. Days planned with a template get a "Start" action that calls from-template and
  navigates to the logger. Adherence line: "3/4 planned workouts completed".
- Bottom navigation gains a Calendar item.

## 2. Mobile layout improvements (polish, not a redesign)

- Safe areas: bottom nav and fixed bars use `pb-[env(safe-area-inset-bottom)]`; content bottom
  padding accounts for the nav height; `viewport-fit=cover` in `index.html`.
- Tap targets ≥ 44×44 px (Tailwind `min-h-11 min-w-11` on icon buttons).
- Forms scroll above the keyboard: inputs use `scroll-margin-bottom`, sheets are
  `max-h-[85dvh]` and scroll internally; the set logger keeps the active input visible.
- Number inputs (`NumberField`) gain large ± increment/decrement buttons (≥44 px) with
  step=1 for reps or a sensible weight step (2.5 kg metric / 5 lb imperial) applied in display
  units and converted back.
- A reusable `BottomSheet` component replaces full-page navigation for quick edits (set editing,
  calendar day assignment, confirmations). Full pages remain for creating entities.
- Charts are readable at 375 px: no horizontal scrolling, legend/labels abbreviated, tick counts
  reduced, chart height fixed via `ResponsiveContainer`; goal/BMI overlays do not add x-overflow.
- PWA install prompt: capture `beforeinstallprompt`, show a dismissible banner once, hide it when
  the app is already installed (`display-mode: standalone`) or dismissed (localStorage).
- Verification: CSS-level requirements are reviewed statically; manual device emulation at
  375×667 and 414×896 is a required check at the end of Phase 2. Task D3 runs a Playwright-driven
  headless Chromium viewport smoke (login through the real form, assert no horizontal overflow on
  each view, save screenshots), and records the outcome honestly (including a download/install
  failure with the exact error if it cannot run).

## 3. Profiles (single auth, multiple data containers)

- A profile is a row in `users`. The login account is the env-created user; additional profiles
  are created with the client-supplied name stored as their unique `users.username` (409 on
  duplicate; the global unique constraint also reserves the login user's name) and an unusable
  password hash (they are not login accounts). One authenticated session, multiple profiles.
- **Switching** updates `request.session["user_id"]` to the target profile id. The session cookie
  is unchanged; all scoped queries then operate on that profile's data. Any authenticated session
  may switch to any profile (single-user deployment; no account boundary exists).
- **Deletion rules:** cannot delete the environment login profile (409 — deleting it would
  permanently break login; `GET /api/profiles` exposes `is_login_account` so the UI disables it);
  cannot delete the currently active profile; cannot delete the last remaining profile; deletion
  requires password re-entry (checked against the environment credentials, see §4) and is coupled
  to the triple-friction flow in §4.
- **First-run flow:** the UI triggers on the exact signal "the active profile has no workouts, no
  weight entries, and no cardio activities", regardless of profile count (so it reappears after
  `DELETE /api/data/all` or a cleared profile). `GET /api/profiles` returns a per-profile
  `has_data` boolean computed from those three tables, which the UI uses directly.

### API

- `GET /api/profiles` — `[{id, username, is_active, is_login_account, has_data, created_at}]`
  where `is_active` marks the session's current profile, `is_login_account` marks the
  environment-created login row (undeletable), `username` is the profile name, and `has_data` is
  true when the profile has any workouts, weight entries, or cardio activities.
- `POST /api/profiles` — `{name}` creates a profile; 409 on duplicate name; returns the profile.
- `POST /api/profiles/{id}/switch` — 204; updates the session.
- `DELETE /api/profiles/{id}` — body `{password: str}`; 403 on wrong password; 409 when deleting
  the active or last profile; 204 otherwise. Cascade deletes the profile's data via existing FKs.
- `POST /api/data/demo` — seeds the exercise catalog only when the profile has no exercises, and
  fake data only when it has no workouts/weights/cardio; returns counts.

## 4. Editing and deletion with friction

- **Inline editing** (no full navigation) for: weight entries, cardio activities, workout
  name/notes, sets, plans (name/slots), shoes. Existing PATCH endpoints are reused; the frontend
  edits in place via bottom sheets or inline rows.
- **Deletion friction levels** (server enforces only what it can; the frontend enforces the
  modal flows):
  - **Single item** (one weight entry, one set, one cardio activity, one shoe, one plan, one
    template): one confirmation modal. Set delete uses an undo toast instead (no modal) per §6.
  - **Bulk / bulk-ish** — double confirmation (modal, then type-to-confirm `DELETE`): deleting a
    whole workout (`DELETE /api/workouts/{id}`), a week of cardio
    (`DELETE /api/data/cardio_activities?from&to`, UTC instants of local-week boundaries), and
    every row in a category (`DELETE /api/data/{entity}`).
  - **All data / profile delete** (`DELETE /api/data/all`, `DELETE /api/profiles/{id}`): triple
    friction — modal, type-to-confirm `DELETE`, then password re-entry. Both endpoints require
    `{password: str}` in the body.
- `DELETE /api/data/{entity}` (entity ∈ `weight_entries | workouts | cardio_activities | sets |
  plans | measurements`) accepts optional `from`/`to` UTC instants; they must be supplied together
  (one-sided → 422). When both are supplied only rows in that half-open range are deleted (used
  for "this week" flows); when neither is supplied the whole category for the active profile is
  deleted. The range column per entity: `measured_at` (weight_entries, measurements),
  `performed_at` (workouts, cardio_activities), the parent workout's `performed_at` (sets),
  `created_at` (plans). Response `{deleted: {entity: count}}`.
- **Export before delete:** every bulk/all delete flow shows a "Download backup first" action
  (one-tap JSON export via the existing `/api/export/json`).
- **Password verification for destructive endpoints** is against the environment credentials
  (`APP_USERNAME` / `APP_PASSWORD_HASH`), not the active profile row (profiles have unusable
  hashes). Wrong password → 403. Endpoints: `DELETE /api/data/all`, `DELETE /api/profiles/{id}`.
- `DELETE /api/data/all` deletes every row owned by the active profile (FK-safe order, now
  including `weekly_plans`/`weekly_plan_slots` and `cardio_splits`; shared with the seed reset
  helper), keeps the profile itself, and returns per-entity counts.

## 5. Weight goals: final, weekly rate, monthly

### 5.1 Schema (users)

- `goal_weight_kg` (existing) becomes the **final goal**.
- New nullable columns: `goal_rate_kg_per_week REAL`, `goal_monthly_mode TEXT NULL CHECK IN
  ('target','rate')`, `goal_monthly_target_kg REAL`, `goal_monthly_rate_kg REAL`.
- Check constraints: `goal_rate_kg_per_week` non-zero when present (negative = loss, positive =
  gain); `goal_monthly_target_kg > 0`; `goal_monthly_rate_kg` non-zero; when
  `goal_monthly_mode = 'target'` then `goal_monthly_target_kg` must be non-null; when `'rate'`
  then `goal_monthly_rate_kg` must be non-null (app-enforced, both-mode validation in Pydantic).
- Migration copies nothing: the existing `goal_weight_kg` is already the final goal.

### 5.2 Semantics and API

- Settings `GET/PATCH` gains `goal_rate_kg_per_week`, `goal_monthly_mode`,
  `goal_monthly_target_kg`, `goal_monthly_rate_kg`, `height_cm` (see §8). Same partial-null rules:
  absent = unchanged, explicit null clears; setting `goal_monthly_mode` requires the matching
  value field in the same request (or already stored) else 422; clearing the mode clears both
  monthly value fields.
- `GET /api/weight/series` response gains:

  ```json
  "goals": {
    "final_weight_kg": 75.0,
    "rate_kg_per_week": -0.5,
    "monthly": {"mode": "target", "target_kg": 77.0, "rate_kg_per_month": null}
  }
  ```

  Each field is null when unset; `goals` is always present (object with nulls), never a 0.
- **Dashboard progress**: `GET /api/dashboard` gains
  `weight_goal_progress: {status: "on_pace"|"ahead"|"behind"|"expired", trend_slope_kg_per_week,
  rate_goal_kg_per_week, required_rate_kg_per_week} | null`. Computed from the last 30 days of
  entries' least-squares slope vs the effective goal rate: the dated target's required rate when
  a dated target exists (§5.4), else `goal_rate_kg_per_week`. Null when either side is
  unavailable. Tolerance for `on_pace` is 0.1 kg/week. Direction-aware: for a negative goal rate,
  slope more negative = ahead. A past target date yields `status: "expired"`.

### 5.3 Frontend

- Settings gains a Goals section with final weight, weekly rate, monthly mode + value, and the
  dated target (target weight + date), all with null semantics and unit conversion at display
  time. When both dated fields are set, show the required rate ("To hit 78 kg by 2026-06-01 you
  need −0.42 kg/week").
- Weight chart: independently toggleable overlays for final goal (horizontal line), weekly rate
  (projected line from the latest entry), monthly goal (target line or projected line), and the
  dated target's required-rate line (dashed trendline from the latest entry to the target point);
  trendline unchanged. Toggles persist in component state only.
- Dashboard weight card shows on-pace/ahead/behind plus current vs required rate when available;
  an expired dated target shows "target date has passed".

### 5.4 Dated target (Addendum A)

- New nullable columns: `users.goal_weight_target_date DATE`, `users.goal_weight_target_kg REAL
  CHECK > 0`. Both set = dated target; it is independent of the undated final
  `goal_weight_kg` and takes precedence for chart overlays when present.
- Settings `GET/PATCH` exposes both fields; setting a target date without a target weight (or vice
  versa in the same request without the other already stored) → 422.
- `GET /api/weight/series` gains:
  - `required_rate_line: [{date, weight_kg}, ...] | null` — weekly points from the range end (or
    now, whichever is later) to the target weight on the target date; null when no dated target.
  - `on_track: "on_pace"|"ahead"|"behind"|"expired"|null` — compares the least-squares trend
    slope with the required rate (tolerance 0.1 kg/week, direction-aware); null when either is
    unavailable. Past target date → `required_rate_line: null`, `on_track: "expired"`.
- **Past target date handling:** never compute a rate with zero/negative weeks remaining. The
  shared helper returns the `"expired"` sentinel instead.

## 6. Set editing (logger and workout detail)

- Each set row always shows edit and delete icon buttons (≥44 px), not a hidden menu.
- Edit turns the row into an inline editor (weight, reps, RPE, warmup) with inline Save/Cancel;
  saving calls `PATCH /api/sets/{id}` and keeps the row inline (no navigation). The `is_drop_set`
  API field remains accepted by the backend but is deliberately not surfaced in the UI (MVP
  section 12 keeps superset/drop-set UI out of scope); `is_drop_set` values round-trip untouched.
- Delete calls `DELETE /api/sets/{id}` immediately and shows an undo toast; undo re-creates the
  set via `POST /api/workout-exercises/{id}/sets` with the same values (a new id; `set_number` is
  appended). No confirmation modal.
- Reordering: up/down arrow buttons per row call the new
  `POST /api/workout-exercises/{id}/reorder-sets` with `{set_ids: [...]}` (the complete ordered
  list of that exercise's set IDs). Server validates the set belongs to the workout-exercise,
  validates the list is a permutation of existing sets (422 otherwise), reassigns `set_number =
  index + 1` in one transaction, and returns the updated sets. `PATCH/DELETE /api/sets/{id}` are
  unchanged.

## 7. Running tracker

### 7.1 Splits (new table + API)

```
cardio_splits
  id UUID PK, cardio_activity_id FK cardio_activities CASCADE,
  split_number INT NOT NULL CHECK >= 1, distance_m REAL NOT NULL CHECK > 0,
  duration_s INT NOT NULL CHECK > 0, created_at, updated_at
  UNIQUE(cardio_activity_id, split_number)   -- uq_cardio_splits_activity_number
```

- `POST /api/cardio` and `PATCH /api/cardio/{id}` accept an optional `splits` array (full replace
  on create/patch). Validation: each split has `distance_m > 0`, `duration_s > 0`, unique
  `split_number`; the array order defines `split_number = index + 1` when omitted.
- `GET /api/cardio/splits/{id}` returns `{source: "stored"|"derived", splits: [...]}`:
  stored splits when present, else evenly derived splits of 1 km (last split = remainder) from
  distance and duration for display only; `{source: "derived"}` with an empty list when the
  activity has no distance. Derived values are never persisted.
- Splits UI: optional editor in the run form (add/remove rows; number inferred from distance with
  a hint), split table on the run detail page (`/running/:id`, new `RunDetailPage.tsx`) with
  per-split pace; the zones bar (§7.3) renders on the same page.

### 7.2 Shoes (promote the Phase 2 stub)

- Remove the `/api/shoes` 501 stub router and implement CRUD for real.
- `GET /api/shoes` returns each shoe with `mileage_m = initial_distance_m + Σ cardio distance`;
  `POST/PATCH/DELETE` follow the standard nested/ownership rules. Deleting a shoe sets
  `cardio_activities.shoe_id` NULL via the existing FK.
- `POST/PATCH /api/cardio` accept `shoe_id` (must belong to the user, else 404).
- UI: shoes list with mileage and an "over 800 km — consider replacing" warning; shoe selector in
  the run form.

### 7.3 Running PRs, zones, streaks, comparison (all computed on read, never stored)

- `GET /api/cardio/prs` — `{fastest_1k, fastest_5k, fastest_10k, longest_distance,
  longest_duration}`; each is null or `{cardio_activity_id, performed_at, value}` where `value` is
  seconds for the fastest-* PRs and meters for `longest_distance` (seconds for
  `longest_duration`). Fastest-distance PRs are computed from stored splits only (activities
  without splits contribute to longest-distance and longest-duration only).
  - Rolling-window rule for fastest 5k/10k: among contiguous split windows whose summed distance
    is ≥ the target (1k = 1000 m), pick the one with the minimum summed duration; ties break to
    the earliest window; null when no window reaches the target. Mixed-distance splits are
    allowed (e.g. 400 m / 600 m windows can satisfy 1k).
- **HR zones** (derived on read): `GET /api/cardio/{id}/zones` →
  `{max_hr, zones: [{zone: "Z1", label: "50-60%", seconds}, …]} | null`; null when
  `users.max_hr` is unset. Band bounds are lower-inclusive, upper-exclusive; below the 50% floor
  clamps to Z1 and at/above 100% clamps to Z5. With only session-average HR available, the whole
  activity duration is attributed to the zone containing `avg_hr`; `null` avg_hr → all zone
  seconds 0 (still returns zones when max_hr is set). Approximation is documented in the UI with a
  footnote.
- `GET /api/cardio/streaks` → `{current_weeks, longest_weeks, weekly_counts: [...]}`; `longest_weeks`
  is all-time, `weekly_counts` covers the last 12 ISO weeks (user timezone) as
  `{week_start, count, distance_m}` oldest → newest. Current streak counts back from the current
  week if it has ≥1 run, else from the previous week.
- `GET /api/cardio/comparison` → `{this_week, last_week, four_week_average}` each
  `{total_distance_m, total_duration_s, activity_count, avg_pace_s_per_km}`. Scoped to runs by
  default; pass `type` to override. `four_week_average` is the mean of the four ISO weeks
  preceding the current week (weeks with zero runs count as zero).
- Weekly summary card on the running view composes `/api/cardio/week`, `streaks`, and `prs`;
  "PRs hit this week" is derived client-side from `prs[].performed_at` falling inside the current
  local ISO week (no extra endpoint).
- Consistency heatmap: the 12-week `weekly_counts` rendered GitHub-style on the running view.

## 8. BMI

- `users.height_cm REAL NULL CHECK > 0` (new column).
- BMI = `weight_kg / (height_m ** 2)`, computed in the frontend from the latest weight entry and
  `height_cm`; never stored, never a goal.
- Categories: underweight < 18.5, normal 18.5–24.9, overweight 25–29.9, obese ≥ 30.
- Weight section shows a BMI card (value, category, monochrome position indicator per §10) only
  when `height_cm` and a latest weight exist; the weight chart shows a BMI line on a secondary
  axis when `height_cm` is set.
- The profile/settings BMI calculator accepts height and shows the current BMI from the latest
  weight.
- **Disclaimer required everywhere BMI appears**: "BMI is a population-level metric and may not
  reflect individual body composition." Small text, always present.

## 9. Per-lift goals and progress extensions (Addendum B)

### 9.1 Schema (exercises)

- New nullable columns: `goal_weight_kg REAL CHECK > 0`, `goal_reps INTEGER CHECK > 0`,
  `goal_target_date DATE`, `goal_reps_bodyweight INTEGER CHECK > 0`.
- Weighted exercises: target = `goal_weight_kg` (+ optional `goal_reps` and `goal_target_date`).
  Bodyweight exercises: target = `goal_reps_bodyweight` (no weight).
- `PATCH /api/exercises/{id}` accepts all four with partial/explicit-null semantics; a target date
  without a target value (weight or bodyweight reps) → 422. Archive/rename behavior unchanged.

### 9.2 Progress endpoint extensions

`GET /api/exercises/{id}/progress?from&to&reps=` gains:

- `sets_per_week: [{week_start, sets}]` — frequency signal (non-warmup sets).
- `avg_rpe: [{performed_at, avg_rpe}]` — mean RPE of non-warmup sets that have one.
- `estimated_weight_at_reps: [{performed_at, weight_kg}] | null` — the `reps` query param is
  optional; absent → this field is `null` and nothing else changes (existing callers unaffected).
  When present it must be 1..12 (422 otherwise) and each session's best e1RM is converted back to
  an equivalent weight at that fixed rep count: `weight_kg = e1rm / (1 + reps/30)`, using the best
  e1RM in the session; sessions with no eligible e1RM are omitted.
- `goal: {mode: "weight"|"bodyweight", weight_kg|null, reps|null, target_date|null,
  required_rate_line: [{date, weight_kg|reps}] | null, on_track: "on_pace"|"ahead"|"behind"|
  "expired"|null, estimate_date: date|null} | null` — null when the exercise has no goal. When
  both a weight target and a bodyweight-reps target are stored, **weight takes precedence** for
  `mode`, required rate, and `estimate_date`.
  - Required rate uses the shared analytics helper §11.2; the current value is the latest session's
    top-set weight (weighted) or best reps (bodyweight), compared against the last 8 weeks'
    least-squares trend.
  - `estimate_date` is where the current 8-week trend crosses the target; null (UI: "not on
    track") when the trend is flat, moving away, or there is not enough data.
  - Past target date → `required_rate_line: null`, `on_track: "expired"`.

### 9.3 Frontend (Task F8)

- Exercise library rows navigate straight to the progress view; each logger exercise row gets a
  "view progress" icon that preserves the current date range when navigating.
- Metric switcher adds Total sets/week, Average RPE, and e1RM at fixed reps (with a rep-count
  picker defaulting to 5).
- "Set goal" button opens a small form (weighted or bodyweight mode by exercise is_compound /
  existing sets); the goal renders as a horizontal line (no date) or a dashed required-rate
  trendline (dated), visually distinct from the actual series.
- "At current rate, you'll hit this on ~{date}" or "not on track"; expired goals show "target
  date has passed".

## 10. Monochrome UI with coloured charts (Addendum C)

### 10.1 UI palette (all non-chart surfaces)

Neutral scale only; no hue-based accents in navigation, buttons, forms, cards, tables, modals,
toasts, or status indicators.

- Dark (default): backgrounds `#000` / `#0a0a0a` / `#111`; surfaces `#111` / `#1a1a1a` / `#222`;
  borders `#2a2a2a` / `#333`; primary text `#f5f5f5` / `#e5e5e5`; secondary `#a3a3a3`;
  disabled/muted `#525252`; primary action = white background, black text.
- Light: backgrounds `#fff` / `#fafafa` / `#f5f5f5`; surfaces white with subtle borders; borders
  `#e5e5e5` / `#d4d4d4`; primary text `#0a0a0a`; secondary `#525252`; disabled/muted `#a3a3a3`;
  primary action = black background, white text.

### 10.2 Charts (the only colour)

- A curated categorical palette of 5–6 distinguishable hues, defined as CSS variables with
  light/dark variants (OKLCH-based; avoid highly saturated web colours). Chart chrome — axes,
  grids, tooltips, legends — stays monochrome.
- Within a single chart, every series is distinguishable by colour **and** a secondary channel
  (line style, marker shape, or fill pattern). Series must remain identifiable in grayscale.
- Semantic lines: actual data = per-series colour; trendline = dashed muted; required-rate =
  dotted muted; goal = solid thin muted or one chart accent; moving average = solid thin muted.
- Never use red/green to mean bad/good, even in charts; emphasis uses muted overlays or hatch
  fills.
- Status indicators (non-chart) are monochrome and convey meaning with icon, weight, and text:
  `↑ ahead`, `→ on pace`, `↓ behind`, `✓ done`, `! attention`. The BMI category uses a position
  marker on a light-grey→dark-grey gradient or a label — no colour.
- Focus rings and hover/active states use opacity/outline weight, not hue.
- The BMI disclaimer and warning text stay monochrome with icon + weight.

### 10.3 Implementation and scope

- Tailwind theme gains neutral chrome tokens and `chart-1..chart-6` CSS variables that flip with
  the dark class; replace ad-hoc palette classes (`bg-blue-500`, `text-emerald-400`, …) across the
  app. PWA icons and favicon are regenerated monochrome.
- Explicitly **not** allowed: a colour-blind mode, a "bring back colour" toggle, or a
  user-selectable chrome accent.
- This is a styling-only change: no component structure, layout, or behaviour changes. Any
  component that relied on colour to convey meaning is converted to icon/text/weight and recorded
  in the architecture decisions doc.
- Accessibility: WCAG AA contrast for UI (4.5:1 body, 3:1 large/UI); chart series verified
  distinguishable in grayscale via the secondary channel.

### 10.4 Shared required-rate helper (all addenda)

- `required_rate_per_week(current_value, target_value, target_date)` is implemented **once** in
  `app/services/analytics.py` and called by both the weight series endpoint and the exercise
  progress endpoint. It returns a float (negative = decrease required), or the `"expired"`
  sentinel when `target_date` is in the past, or `None` when inputs are missing.
- On-track classification is also centralized: `compare_rate(trend_slope, required_rate,
  tolerance=0.1)` → `"on_pace" | "ahead" | "behind" | "expired" | None`, direction-aware
  (target below current = cut; above = bulk).

## 11. Migration plan (Alembic)

One new revision on top of `069cd172c734` (never edit the initial migration):

1. `users`: add `goal_rate_kg_per_week`, `goal_monthly_mode` (+CHECK), `goal_monthly_target_kg`,
   `goal_monthly_rate_kg`, `height_cm` (+CHECK), `goal_weight_target_date`,
   `goal_weight_target_kg` (+CHECK). All nullable; existing rows unaffected.
2. `exercises`: add `goal_weight_kg` (+CHECK), `goal_reps` (+CHECK), `goal_target_date`,
   `goal_reps_bodyweight` (+CHECK). All nullable.
3. Create `weekly_plans`, `weekly_plan_slots` (with named constraints and the partial unique
   active index), `cardio_splits` (+ named unique constraint).
4. Verify `alembic upgrade head → downgrade base → upgrade head` (the existing migration test
   already exercises the full chain) and a new migration-specific test asserting the new tables,
   columns, and index behavior (one active plan per user enforced).

## 12. Explicitly out of scope (unchanged from MVP §12, plus)

Still out of scope, now explicitly including: GPS/live tracking, route maps, multi-user auth
(multiple passwords/accounts), Strava/Apple/Garmin imports, background jobs, offline logging,
notifications/emails, i18n, rate limiting, colour-blind mode / chrome accent toggles (addendum C
makes monochrome the theme; charts keep colour).

## 13. Decisions log (added)

| Decision | Rationale |
|---|---|
| Weekly plan slots reference templates with SET NULL | Deleting a template must not destroy plans; the day becomes rest |
| Day completion = any workout on the local date | Template-match completion would miss ad-hoc sessions and edits |
| Partial unique index for one active plan | Database-enforced invariant instead of best-effort app logic |
| Profiles are `users` rows with unusable hashes | Schema already scopes everything by `user_id`; no auth-model change |
| Environment login profile is undeletable (409) | Deleting it would permanently break login; protects the existing auth model |
| Destructive password check against env credentials | Profiles have no usable passwords; env credentials are the login account |
| `POST /api/data/demo` added | First-run "Load demo data" requirement needs a server path; CLI-only would break the flow |
| Fastest-distance PRs require stored splits | Average-pace-derived "PRs" would be fabricated; longest distance/duration still global |
| Zone time from average HR | Only session averages exist; streams are out of scope |
| BMI computed in frontend, never stored | Height and latest weight are both available client-side; avoids staleness |
| Required-rate math in one shared helper | Weight dated targets and lift goals must not diverge; `"expired"` sentinel lives with it |
| Dated target takes precedence over undated final goal on charts | One overlay source of truth when both exist; the undated goal remains available |
| e1RM-at-fixed-reps uses the session's best e1RM | Like-for-like comparisons across weeks with varying reps; inverse Epley conversion |
| Monochrome chrome, colour only in charts | User mandate; series still differentiated by secondary channels for accessibility |
