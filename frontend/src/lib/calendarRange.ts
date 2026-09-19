import type { CalendarAdherence, CalendarDay, CalendarWeekSection, WorkoutSummary } from '../api/types'
import {
  addDaysToDateKey,
  addMonthsToDateKey,
  localDateKey,
  localMidnightIso,
  mondayIndex,
  mondayOfDateKey,
  monthEndDateKey,
  monthStartDateKey,
} from './datetime'

export type CalendarMode = 'week' | 'month' | 'list'

export type CalendarPeriod = 'week' | 'month'

export interface DateKeyRange {
  from: string
  to: string
}

export interface InstantBounds {
  from: string
  to: string
}

export interface WorkoutListQuery extends InstantBounds {
  limit: number
}

export interface CalendarListDay {
  date: string
  template_id: string | null
  template_name: string | null
  completed: boolean
  missed: boolean
  workouts: WorkoutSummary[]
}

export const LIST_WORKOUT_LIMIT = 500

export function weekRange(dateKey: string): DateKeyRange {
  const from = mondayOfDateKey(dateKey)
  return { from, to: addDaysToDateKey(from, 6) }
}

export function monthRange(dateKey: string): DateKeyRange {
  return { from: monthStartDateKey(dateKey), to: monthEndDateKey(dateKey) }
}

export function periodRange(period: CalendarPeriod, dateKey: string): DateKeyRange {
  return period === 'month' ? monthRange(dateKey) : weekRange(dateKey)
}

export function shiftPeriod(period: CalendarPeriod, dateKey: string, delta: number): string {
  if (period === 'month') {
    return addMonthsToDateKey(monthStartDateKey(dateKey), delta)
  }
  return addDaysToDateKey(mondayOfDateKey(dateKey), delta * 7)
}

export function monthGrid(dateKey: string): (string | null)[] {
  const first = monthStartDateKey(dateKey)
  const last = monthEndDateKey(dateKey)
  const cells: (string | null)[] = []

  for (let blank = 0; blank < mondayIndex(first); blank += 1) {
    cells.push(null)
  }
  for (let cursor = first; cursor <= last; cursor = addDaysToDateKey(cursor, 1)) {
    cells.push(cursor)
  }
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

export function sumAdherence(weeks: CalendarWeekSection[] | null): CalendarAdherence {
  let planned_days = 0
  let completed_days = 0

  for (const week of weeks ?? []) {
    planned_days += week.planned_days
    completed_days += week.completed_days
  }

  return { planned_days, completed_days }
}

export function listWorkoutQuery(
  period: CalendarPeriod,
  dateKey: string,
  timezone: string,
): WorkoutListQuery {
  const range = periodRange(period, dateKey)

  return {
    from: localMidnightIso(range.from, timezone),
    to: localMidnightIso(addDaysToDateKey(range.to, 1), timezone),
    limit: LIST_WORKOUT_LIMIT,
  }
}

export function workoutsInRange(
  workouts: WorkoutSummary[],
  bounds: InstantBounds,
): WorkoutSummary[] {
  const from = Date.parse(bounds.from)
  const to = Date.parse(bounds.to)

  return workouts.filter((workout) => {
    const performed = Date.parse(workout.performed_at)
    return performed >= from && performed < to
  })
}

export function buildListDays(
  days: CalendarDay[],
  workouts: WorkoutSummary[],
  bounds: InstantBounds,
  timezone: string,
  today: string,
): CalendarListDay[] {
  const workoutsByDate = new Map<string, WorkoutSummary[]>()

  for (const workout of workoutsInRange(workouts, bounds)) {
    const date = localDateKey(workout.performed_at, timezone)
    const existing = workoutsByDate.get(date)
    if (existing === undefined) {
      workoutsByDate.set(date, [workout])
    } else {
      existing.push(workout)
    }
  }

  return [...days]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((day) => {
      const dayWorkouts = (workoutsByDate.get(day.date) ?? []).sort((a, b) =>
        a.performed_at < b.performed_at ? -1 : a.performed_at > b.performed_at ? 1 : 0,
      )

      return {
        date: day.date,
        template_id: day.template_id,
        template_name: day.template_name,
        completed: day.completed,
        missed: day.template_id !== null && !day.completed && day.date < today,
        workouts: dayWorkouts,
      }
    })
}
