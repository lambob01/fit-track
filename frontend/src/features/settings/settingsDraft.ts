import type { Settings, SettingsPatch, UnitSystem } from '../../api/types'
import { kgToLb, lbToKg, mToMi, miToM } from '../../lib/units'

const DEFAULT_TIMEZONE = 'UTC'

export interface SettingsDraft {
  unitSystem: UnitSystem
  timezone: string
  goalWeight: number | null
  weeklyRunGoal: number | null
  maxHr: number | null
  goalWeightTouched: boolean
  weeklyRunGoalTouched: boolean
  maxHrTouched: boolean
}

export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE
  } catch {
    return DEFAULT_TIMEZONE
  }
}

export function weightForDisplay(kg: number | null, unitSystem: UnitSystem): number | null {
  if (kg === null) {
    return null
  }
  return unitSystem === 'imperial' ? Number(kgToLb(kg).toFixed(1)) : Number(kg.toFixed(1))
}

export function weightToKg(value: number | null, unitSystem: UnitSystem): number | null {
  if (value === null) {
    return null
  }
  const kg = unitSystem === 'imperial' ? lbToKg(value) : value
  return Number(kg.toFixed(3))
}

export function distanceForDisplay(meters: number | null, unitSystem: UnitSystem): number | null {
  if (meters === null) {
    return null
  }
  return unitSystem === 'imperial'
    ? Number(mToMi(meters).toFixed(2))
    : Number((meters / 1000).toFixed(2))
}

export function distanceToMeters(value: number | null, unitSystem: UnitSystem): number | null {
  if (value === null) {
    return null
  }
  return Math.round(unitSystem === 'imperial' ? miToM(value) : value * 1000)
}

export function draftFromSettings(settings: Settings, browserTimezone = ''): SettingsDraft {
  const timezone =
    settings.timezone === DEFAULT_TIMEZONE && browserTimezone !== ''
      ? browserTimezone
      : settings.timezone

  return {
    unitSystem: settings.unit_system,
    timezone,
    goalWeight: weightForDisplay(settings.goal_weight_kg, settings.unit_system),
    weeklyRunGoal: distanceForDisplay(settings.weekly_run_goal_m, settings.unit_system),
    maxHr: settings.max_hr,
    goalWeightTouched: false,
    weeklyRunGoalTouched: false,
    maxHrTouched: false,
  }
}

export function convertDraftUnits(draft: SettingsDraft, unitSystem: UnitSystem): SettingsDraft {
  if (draft.unitSystem === unitSystem) {
    return draft
  }

  const goalWeightKg = weightToKg(draft.goalWeight, draft.unitSystem)
  const weeklyRunGoalM = distanceToMeters(draft.weeklyRunGoal, draft.unitSystem)

  return {
    ...draft,
    unitSystem,
    goalWeight: weightForDisplay(goalWeightKg, unitSystem),
    weeklyRunGoal: distanceForDisplay(weeklyRunGoalM, unitSystem),
  }
}

export function buildSettingsPatch(settings: Settings, draft: SettingsDraft): SettingsPatch {
  const patch: SettingsPatch = {}

  if (draft.unitSystem !== settings.unit_system) {
    patch.unit_system = draft.unitSystem
  }

  const timezone = draft.timezone.trim()
  if (timezone !== settings.timezone) {
    patch.timezone = timezone
  }

  const goalWeightKg = weightToKg(draft.goalWeight, draft.unitSystem)
  if (draft.goalWeightTouched && goalWeightKg !== settings.goal_weight_kg) {
    patch.goal_weight_kg = goalWeightKg
  }

  const weeklyRunGoalM = distanceToMeters(draft.weeklyRunGoal, draft.unitSystem)
  if (draft.weeklyRunGoalTouched && weeklyRunGoalM !== settings.weekly_run_goal_m) {
    patch.weekly_run_goal_m = weeklyRunGoalM
  }

  const maxHr = draft.maxHr === null ? null : Math.round(draft.maxHr)
  if (draft.maxHrTouched && maxHr !== settings.max_hr) {
    patch.max_hr = maxHr
  }

  return patch
}
