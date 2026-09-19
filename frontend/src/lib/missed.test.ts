import { describe, expect, it } from 'vitest'
import type { CalendarDay } from '../api/types'
import {
  MISSED_DISMISSED_KEY,
  isMissedDismissed,
  missedWorkouts,
  readMissedDismissal,
  writeMissedDismissal,
  type KeyValueStore,
} from './missed'

const TODAY = '2026-09-17'

function day(date: string, overrides: Partial<CalendarDay> = {}): CalendarDay {
  return {
    date,
    day_of_week: 0,
    template_id: null,
    template_name: null,
    completed: false,
    workout_ids: [],
    ...overrides,
  }
}

function planned(date: string, templateId: string, overrides: Partial<CalendarDay> = {}) {
  return day(date, { template_id: templateId, template_name: templateId, ...overrides })
}

function fakeStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))

  return {
    values,
    getItem(key: string): string | null {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      values.set(key, value)
    },
  }
}

describe('missedWorkouts', () => {
  it('keeps only uncompleted planned days before today', () => {
    const days = [
      planned('2026-09-15', 'push'),
      planned('2026-09-16', 'pull', { completed: true }),
      planned('2026-09-17', 'legs'),
      planned('2026-09-18', 'upper'),
      day('2026-09-14'),
    ]

    expect(missedWorkouts(days, TODAY)).toEqual([
      { date: '2026-09-15', day_of_week: 0, template_id: 'push', template_name: 'push' },
    ])
  })

  it('excludes today and future planned days', () => {
    const days = [
      planned('2026-09-17', 'today'),
      planned('2026-09-18', 'future'),
      planned('2026-09-20', 'future'),
    ]

    expect(missedWorkouts(days, TODAY)).toEqual([])
  })

  it('excludes Rest days even when they are in the past and uncompleted', () => {
    const days = [day('2026-09-10'), day('2026-09-11', { completed: false })]

    expect(missedWorkouts(days, TODAY)).toEqual([])
  })

  it('returns entries oldest first with their calendar fields', () => {
    const days = [
      planned('2026-09-16', 'pull', { day_of_week: 2, template_name: 'Pull Day A' }),
      planned('2026-09-14', 'push', { day_of_week: 0, template_name: 'Push Day A' }),
    ]

    expect(missedWorkouts(days, TODAY)).toEqual([
      { date: '2026-09-14', day_of_week: 0, template_id: 'push', template_name: 'Push Day A' },
      { date: '2026-09-16', day_of_week: 2, template_id: 'pull', template_name: 'Pull Day A' },
    ])
  })
})

describe('missed dismissal date key', () => {
  it('hides the banner only for the local day that was dismissed', () => {
    expect(isMissedDismissed(null, TODAY)).toBe(false)
    expect(isMissedDismissed('2026-09-16', TODAY)).toBe(false)
    expect(isMissedDismissed(TODAY, TODAY)).toBe(true)
  })

  it('reappears on the next local day', () => {
    expect(isMissedDismissed(TODAY, '2026-09-18')).toBe(false)
  })

  it('writes the supplied local date key under the tracker key', () => {
    const store = fakeStore()

    writeMissedDismissal(TODAY, store)

    expect(store.values.get(MISSED_DISMISSED_KEY)).toBe(TODAY)
    expect(readMissedDismissal(store)).toBe(TODAY)
  })

  it('reads a previously stored dismissal', () => {
    const store = fakeStore({ [MISSED_DISMISSED_KEY]: '2026-09-15' })

    expect(readMissedDismissal(store)).toBe('2026-09-15')
  })

  it('treats unavailable storage as no dismissal', () => {
    const throwing: KeyValueStore = {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
    }

    expect(readMissedDismissal(null)).toBeNull()
    expect(readMissedDismissal(throwing)).toBeNull()
    expect(() => writeMissedDismissal(TODAY, throwing)).not.toThrow()
  })
})
