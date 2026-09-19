import type { MonthlyGoalMode, Settings, SettingsPatch, UnitSystem } from '../../api/types'
import { cmToIn, inToCm, kgToLb, lbToKg, mToMi, miToM } from '../../lib/units'

const DEFAULT_TIMEZONE = 'UTC'

export interface SettingsDraft {
  unitSystem: UnitSystem
  timezone: string
  goalWeight: number | null
  goalRatePerWeek: number | null
  goalMonthlyMode: MonthlyGoalMode | null
  goalMonthlyTarget: number | null
  goalMonthlyRate: number | null
  goalTargetWeight: number | null
  goalTargetDate: string | null
  height: number | null
  weeklyRunGoal: number | null
  maxHr: number | null
  goalWeightTouched: boolean
  goalRateTouched: boolean
  goalMonthlyTargetTouched: boolean
  goalMonthlyRateTouched: boolean
  goalTargetWeightTouched: boolean
  goalTargetDateTouched: boolean
  heightTouched: boolean
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

export function heightForDisplay(cm: number | null, unitSystem: UnitSystem): number | null {
  if (cm === null || !(cm > 0)) {
    return null
  }
  return unitSystem === 'imperial' ? Number(cmToIn(cm).toFixed(1)) : Number(cm.toFixed(1))
}

export function heightToCm(value: number | null, unitSystem: UnitSystem): number | null {
  if (value === null || !(value > 0)) {
    return null
  }
  const cm = unitSystem === 'imperial' ? inToCm(value) : value
  return Number(cm.toFixed(1))
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
    goalRatePerWeek: weightForDisplay(settings.goal_rate_kg_per_week, settings.unit_system),
    goalMonthlyMode: settings.goal_monthly_mode,
    goalMonthlyTarget: weightForDisplay(settings.goal_monthly_target_kg, settings.unit_system),
    goalMonthlyRate: weightForDisplay(settings.goal_monthly_rate_kg, settings.unit_system),
    goalTargetWeight: weightForDisplay(settings.goal_weight_target_kg, settings.unit_system),
    goalTargetDate: settings.goal_weight_target_date,
    height: heightForDisplay(settings.height_cm, settings.unit_system),
    weeklyRunGoal: distanceForDisplay(settings.weekly_run_goal_m, settings.unit_system),
    maxHr: settings.max_hr,
    goalWeightTouched: false,
    goalRateTouched: false,
    goalMonthlyTargetTouched: false,
    goalMonthlyRateTouched: false,
    goalTargetWeightTouched: false,
    goalTargetDateTouched: false,
    heightTouched: false,
    weeklyRunGoalTouched: false,
    maxHrTouched: false,
  }
}

export function convertDraftUnits(draft: SettingsDraft, unitSystem: UnitSystem): SettingsDraft {
  if (draft.unitSystem === unitSystem) {
    return draft
  }

  const goalWeightKg = weightToKg(draft.goalWeight, draft.unitSystem)
  const goalRateKgPerWeek = weightToKg(draft.goalRatePerWeek, draft.unitSystem)
  const goalMonthlyTargetKg = weightToKg(draft.goalMonthlyTarget, draft.unitSystem)
  const goalMonthlyRateKg = weightToKg(draft.goalMonthlyRate, draft.unitSystem)
  const goalTargetWeightKg = weightToKg(draft.goalTargetWeight, draft.unitSystem)
  const heightCm = heightToCm(draft.height, draft.unitSystem)
  const weeklyRunGoalM = distanceToMeters(draft.weeklyRunGoal, draft.unitSystem)

  return {
    ...draft,
    unitSystem,
    goalWeight: weightForDisplay(goalWeightKg, unitSystem),
    goalRatePerWeek: weightForDisplay(goalRateKgPerWeek, unitSystem),
    goalMonthlyTarget: weightForDisplay(goalMonthlyTargetKg, unitSystem),
    goalMonthlyRate: weightForDisplay(goalMonthlyRateKg, unitSystem),
    goalTargetWeight: weightForDisplay(goalTargetWeightKg, unitSystem),
    height: heightForDisplay(heightCm, unitSystem),
    weeklyRunGoal: distanceForDisplay(weeklyRunGoalM, unitSystem),
  }
}

function buildMonthlyPatch(
  settings: Settings,
  draft: SettingsDraft,
  patch: SettingsPatch,
): void {
  const desiredMode = draft.goalMonthlyMode
  const activeValueMissing =
    (desiredMode === 'target' && draft.goalMonthlyTarget === null) ||
    (desiredMode === 'rate' && draft.goalMonthlyRate === null)
  const mode = activeValueMissing ? null : desiredMode

  if (mode === null) {
    if (settings.goal_monthly_mode !== null) {
      patch.goal_monthly_mode = null
    }
    return
  }

  const modeChanged = mode !== settings.goal_monthly_mode
  if (modeChanged) {
    patch.goal_monthly_mode = mode
  }

  if (mode === 'target') {
    const targetKg = weightToKg(draft.goalMonthlyTarget, draft.unitSystem)
    if (
      (modeChanged || draft.goalMonthlyTargetTouched) &&
      targetKg !== settings.goal_monthly_target_kg
    ) {
      patch.goal_monthly_target_kg = targetKg
    }
  } else {
    const rateKg = weightToKg(draft.goalMonthlyRate, draft.unitSystem)
    if (
      (modeChanged || draft.goalMonthlyRateTouched) &&
      rateKg !== settings.goal_monthly_rate_kg
    ) {
      patch.goal_monthly_rate_kg = rateKg
    }
  }
}

function buildDatedTargetPatch(
  settings: Settings,
  draft: SettingsDraft,
  patch: SettingsPatch,
): void {
  const targetKg = weightToKg(draft.goalTargetWeight, draft.unitSystem)
  const targetDate = draft.goalTargetDate
  const stored =
    settings.goal_weight_target_kg !== null || settings.goal_weight_target_date !== null

  if (targetKg === null || targetDate === null) {
    if (stored && (draft.goalTargetWeightTouched || draft.goalTargetDateTouched)) {
      patch.goal_weight_target_kg = null
      patch.goal_weight_target_date = null
    }
    return
  }

  const weightChanged =
    draft.goalTargetWeightTouched && targetKg !== settings.goal_weight_target_kg
  const dateChanged =
    draft.goalTargetDateTouched && targetDate !== settings.goal_weight_target_date
  if (weightChanged) {
    patch.goal_weight_target_kg = targetKg
  }
  if (dateChanged) {
    patch.goal_weight_target_date = targetDate
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

  const goalRateKgPerWeek = weightToKg(draft.goalRatePerWeek, draft.unitSystem)
  if (draft.goalRateTouched && goalRateKgPerWeek !== settings.goal_rate_kg_per_week) {
    patch.goal_rate_kg_per_week = goalRateKgPerWeek
  }

  buildMonthlyPatch(settings, draft, patch)
  buildDatedTargetPatch(settings, draft, patch)

  const heightCm = heightToCm(draft.height, draft.unitSystem)
  if (draft.heightTouched && heightCm !== settings.height_cm) {
    patch.height_cm = heightCm
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
