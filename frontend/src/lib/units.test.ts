import { describe, expect, it } from 'vitest'
import { cmToIn, ftToM, inToCm, kgToLb, lbToKg, miToM, mToFt, mToMi } from './units'

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
