import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDaysToDateKey,
  dateKeyToTimestamp,
  formatDateKey,
  formatLocal,
  fromLocalDateTimeInput,
  localDateKey,
  localMonthEndTs,
  localWeekRange,
  mondayOfDateKey,
  toLocalDateTimeInput,
  todayDateKey,
} from './datetime'

describe('datetime', () => {
  it('formats a UTC instant in the user timezone', () => {
    expect(formatLocal('2026-01-04T23:30:00Z', 'Europe/London', 'yyyy-MM-dd HH:mm')).toBe(
      '2026-01-04 23:30',
    )
  })

  it('crosses a date boundary when the timezone requires it', () => {
    expect(localDateKey('2026-01-05T01:00:00Z', 'America/New_York')).toBe('2026-01-04')
  })
})

describe('datetime-local input conversion', () => {
  it('renders a UTC instant as local wall time', () => {
    expect(toLocalDateTimeInput('2026-09-18T21:30:00Z', 'America/New_York')).toBe(
      '2026-09-18T17:30',
    )
  })

  it('parses local wall time back to a UTC ISO instant', () => {
    expect(fromLocalDateTimeInput('2026-09-18T17:30', 'America/New_York')).toBe(
      '2026-09-18T21:30:00.000Z',
    )
  })

  it('round-trips through the local representation', () => {
    const iso = '2026-01-04T23:30:00.000Z'

    expect(
      fromLocalDateTimeInput(toLocalDateTimeInput(iso, 'Europe/London'), 'Europe/London'),
    ).toBe(iso)
  })
})

describe('calendar date keys', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("resolves today's date in the user timezone", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T02:00:00Z'))

    expect(todayDateKey('America/New_York')).toBe('2026-09-18')
    expect(todayDateKey('UTC')).toBe('2026-09-19')
  })

  it('adds days across month and year boundaries', () => {
    expect(addDaysToDateKey('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysToDateKey('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('snaps any day of the week to Monday', () => {
    expect(mondayOfDateKey('2026-09-14')).toBe('2026-09-14')
    expect(mondayOfDateKey('2026-09-17')).toBe('2026-09-14')
    expect(mondayOfDateKey('2026-09-19')).toBe('2026-09-14')
    expect(mondayOfDateKey('2026-09-20')).toBe('2026-09-14')
  })

  it('formats a date key without timezone conversion', () => {
    expect(formatDateKey('2026-09-19', 'EEE MMM d')).toBe('Sat Sep 19')
  })

  it('anchors a date key at local midday in the user timezone', () => {
    for (const timezone of ['UTC', 'America/New_York', 'Pacific/Auckland']) {
      const instant = new Date(dateKeyToTimestamp('2026-01-05', timezone)).toISOString()
      expect(formatLocal(instant, timezone, 'yyyy-MM-dd HH:mm')).toBe('2026-01-05 12:00')
    }
  })
})

describe('localMonthEndTs', () => {
  it('returns the last instant of the month in UTC', () => {
    expect(localMonthEndTs('UTC', new Date('2026-09-19T12:00:00Z'))).toBe(
      Date.parse('2026-09-30T23:59:59.999Z'),
    )
  })

  it('converts the local month end for a non-UTC timezone', () => {
    expect(localMonthEndTs('Asia/Tokyo', new Date('2026-09-19T12:00:00Z'))).toBe(
      Date.parse('2026-09-30T14:59:59.999Z'),
    )
  })

  it('uses the local month even when it differs from the UTC month', () => {
    const now = new Date('2026-10-01T02:00:00Z')
    const endTs = localMonthEndTs('America/New_York', now)

    expect(endTs).toBe(Date.parse('2026-10-01T03:59:59.999Z'))
    expect(
      formatLocal(new Date(endTs).toISOString(), 'America/New_York', 'yyyy-MM-dd HH:mm:ss.SSS'),
    ).toBe('2026-09-30 23:59:59.999')
  })
})

describe('localWeekRange', () => {
  it('returns the local Monday-to-Monday range as UTC instants', () => {
    expect(localWeekRange('2026-09-19', 'UTC')).toEqual({
      from: '2026-09-14T00:00:00.000Z',
      to: '2026-09-21T00:00:00.000Z',
    })
  })

  it('converts local midnight using the timezone offset', () => {
    expect(localWeekRange('2026-09-19', 'America/New_York')).toEqual({
      from: '2026-09-14T04:00:00.000Z',
      to: '2026-09-21T04:00:00.000Z',
    })
  })

  it('handles a DST transition inside the week', () => {
    expect(localWeekRange('2026-03-08', 'America/New_York')).toEqual({
      from: '2026-03-02T05:00:00.000Z',
      to: '2026-03-09T04:00:00.000Z',
    })
  })

  it('handles a DST transition in the southern hemisphere', () => {
    expect(localWeekRange('2026-04-05', 'Pacific/Auckland')).toEqual({
      from: '2026-03-29T11:00:00.000Z',
      to: '2026-04-05T12:00:00.000Z',
    })
  })

  it('returns the same week for a Monday input', () => {
    expect(localWeekRange('2026-09-14', 'UTC')).toEqual(
      localWeekRange('2026-09-20', 'UTC'),
    )
  })
})
