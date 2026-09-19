import type { MonthlyGoalMode, Settings, SettingsPatch, UnitSystem } from '../../api/types'
import { cmToIn, inToCm, kgToLb, lbToKg, mToMi, miToM } from '../../lib/units'

const DEFAULT_TIMEZONE = 'UTC'

export interface SettingsDraft {
  unitSystem: UnitSystem
  timezone: string
  height: number | null
  weeklyRunGoal: number | null
  maxHr: number | null
  heightTouched: boolean
  weeklyRunGoalTouched: boolean
  maxHrTouched: boolean
}

export interface GoalDraft {
  goalWeight: number | null
  goalRatePerWeek: number | null
  goalMonthlyMode: MonthlyGoalMode | null
  goalMonthlyTarget: number | null
  goalMonthlyRate: number | null
  goalTargetWeight: number | null
  goalTargetDate: string | null
  goalWeightTouched: boolean
  goalRateTouched: boolean
  goalMonthlyTargetTouched: boolean
  goalMonthlyRateTouched: boolean
  goalTargetWeightTouched: boolean
  goalTargetDateTouched: boolean
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
    height: heightForDisplay(settings.height_cm, settings.unit_system),
    weeklyRunGoal: distanceForDisplay(settings.weekly_run_goal_m, settings.unit_system),
    maxHr: settings.max_hr,
    heightTouched: false,
    weeklyRunGoalTouched: false,
    maxHrTouched: false,
  }
}

export function convertDraftUnits(draft: SettingsDraft, unitSystem: UnitSystem): SettingsDraft {
  if (draft.unitSystem === unitSystem) {
    return draft
  }

  const heightCm = heightToCm(draft.height, draft.unitSystem)
  const weeklyRunGoalM = distanceToMeters(draft.weeklyRunGoal, draft.unitSystem)

  return {
    ...draft,
    unitSystem,
    height: heightForDisplay(heightCm, unitSystem),
    weeklyRunGoal: distanceForDisplay(weeklyRunGoalM, unitSystem),
  }
}

export function goalDraftFromSettings(settings: Settings): GoalDraft {
  const unitSystem = settings.unit_system

  return {
    goalWeight: weightForDisplay(settings.goal_weight_kg, unitSystem),
    goalRatePerWeek: weightForDisplay(settings.goal_rate_kg_per_week, unitSystem),
    goalMonthlyMode: settings.goal_monthly_mode,
    goalMonthlyTarget: weightForDisplay(settings.goal_monthly_target_kg, unitSystem),
    goalMonthlyRate: weightForDisplay(settings.goal_monthly_rate_kg, unitSystem),
    goalTargetWeight: weightForDisplay(settings.goal_weight_target_kg, unitSystem),
    goalTargetDate: settings.goal_weight_target_date,
    goalWeightTouched: false,
    goalRateTouched: false,
    goalMonthlyTargetTouched: false,
    goalMonthlyRateTouched: false,
    goalTargetWeightTouched: false,
    goalTargetDateTouched: false,
  }
}

export function validateGoalDraft(draft: GoalDraft): string | null {
  if (draft.goalWeight !== null && !(draft.goalWeight > 0)) {
    return 'Goal weight must be greater than 0.'
  }
  if (draft.goalRatePerWeek === 0) {
    return 'Weekly rate must not be 0.'
  }
  if (
    draft.goalMonthlyMode === 'target' &&
    draft.goalMonthlyTarget !== null &&
    !(draft.goalMonthlyTarget > 0)
  ) {
    return 'Monthly target weight must be greater than 0.'
  }
  if (draft.goalMonthlyMode === 'rate' && draft.goalMonthlyRate === 0) {
    return 'Monthly rate must not be 0.'
  }
  if ((draft.goalTargetWeight !== null) !== (draft.goalTargetDate !== null)) {
    return 'Enter both a target weight and target date, or clear both.'
  }
  if (draft.goalTargetWeight !== null && !(draft.goalTargetWeight > 0)) {
    return 'Target weight must be greater than 0.'
  }
  return null
}

function buildMonthlyGoalPatch(
  settings: Settings,
  draft: GoalDraft,
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
    const targetKg = weightToKg(draft.goalMonthlyTarget, settings.unit_system)
    if (
      (modeChanged || draft.goalMonthlyTargetTouched) &&
      targetKg !== settings.goal_monthly_target_kg
    ) {
      patch.goal_monthly_target_kg = targetKg
    }
  } else {
    const rateKg = weightToKg(draft.goalMonthlyRate, settings.unit_system)
    if ((modeChanged || draft.goalMonthlyRateTouched) && rateKg !== settings.goal_monthly_rate_kg) {
      patch.goal_monthly_rate_kg = rateKg
    }
  }
}

function buildDatedTargetGoalPatch(
  settings: Settings,
  draft: GoalDraft,
  patch: SettingsPatch,
): void {
  const targetKg = weightToKg(draft.goalTargetWeight, settings.unit_system)
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
  const dateChanged = draft.goalTargetDateTouched && targetDate !== settings.goal_weight_target_date
  if (weightChanged) {
    patch.goal_weight_target_kg = targetKg
  }
  if (dateChanged) {
    patch.goal_weight_target_date = targetDate
  }
}

export function buildGoalPatch(settings: Settings, draft: GoalDraft): SettingsPatch {
  const patch: SettingsPatch = {}

  const goalWeightKg = weightToKg(draft.goalWeight, settings.unit_system)
  if (draft.goalWeightTouched && goalWeightKg !== settings.goal_weight_kg) {
    patch.goal_weight_kg = goalWeightKg
  }

  const goalRateKgPerWeek = weightToKg(draft.goalRatePerWeek, settings.unit_system)
  if (draft.goalRateTouched && goalRateKgPerWeek !== settings.goal_rate_kg_per_week) {
    patch.goal_rate_kg_per_week = goalRateKgPerWeek
  }

  buildMonthlyGoalPatch(settings, draft, patch)
  buildDatedTargetGoalPatch(settings, draft, patch)

  return patch
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
