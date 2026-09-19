import { describe, expect, it } from 'vitest'
import {
  formatSplitPace,
  inferSplitDistances,
  paceSecondsPerKm,
  splitRowDistances,
  SPLIT_SEGMENT_M,
} from './pace'

describe('paceSecondsPerKm', () => {
  it('computes seconds per kilometer', () => {
    expect(paceSecondsPerKm(5000, 1500)).toBe(300)
    expect(paceSecondsPerKm(1000, 330)).toBe(330)
  })

  it('returns null without a positive distance', () => {
    expect(paceSecondsPerKm(null, 1500)).toBeNull()
    expect(paceSecondsPerKm(0, 1500)).toBeNull()
    expect(paceSecondsPerKm(-100, 1500)).toBeNull()
  })

  it('returns null without a positive duration', () => {
    expect(paceSecondsPerKm(5000, 0)).toBeNull()
    expect(paceSecondsPerKm(5000, null)).toBeNull()
  })
})

describe('formatSplitPace', () => {
  it('formats metric pace as min:sec per kilometer', () => {
    expect(formatSplitPace(1000, 300, 'metric')).toBe('5:00 /km')
  })

  it('formats imperial pace as min:sec per mile', () => {
    expect(formatSplitPace(1000, 300, 'imperial')).toBe('8:03 /mi')
  })

  it('returns null when a split cannot be paced', () => {
    expect(formatSplitPace(null, 300, 'metric')).toBeNull()
    expect(formatSplitPace(1000, 0, 'metric')).toBeNull()
  })
})

describe('inferSplitDistances', () => {
  it('splits an exact multiple of a kilometer evenly', () => {
    expect(inferSplitDistances(5000)).toEqual([
      SPLIT_SEGMENT_M,
      SPLIT_SEGMENT_M,
      SPLIT_SEGMENT_M,
      SPLIT_SEGMENT_M,
      SPLIT_SEGMENT_M,
    ])
  })

  it('keeps the remainder as the final segment', () => {
    expect(inferSplitDistances(5210)).toEqual([1000, 1000, 1000, 1000, 1000, 210])
  })

  it('returns a single segment for a distance under a kilometer', () => {
    expect(inferSplitDistances(800)).toEqual([800])
  })

  it('returns no segments without a positive distance', () => {
    expect(inferSplitDistances(null)).toEqual([])
    expect(inferSplitDistances(0)).toEqual([])
  })
})

describe('splitRowDistances', () => {
  it('merges an imperial remainder that would display as 0.00 mi', () => {
    expect(splitRowDistances(5005.05984, 'imperial')).toEqual([0.62, 0.62, 0.62, 0.62, 0.62])
  })

  it('keeps a meaningful imperial remainder as its own row', () => {
    expect(splitRowDistances(5210, 'imperial')).toEqual([0.62, 0.62, 0.62, 0.62, 0.62, 0.13])
  })

  it('merges a metric remainder that would display as 0.00 km', () => {
    expect(splitRowDistances(5002, 'metric')).toEqual([1, 1, 1, 1, 1])
  })

  it('keeps a meaningful metric remainder as its own row', () => {
    expect(splitRowDistances(5210, 'metric')).toEqual([1, 1, 1, 1, 1, 0.21])
  })

  it('returns no rows when no segment survives display rounding', () => {
    expect(splitRowDistances(3, 'metric')).toEqual([])
    expect(splitRowDistances(null, 'imperial')).toEqual([])
  })
})
