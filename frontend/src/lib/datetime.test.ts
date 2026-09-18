import { describe, expect, it } from 'vitest'
import { formatLocal, localDateKey } from './datetime'

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
