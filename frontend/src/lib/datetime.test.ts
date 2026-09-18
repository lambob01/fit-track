import { describe, expect, it } from 'vitest'
import {
  formatLocal,
  fromLocalDateTimeInput,
  localDateKey,
  toLocalDateTimeInput,
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
