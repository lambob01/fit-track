import { describe, expect, it } from 'vitest'
import { fromZonedTime } from 'date-fns-tz'
import { getPresetRange, inferPreset, RANGE_PRESET_KEYS, type DateRange } from './dateRange'

const TZ = 'America/New_York'

describe('getPresetRange', () => {
  it('starts 7d at local midnight six days back', () => {
    const now = new Date('2026-09-18T17:30:00Z')

    const range = getPresetRange('7d', TZ, now)

    expect(range).toEqual({
      from: '2026-09-12T04:00:00.000Z',
      to: '2026-09-18T17:30:00.000Z',
    })
  })

  it('starts 30d at local midnight twenty-nine days back', () => {
    const now = new Date('2026-09-18T17:30:00Z')

    expect(getPresetRange('30d', TZ, now).from).toBe('2026-08-20T04:00:00.000Z')
  })

  it('uses the correct DST offset for 90d windows that cross a change', () => {
    const now = new Date('2026-11-10T12:00:00Z')

    expect(getPresetRange('90d', TZ, now).from).toBe('2026-08-13T04:00:00.000Z')
  })

  it('starts 1y at local midnight one calendar year back', () => {
    const now = new Date('2026-09-18T17:30:00Z')

    expect(getPresetRange('1y', TZ, now).from).toBe('2025-09-18T04:00:00.000Z')
  })

  it('uses the epoch for all', () => {
    const now = new Date('2026-09-18T17:30:00Z')

    expect(getPresetRange('all', TZ, now)).toEqual({
      from: '1970-01-01T00:00:00.000Z',
      to: '2026-09-18T17:30:00.000Z',
    })
  })
})

describe('inferPreset', () => {
  it('round-trips every preset range', () => {
    const now = new Date('2026-09-18T17:30:00Z')

    for (const preset of RANGE_PRESET_KEYS) {
      expect(inferPreset(getPresetRange(preset, TZ, now), TZ, now)).toBe(preset)
    }
  })

  it('falls back to custom for an arbitrary range', () => {
    const now = new Date('2026-09-18T17:30:00Z')
    const value: DateRange = { from: '2026-09-01T00:00:00.000Z', to: now.toISOString() }

    expect(inferPreset(value, TZ, now)).toBe('custom')
  })
})

describe('custom date boundaries', () => {
  it('converts a local calendar day to UTC ISO at start/end of day', () => {
    expect(fromZonedTime('2026-09-12T00:00:00', TZ).toISOString()).toBe(
      '2026-09-12T04:00:00.000Z',
    )
    expect(fromZonedTime('2026-09-12T23:59:59.999', TZ).toISOString()).toBe(
      '2026-09-13T03:59:59.999Z',
    )
  })
})
