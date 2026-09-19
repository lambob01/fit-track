# Scheduling Flexibility & Overviews — Implementation Plan

> Execute with the established reviewer loop: implementer leaves changes uncommitted, a read-only
> reviewer checks the diff against the Phase 2/2.1 specs + this plan + `AGENTS.md`, fixes loop to
> `APPROVE`, then commit. Push once at the end after the pre-push checks. Escalate only for:
> out-of-scope-list changes, canonical-units/UTC changes, auth-model changes, security issues.

**Goal:** Add inline template creation, move/swap rescheduling with a bounded missed-workout offer,
and Week/Month/List overviews to the weekly calendar.

**Spec:** `docs/superpowers/specs/2026-09-19-scheduling-overview-design.md` (deltas authoritative).
**Base specs:** Phase 2 (`2026-09-19-phase2-design.md`) and MVP (`2026-09-18-fitness-tracker-design.md`).

**Constraints:** no schema changes; canonical units and UTC unchanged; birthdays of dates go through
`lib/datetime.ts`; no new dependencies; styling stays monochrome (charts unchanged).

---

### Task S1: Calendar range API

**Files:** Modify `backend/app/routers/plans.py`, `backend/app/schemas/plan.py`; test
`backend/tests/test_calendar_range.py`.

**Behavior:** spec §2. `GET /api/calendar` accepts optional `from`/`to` (dates):
- both-or-neither (one-sided 422), `from <= to` (else 422), span ≤ 62 days (else 422);
- when present: `days` for the inclusive range in the user's timezone plus
  `weeks: [{week_start, week_end, planned_days, completed_days}]` (ISO weeks intersecting the
  range, same completion rule);
- when absent: existing `week_start` behavior byte-identical.

**Tests (real):**
- `week_start` path unchanged (existing `test_plans.py` must stay green) and `weeks` is `null`;
- one-sided `from` → 422; `from > to` → 422; `week_start` together with `from`/`to` → 422;
  boundary: `(to - from).days == 61` accepted, `== 62` → 422;
- range mode returns defined `week_start`/`week_end` (UTC instants of local midnight, end-exclusive
  of `to + 1`), `plan`, `adherence` = range sums, and 3 `weeks` entries for a 3-week range whose
  `planned_days`/`completed_days` match crafted slots/workouts and are **clipped** – add a
  mid-week range assertion where the partial week counts only days inside `[from, to]`;
- range crossing a DST transition in `America/New_York` produces correct local dates;
- foreign plan/workouts don't leak into another user's range.

**Commit:** `feat(plans): calendar range window with weekly adherence summary`

### Task S2: Week / Month / List overviews

**Files:** Modify `frontend/src/features/calendar/CalendarPage.tsx`, `api/client.ts`,
`api/types.ts`; create `frontend/src/features/calendar/{MonthGrid,CalendarList}.tsx`,
`frontend/src/lib/calendarRange.ts` (+ `calendarRange.test.ts`).

**Behavior:** spec §3. Toggle Week | Month | List (component state, default Week):
- Month: Monday-start grid for the selected month, cells show date + planned template abbreviation
  (`Rest` otherwise) + completion marker; today ring; tap → existing `DaySheet`; header shows the
  month's summed adherence from `weeks`.
- List: chronological rows for the selected range (week or month per current mode): date, planned
  template, actual workouts with name + volume (`/api/workouts?from&to`), completed/missed markers.
- Range fetching uses the S1 `from`/`to` params; month navigation computes bounds via
  `lib/datetime.ts`; no horizontal overflow at 375 px.

**Tests (pure logic):** month grid generation (first/last cell dates, Monday alignment, leading and
trailing blanks, month with 28/31 days, DST month), range bounds for week/month, month header
adherence summed from clipped `weeks`, and list merging of planned days with workout summaries
(missed detection, multiple workouts per day, Rest days, a workspace of >100 workouts proving the
`limit=500` request and client-side half-open `performed_at < to` filter). Verify with
`npm run typecheck && npm run lint && npm run test && npm run build`.

**Commit:** `feat(web): week, month, and list calendar overviews`

### Task S3: Inline template creation

**Files:** Create `frontend/src/features/calendar/TemplateQuickCreate.tsx`; modify `DaySheet.tsx`,
`PlanEditor.tsx`, `api/client.ts`, `api/types.ts`; pure helper
`frontend/src/features/calendar/quickTemplate.ts` (+ test).

**Behavior:** spec §4. Quick-create sheet with name, ordered exercise rows (reuse `ExercisePicker`
and `POST /api/exercises/resolve`), nullable targets; validation mirrors the backend and surfaces
409s. Entry points: `DaySheet` ("New template", only when an active plan exists, auto-assigns to
the tapped day after creation via the slots PATCH) and the plan editor empty state. If creation
succeeds but assignment fails, keep the template (no duplicate on retry), surface the assignment
error, and let the retry run only the slots PATCH. Invalidations: `templates`, `plans`, `calendar`.

**Tests:** helper builds the nested template payload correctly (order, null targets, trimming);
empty/invalid names rejected client-side; assignment payload builds the full seven-day slots array;
create-then-assign failure path does not re-create the template. Verify typecheck/lint/test/build.

**Commit:** `feat(web): create templates inline from the calendar`

### Task S4: Reschedule and missed-workout offer

**Files:** Modify `frontend/src/features/calendar/{DaySheet,CalendarPage}.tsx`,
`planSlots.ts` (+ tests); create
`frontend/src/features/calendar/MissedWorkoutsBanner.tsx` and `frontend/src/lib/missed.ts` (+ test).

**Behavior:** spec §5.
- Move/swap: DaySheet action (only when the day has a template) listing the other six days with
  what each will receive; confirm → PATCH the **complete seven-day slots array** with the two days
  exchanged (target day Rest included as a new entry), preserving all other days; server errors
  surfaced.
- Missed offer: always read the **current week's** calendar response (independent of the visible
  range); missed = `template_id != null`, `date < todayDateKey(user timezone)`, `completed ==
  false`; dismissible banner with count; sheet listing entries with Start (from-template) that
  logs today; dismissal persisted in `localStorage` under `tracker.missedDismissedDate` as the
  local date key; banner reappears on the next local day/week and after mutations.

**Tests:** `planSlots` swap helper (swap with Rest, swap two templates, self/absent cases, all
seven days preserved), missed-list computation (past only, uncompleted only, excludes today/future
and Rest), dismissal key uses the local date key. Verify typecheck/lint/test/build.

**Commit:** `feat(web): reschedule plan days and surface missed workouts`

### Task S5: Docs

- Append the Phase 2.1 section to `docs/architecture-decisions.md` (swap semantics, UI-only missed
  offer, range cap, no schema changes).
- Add one short bullet to `AGENTS.md` under Phase 2 additions: calendar modes, quick-create,
  move/swap, missed offer, `/api/calendar` range params.

**Commit:** `docs: record scheduling and overview decisions`

### Task S6: Final gate and push

1. Backend `uv run pytest -v && uv run ruff check .`; frontend
   `npm run typecheck && npm run lint && npm run test && npm run build`.
2. Dev-server/API smoke: calendar range for a month, quick-create + assign, swap, missed banner
   data (curl-level for the API; frontend via build + existing Playwright script if rerun).
3. Pre-push checks (three commands) reported; push once.
