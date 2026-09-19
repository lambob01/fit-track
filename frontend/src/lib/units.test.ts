import { describe, expect, it } from 'vitest'
import {
  cmToIn,
  distanceForDisplay,
  distanceToMeters,
  formatWeightRate,
  ftToM,
  inToCm,
  kgToLb,
  lbToKg,
  miToM,
  mToFt,
  mToMi,
  weightStep,
} from './units'

const roundTrips = [
  ['kg↔lb', kgToLb, lbToKg, 80],
  ['m↔mi', mToMi, miToM, 10000],
  ['m↔ft', mToFt, ftToM, 100],
  ['cm↔in', cmToIn, inToCm, 90],
] as const

describe('unit round trips', () => {
  it.each(roundTrips)('%s returns the original value', (_name, to, from, value) => {
    expect(from(to(value))).toBeCloseTo(value, 6)
  })
})

describe('formatWeightRate', () => {
  it('formats a negative metric rate with a minus sign', () => {
    expect(formatWeightRate(-0.42, 'metric')).toBe('−0.42 kg/week')
  })

  it('formats a positive rate with a plus sign', () => {
    expect(formatWeightRate(0.5, 'metric')).toBe('+0.5 kg/week')
  })

  it('converts to pounds and trims trailing zeros', () => {
    expect(formatWeightRate(-0.42, 'imperial')).toBe('−0.93 lb/week')
  })

  it('supports a monthly period', () => {
    expect(formatWeightRate(-1.5, 'metric', 'month')).toBe('−1.5 kg/month')
  })

  it('formats zero without a sign', () => {
    expect(formatWeightRate(0, 'metric')).toBe('0 kg/week')
  })
})

describe('distance display helpers', () => {
  it('formats meters into metric and imperial display values', () => {
    expect(distanceForDisplay(5000, 'metric')).toBe(5)
    expect(distanceForDisplay(5000, 'imperial')).toBe(3.11)
  })

  it('converts display values back to meters', () => {
    expect(distanceToMeters(5, 'metric')).toBe(5000)
    expect(distanceToMeters(3.11, 'imperial')).toBeCloseTo(5005.06, 2)
  })

  it('round-trips common distances', () => {
    expect(distanceToMeters(distanceForDisplay(10000, 'metric'), 'metric')).toBe(10000)
    expect(distanceToMeters(distanceForDisplay(1609.344, 'imperial'), 'imperial')).toBeCloseTo(
      1609.344,
      2,
    )
  })
})

describe('weightStep', () => {
  it('uses 2.5 in metric display units', () => {
    expect(weightStep('metric')).toBe(2.5)
  })

  it('uses 5 in imperial display units', () => {
    expect(weightStep('imperial')).toBe(5)
  })
})
