import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDaysToDateKey,
  formatDateKey,
  formatLocal,
  fromLocalDateTimeInput,
  localDateKey,
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
})
