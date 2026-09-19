# Scheduling Flexibility & Overviews — Phase 2.1 Design (Additive)

- **Date:** 2026-09-19
- **Base:** Phase 2 spec (`2026-09-19-phase2-design.md`) and MVP spec. Deltas only; anything not
  restated follows those documents.
- **No schema changes.** Plans, slots, templates, and workouts already carry everything needed.

## 1. Scope

1. **Inline template creation** from the calendar (write what you want without leaving the view).
2. **Manual move/swap** of planned days plus a **bounded missed-workout offer** (current week,
   UI-only).
3. **Week / Month / List overview** with a toggle, backed by a calendar range API.

### Explicit non-goals

- Multi-week periodized program builder.
- Unbounded automatic carry-over / schedule shifting.
- Cross-week rescheduling (the plan is a repeating 7-day cycle; moves stay inside it).
- Free-text/label plan days; plan slots remain template-backed or Rest.
- Changes to adherence semantics (planned = slot with a template; completed = any workout on that
  local date).

## 2. Calendar range API

`GET /api/calendar` gains optional date params `from` and `to`:

- Supplied **together** (one-sided → 422), `from <= to` (else 422), span ≤ **62 dates**
  (predicate: `(to - from).days <= 61`, else 422). Passing `week_start` together with `from`/`to`
  is a 422.
- When supplied, `days` covers `[from, to]` inclusive using the existing `CalendarDay` shape.
  Range mode keeps the same top-level keys with these defined values: `week_start` / `week_end`
  are the UTC instants of local midnight of `from` and of `to + 1 day` (end-exclusive); `plan` is
  the active plan or `null`; `adherence` is the range-wide sum; `days` as above; plus
  `weeks: [{week_start, week_end, planned_days, completed_days}]` — one entry per ISO week
  intersecting the range, with **counts clipped to `[from, to]`** (so a mid-week range does not
  overcount), and week bounds as UTC instants of local midnight (end-exclusive).
- When absent, the existing `week_start` behavior (default: current ISO week) is unchanged,
  including `plan`, `week_start`, `week_end`, `days`, and `adherence` — and `weeks` is `null`.
- Timezone rules unchanged: day boundaries and ISO weeks are computed in the user's timezone;
  `week_start`/`week_end` are UTC instants of local midnight, end-exclusive.

## 3. Frontend — calendar modes

A **Week | Month | List** toggle on the calendar (component state; default Week). The selected
period drives all three views.

- **Week:** the existing 7-row week view and navigation.
- **Month:** Monday-start grid for the selected month. Each cell shows the date, the planned
  template name (abbreviated) or “Rest”, and a completion marker; today gets a ring; tapping a
  cell opens the existing `DaySheet`. The header shows the month’s adherence
  (`X/Y planned`) summed from the clipped `weeks` entries (or equivalently from `days`).
- **List:** chronological rows for the selected period (week or month, matching the current
  selection), oldest → newest: date, planned template (or Rest), any actual workouts with name and
  session volume, and the completed marker. Workout data comes from
  `GET /api/workouts?from&to&limit=500` using **generous** bounds (`from` = local midnight of the
  first day, `to` = local midnight of the day after the last) and a client-side half-open filter
  (`performed_at < to`), because the workouts endpoint treats `to` as inclusive and defaults to
  100 rows. Ranges here are at most 62 days, so 500 is ample. Planned days with no workout on a
  past date are marked “missed” (same rule as §5).

## 4. Inline template creation

`TemplateQuickCreate` bottom sheet:

- Fields: name, ordered exercise rows (reusing `ExercisePicker` and inline resolve), nullable
  target sets/reps/weight. Validation mirrors `POST /api/templates`; duplicate name → 409 surfaced.
- Entry points: `DaySheet` (“New template”, only shown when an active plan exists) and the plan
  editor’s empty state (“Create a template” instead of only navigating away).
- Opened from `DaySheet`, a successful create immediately assigns the new template to that day via
  the existing plan slots PATCH (full-replace, all seven days). If creation succeeds but the
  assignment PATCH fails, the template is **kept** (no duplicate on retry), the assignment error is
  surfaced, and a retry performs only the slots PATCH. Invalidations: `templates`, `plans`,
  `calendar`.

## 5. Reschedule and missed-workout offer

- **Move = swap.** `DaySheet` gains a “Move / swap day” action when the day has a template. It
  lists the other six days showing what each will receive; confirming sends the **complete
  seven-day slots array** for the active plan (the Phase 2 PATCH is full-replace) with the two
  `day_of_week` entries exchanged — including when the target day has no slot row (Rest). All
  other days are preserved. Server errors are surfaced. Cross-week moves are not offered.
- **Missed offer (bounded, current week, UI-only).** The offer always reads the **current week’s**
  calendar response regardless of the visible range: missed = `template_id != null`,
  `date < todayDateKey(user timezone)`, `completed == false`. A dismissible banner (“N missed
  workout(s) this week”) opens a sheet listing them; each has a **Start** action using the existing
  from-template endpoint, which logs the workout today. The plan and adherence are **not**
  modified. Dismissal is stored in `localStorage` under `tracker.missedDismissedDate` as the
  current local date key; the banner reappears on the next local day and after the week rolls over,
  and items disappear as they become completed. No timezone-naive date math.

## 6. Decisions log (added)

| Decision | Rationale |
|---|---|
| Move swaps rather than overwrites | Prevents silent loss of the target day’s template; the confirm copy shows the trade |
| Missed offer is UI-only | Keeps the schedule deterministic and adherence factual; no permanent drift |
| Range cap of 62 days | Bounds response size; comfortably fits a month grid |
| List merges planned + actual | The useful review surface on a phone; reuses the existing workouts API |
| No schema changes | Existing slots/templates/workouts already cover all three features |
