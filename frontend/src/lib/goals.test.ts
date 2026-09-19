import { describe, expect, it } from 'vitest'
import { DAY_MS, projectWeight, requiredRatePerWeek } from './goals'

describe('requiredRatePerWeek', () => {
  it('returns the negative weekly change needed to hit a cut target', () => {
    expect(requiredRatePerWeek(80, 78, '2026-06-15', '2026-06-01')).toBeCloseTo(-1, 6)
  })

  it('returns a positive weekly change for a gain target', () => {
    expect(requiredRatePerWeek(70, 75, '2026-06-29', '2026-06-01')).toBeCloseTo(1.25, 6)
  })

  it('returns expired when the target date is today or in the past', () => {
    expect(requiredRatePerWeek(80, 78, '2026-06-01', '2026-06-01')).toBe('expired')
    expect(requiredRatePerWeek(80, 78, '2026-05-31', '2026-06-01')).toBe('expired')
  })

  it('returns null when an input is missing', () => {
    expect(requiredRatePerWeek(null, 78, '2026-06-15', '2026-06-01')).toBeNull()
    expect(requiredRatePerWeek(80, null, '2026-06-15', '2026-06-01')).toBeNull()
    expect(requiredRatePerWeek(80, 78, null, '2026-06-01')).toBeNull()
  })
})

describe('projectWeight', () => {
  it('interpolates weekly points and ends exactly on the end date', () => {
    const start = Date.UTC(2026, 0, 1)
    const end = start + 14 * DAY_MS
    const points = projectWeight(start, end, 80, -0.1)

    expect(points.map((point) => point.ts)).toEqual([start, start + 7 * DAY_MS, end])
    expect(points[0].value).toBeCloseTo(80, 6)
    expect(points[1].value).toBeCloseTo(79.3, 6)
    expect(points[2].value).toBeCloseTo(78.6, 6)
  })

  it('returns a single point when the range is not positive', () => {
    const start = Date.UTC(2026, 0, 1)
    expect(projectWeight(start, start, 80, -0.1)).toEqual([{ ts: start, value: 80 }])
  })
})
