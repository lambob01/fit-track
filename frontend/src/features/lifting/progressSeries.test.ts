import { describe, expect, it } from 'vitest'
import type { ProgressSession } from '../../api/types'
import {
  buildProgressData,
  buildProgressYDomain,
  hasWeightedSessions,
  progressSeriesValue,
} from './progressSeries'

function session(overrides: Partial<ProgressSession> = {}): ProgressSession {
  return {
    workout_id: 'w1',
    performed_at: '2026-09-01T10:00:00Z',
    top_set_kg: 100,
    e1rm_kg: 110,
    volume_kg: 1000,
    reps_volume: 20,
    ...overrides,
  }
}

describe('hasWeightedSessions', () => {
  it('is false when every session has no weighted set', () => {
    expect(
      hasWeightedSessions([
        session({ top_set_kg: null, e1rm_kg: null, volume_kg: 0 }),
        session({ top_set_kg: null, e1rm_kg: null, volume_kg: 0 }),
      ]),
    ).toBe(false)
  })

  it('is true when any session has a weighted set', () => {
    expect(
      hasWeightedSessions([session({ top_set_kg: null }), session({ top_set_kg: 60 })]),
    ).toBe(true)
  })
})

describe('progressSeriesValue', () => {
  it('maps each series key, including nulls', () => {
    const entry = session({ top_set_kg: null, e1rm_kg: 88.5 })
    expect(progressSeriesValue(entry, 'top_set')).toBeNull()
    expect(progressSeriesValue(entry, 'e1rm')).toBe(88.5)
    expect(progressSeriesValue(entry, 'volume')).toBe(1000)
    expect(progressSeriesValue(entry, 'reps_volume')).toBe(20)
  })
})

describe('buildProgressData', () => {
  it('uses the reps series and sorts by timestamp', () => {
    const data = buildProgressData(
      [
        session({ workout_id: 'b', performed_at: '2026-09-03T10:00:00Z', reps_volume: 30 }),
        session({ workout_id: 'a', performed_at: '2026-09-01T10:00:00Z', reps_volume: 18 }),
      ],
      'reps_volume',
    )

    expect(data.map((point) => point.value)).toEqual([18, 30])
    expect(data[0].ts).toBeLessThan(data[1].ts)
  })
})

describe('buildProgressYDomain', () => {
  it('returns undefined without numeric values', () => {
    expect(buildProgressYDomain([{ ts: 1, value: null }])).toBeUndefined()
  })

  it('pads a single value', () => {
    expect(buildProgressYDomain([{ ts: 1, value: 100 }])).toEqual([90, 110])
  })

  it('never drops below zero', () => {
    expect(buildProgressYDomain([{ ts: 1, value: 0.5 }])).toEqual([0, 1.5])
  })
})
