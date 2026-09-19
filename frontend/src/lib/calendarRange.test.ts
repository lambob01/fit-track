import { describe, expect, it } from 'vitest'
import type { CalendarDay, WorkoutSummary } from '../api/types'
import {
  buildListDays,
  listWorkoutQuery,
  monthGrid,
  monthRange,
  periodRange,
  shiftPeriod,
  sumAdherence,
  weekRange,
  workoutsInRange,
} from './calendarRange'
import { formatDateKey } from './datetime'

const TZ = 'America/New_York'

function workout(id: string, performed_at: string, volume_kg = 100): WorkoutSummary {
  return {
    id,
    performed_at,
    name: null,
    template_id: null,
    exercise_count: 1,
    set_count: 3,
    volume_kg,
  }
}

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

describe('weekRange / monthRange / periodRange', () => {
  it('snaps any date to the local Monday-to-Sunday week', () => {
    expect(weekRange('2026-09-17')).toEqual({ from: '2026-09-14', to: '2026-09-20' })
    expect(weekRange('2026-09-14')).toEqual({ from: '2026-09-14', to: '2026-09-20' })
    expect(weekRange('2026-09-20')).toEqual({ from: '2026-09-14', to: '2026-09-20' })
  })

  it('covers the first and last day of the month', () => {
    expect(monthRange('2026-09-17')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(monthRange('2026-08-01')).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('handles February and leap-year boundaries', () => {
    expect(monthRange('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('keeps local date keys stable across a DST month', () => {
    expect(monthRange('2026-03-08')).toEqual({ from: '2026-03-01', to: '2026-03-31' })
    expect(monthRange('2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  })

  it('dispatches through periodRange', () => {
    expect(periodRange('week', '2026-09-17')).toEqual(weekRange('2026-09-17'))
    expect(periodRange('month', '2026-09-17')).toEqual(monthRange('2026-09-17'))
  })
})

describe('shiftPeriod', () => {
  it('steps weeks by seven days from the Monday', () => {
    expect(shiftPeriod('week', '2026-09-17', 1)).toBe('2026-09-21')
    expect(shiftPeriod('week', '2026-09-17', -1)).toBe('2026-09-07')
  })

  it('steps months from the first of the month across year boundaries', () => {
    expect(shiftPeriod('month', '2026-09-17', 1)).toBe('2026-10-01')
    expect(shiftPeriod('month', '2026-09-01', -1)).toBe('2026-08-01')
    expect(shiftPeriod('month', '2026-01-15', -1)).toBe('2025-12-01')
    expect(shiftPeriod('month', '2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('monthGrid', () => {
  it('pads a Tuesday-starting 30-day month to whole Monday weeks', () => {
    const cells = monthGrid('2026-09-17')

    expect(cells.length % 7).toBe(0)
    expect(cells.length).toBe(35)
    expect(cells[0]).toBeNull()
    expect(cells[1]).toBe('2026-09-01')
    expect(cells[30]).toBe('2026-09-30')
    expect(cells.slice(31)).toEqual([null, null, null, null])
    expect(cells.filter((cell) => cell !== null)).toHaveLength(30)
  })

  it('left-pads a Sunday-starting 28-day February', () => {
    const cells = monthGrid('2026-02-10')

    expect(cells.length).toBe(35)
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(cells[6]).toBe('2026-02-01')
    expect(cells[33]).toBe('2026-02-28')
    expect(cells[34]).toBeNull()
  })

  it('produces exactly four rows when a Monday-starting February aligns', () => {
    const cells = monthGrid('2027-02-10')

    expect(cells.length).toBe(28)
    expect(cells[0]).toBe('2027-02-01')
    expect(cells[27]).toBe('2027-02-28')
    expect(cells.every((cell) => cell !== null)).toBe(true)
  })

  it('fills six rows for a Saturday-starting 31-day month', () => {
    const cells = monthGrid('2026-08-15')

    expect(cells.length).toBe(42)
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, null])
    expect(cells[5]).toBe('2026-08-01')
    expect(cells[35]).toBe('2026-08-31')
  })

  it('keeps the DST transition day at its Monday-aligned position', () => {
    const cells = monthGrid('2026-03-10')

    expect(cells.length).toBe(42)
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(cells[6]).toBe('2026-03-01')
    expect(cells[13]).toBe('2026-03-08')
    expect(cells[36]).toBe('2026-03-31')
  })
})

describe('sumAdherence', () => {
  it('adds the clipped weekly entries', () => {
    expect(
      sumAdherence([
        { week_start: 'a', week_end: 'b', planned_days: 4, completed_days: 2 },
        { week_start: 'c', week_end: 'd', planned_days: 1, completed_days: 1 },
        { week_start: 'e', week_end: 'f', planned_days: 3, completed_days: 0 },
      ]),
    ).toEqual({ planned_days: 8, completed_days: 3 })
  })

  it('treats a missing week list as an empty sum', () => {
    expect(sumAdherence(null)).toEqual({ planned_days: 0, completed_days: 0 })
    expect(sumAdherence([])).toEqual({ planned_days: 0, completed_days: 0 })
  })
})

describe('listWorkoutQuery', () => {
  it('uses local midnights and a generous limit for a month', () => {
    expect(listWorkoutQuery('month', '2026-09-17', TZ)).toEqual({
      from: '2026-09-01T04:00:00.000Z',
      to: '2026-10-01T04:00:00.000Z',
      limit: 500,
    })
  })

  it('uses the local Monday-to-Monday bounds for a week', () => {
    expect(listWorkoutQuery('week', '2026-09-17', TZ)).toEqual({
      from: '2026-09-14T04:00:00.000Z',
      to: '2026-09-21T04:00:00.000Z',
      limit: 500,
    })
  })

  it('applies each side of a DST change to its own midnight', () => {
    expect(listWorkoutQuery('month', '2026-11-10', TZ)).toEqual({
      from: '2026-11-01T04:00:00.000Z',
      to: '2026-12-01T05:00:00.000Z',
      limit: 500,
    })
  })
})

describe('workoutsInRange', () => {
  const bounds = { from: '2026-09-14T04:00:00.000Z', to: '2026-09-21T04:00:00.000Z' }

  it('filters on a half-open interval so the inclusive API `to` does not leak', () => {
    const workouts = [
      workout('before', '2026-09-14T03:59:59.000Z'),
      workout('at-from', '2026-09-14T04:00:00.000Z'),
      workout('at-from-no-ms', '2026-09-14T04:00:00Z'),
      workout('before-to', '2026-09-21T03:59:59.999Z'),
      workout('at-to', '2026-09-21T04:00:00.000Z'),
      workout('after-to', '2026-09-21T04:00:01.000Z'),
    ]

    expect(workoutsInRange(workouts, bounds).map((item) => item.id)).toEqual([
      'at-from',
      'at-from-no-ms',
      'before-to',
    ])
  })
})

describe('buildListDays', () => {
  const bounds = { from: '2026-09-14T04:00:00.000Z', to: '2026-09-21T04:00:00.000Z' }
  const today = '2026-09-17'
  const days = [
    day('2026-09-14', {
      template_id: 't1',
      template_name: 'Upper A',
      completed: true,
      workout_ids: ['w1'],
    }),
    day('2026-09-15'),
    day('2026-09-16', { template_id: 't2', template_name: 'Lower' }),
    day('2026-09-17', { template_id: 't2', template_name: 'Lower' }),
    day('2026-09-18'),
    day('2026-09-19'),
    day('2026-09-20'),
  ]

  it('merges planned days and workouts oldest first', () => {
    const rows = buildListDays(
      days,
      [
        workout('w1', '2026-09-14T06:30:00Z', 1200),
        workout('w2', '2026-09-18T22:00:00Z', 800),
        workout('w3', '2026-09-19T13:00:00Z', 300),
        workout('w4', '2026-09-19T15:00:00Z', 500),
        workout('outside', '2026-09-21T04:00:00.000Z', 999),
      ],
      bounds,
      TZ,
      today,
    )

    expect(rows.map((row) => row.date)).toEqual(days.map((item) => item.date))
    expect(rows[0].template_name).toBe('Upper A')
    expect(rows[0].completed).toBe(true)
    expect(rows[0].missed).toBe(false)
    expect(rows[0].workouts.map((item) => item.id)).toEqual(['w1'])

    expect(rows[1].template_name).toBeNull()
    expect(rows[1].workouts).toEqual([])

    expect(rows[2].template_id).toBe('t2')
    expect(rows[2].completed).toBe(false)
    expect(rows[2].missed).toBe(true)

    expect(rows[3].missed).toBe(false)

    expect(rows[4].template_name).toBeNull()
    expect(rows[4].workouts.map((item) => item.id)).toEqual(['w2'])

    expect(rows[5].workouts.map((item) => item.id)).toEqual(['w3', 'w4'])

    const total = rows.reduce((sum, row) => sum + row.workouts.length, 0)
    expect(total).toBe(4)
  })

  it('orders rows defensively when the calendar days arrive shuffled', () => {
    const shuffled = [days[2], days[0], days[1]]
    const rows = buildListDays(shuffled, [], bounds, TZ, today)

    expect(rows.map((row) => row.date)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16'])
  })

  it('buckets workouts by local date, not UTC date', () => {
    const late = workout('late', '2026-09-19T02:30:00Z', 400)
    const rows = buildListDays(days, [late], bounds, TZ, today)

    expect(rows[4].date).toBe('2026-09-18')
    expect(rows[4].workouts.map((item) => item.id)).toEqual(['late'])
  })

  it('keeps a >100-workout month while the fetch limit stays at 500', () => {
    const query = listWorkoutQuery('month', '2026-09-15', TZ)
    expect(query.limit).toBe(500)

    const monthDays = Array.from({ length: 30 }, (_, index) =>
      day(`2026-09-${String(index + 1).padStart(2, '0')}`),
    )
    const workouts = Array.from({ length: 150 }, (_, index) => {
      const date = String(Math.floor(index / 5) + 1).padStart(2, '0')
      return workout(`w${index}`, `2026-09-${date}T12:00:00.000Z`)
    })

    const rows = buildListDays(monthDays, workouts, query, TZ, today)

    expect(rows).toHaveLength(30)
    expect(rows.reduce((sum, row) => sum + row.workouts.length, 0)).toBe(150)
    expect(rows[0].workouts).toHaveLength(5)
  })
})

describe('formatting the selected period', () => {
  it('derives month and range titles from date keys', () => {
    expect(formatDateKey(monthRange('2026-02-10').from, 'MMMM yyyy')).toBe('February 2026')
    expect(
      `${formatDateKey(weekRange('2026-09-17').from, 'MMM d')} – ${formatDateKey(
        weekRange('2026-09-17').to,
        'MMM d, yyyy',
      )}`,
    ).toBe('Sep 14 – Sep 20, 2026')
  })
})
