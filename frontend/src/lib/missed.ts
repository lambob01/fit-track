import type { CalendarDay } from '../api/types'

export const MISSED_DISMISSED_KEY = 'tracker.missedDismissedDate'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface MissedWorkout {
  date: string
  day_of_week: number
  template_id: string
  template_name: string | null
}

export function missedWorkouts(days: CalendarDay[], today: string): MissedWorkout[] {
  return days
    .filter(
      (day): day is CalendarDay & { template_id: string } =>
        day.template_id !== null && !day.completed && day.date < today,
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((day) => ({
      date: day.date,
      day_of_week: day.day_of_week,
      template_id: day.template_id,
      template_name: day.template_name,
    }))
}

export function isMissedDismissed(dismissedDate: string | null, today: string): boolean {
  return dismissedDate === today
}

function browserStore(): KeyValueStore | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readMissedDismissal(store: KeyValueStore | null = browserStore()): string | null {
  if (store === null) {
    return null
  }
  try {
    return store.getItem(MISSED_DISMISSED_KEY)
  } catch {
    return null
  }
}

export function writeMissedDismissal(
  dateKey: string,
  store: KeyValueStore | null = browserStore(),
): void {
  if (store === null) {
    return
  }
  try {
    store.setItem(MISSED_DISMISSED_KEY, dateKey)
  } catch {
    return
  }
}
