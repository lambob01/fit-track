import type { UnitSystem } from '../api/types'

export const KG_PER_LB = 0.45359237
export const M_PER_MI = 1609.344
export const M_PER_FT = 0.3048
export const CM_PER_IN = 2.54

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}

export function mToMi(m: number): number {
  return m / M_PER_MI
}

export function miToM(mi: number): number {
  return mi * M_PER_MI
}

export function mToFt(m: number): number {
  return m / M_PER_FT
}

export function ftToM(ft: number): number {
  return ft * M_PER_FT
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN
}

export const METRIC_WEIGHT_STEP_KG = 2.5
export const IMPERIAL_WEIGHT_STEP_LB = 5

export function weightStep(system: UnitSystem): number {
  return system === 'imperial' ? IMPERIAL_WEIGHT_STEP_LB : METRIC_WEIGHT_STEP_KG
}

export function inToCm(inches: number): number {
  return inches * CM_PER_IN
}

function trimTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

export function formatWeight(kg: number, system: UnitSystem): string {
  if (system === 'imperial') {
    return `${trimTrailingZeros(kgToLb(kg).toFixed(1))} lb`
  }
  return `${trimTrailingZeros(kg.toFixed(1))} kg`
}

function formatSigned(value: number, digits: number): string {
  const formatted = trimTrailingZeros(Math.abs(value).toFixed(digits))
  if (value < 0) {
    return `−${formatted}`
  }
  if (value > 0) {
    return `+${formatted}`
  }
  return formatted
}

export function formatWeightRate(
  kg: number,
  system: UnitSystem,
  period: 'week' | 'month' = 'week',
): string {
  const value = system === 'imperial' ? kgToLb(kg) : kg
  const unit = system === 'imperial' ? 'lb' : 'kg'
  return `${formatSigned(value, 2)} ${unit}/${period}`
}

export function formatDistance(m: number, system: UnitSystem): string {
  if (system === 'imperial') {
    return `${trimTrailingZeros(mToMi(m).toFixed(2))} mi`
  }
  return `${trimTrailingZeros((m / 1000).toFixed(2))} km`
}

export function formatPace(sPerKm: number, system: UnitSystem): string {
  const seconds = system === 'imperial' ? sPerKm * (M_PER_MI / 1000) : sPerKm
  const rounded = Math.round(seconds)
  const minutes = Math.floor(rounded / 60)
  const rest = String(rounded % 60).padStart(2, '0')
  return `${minutes}:${rest} /${system === 'imperial' ? 'mi' : 'km'}`
}
