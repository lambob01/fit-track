import type { UnitSystem } from '../../api/types'
import { kgToLb, lbToKg } from '../../lib/units'

export function displayWeight(kg: number | null, unitSystem: UnitSystem): number | null {
  if (kg === null) {
    return null
  }
  return unitSystem === 'imperial' ? Number(kgToLb(kg).toFixed(1)) : kg
}

export function displayToKg(value: number | null, unitSystem: UnitSystem): number | null {
  if (value === null || value <= 0) {
    return null
  }
  const kg = unitSystem === 'imperial' ? lbToKg(value) : value
  return Number(kg.toFixed(3))
}
