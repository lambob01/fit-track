import { describe, expect, it } from 'vitest'
import type { Settings } from '../../api/types'
import {
  buildGoalPatch,
  buildSettingsPatch,
  convertDraftUnits,
  distanceForDisplay,
  distanceToMeters,
  draftFromSettings,
  goalDraftFromSettings,
  heightForDisplay,
  heightToCm,
  validateGoalDraft,
  weightForDisplay,
  weightToKg,
} from './settingsDraft'

const baseSettings: Settings = {
  id: 'user-1',
  username: 'alex',
  unit_system: 'metric',
  timezone: 'Europe/Berlin',
  goal_weight_kg: 80,
  goal_rate_kg_per_week: -0.5,
  goal_monthly_mode: 'target',
  goal_monthly_target_kg: 78,
  goal_monthly_rate_kg: null,
  goal_weight_target_date: null,
  goal_weight_target_kg: null,
  height_cm: 180,
  weekly_run_goal_m: 20000,
  max_hr: 190,
}

describe('draftFromSettings', () => {
  it('keeps the stored timezone when it is not the server default', () => {
    const draft = draftFromSettings(baseSettings, 'America/New_York')
    expect(draft.timezone).toBe('Europe/Berlin')
  })

  it('prefills the browser timezone when the stored one is the UTC default', () => {
    const draft = draftFromSettings({ ...baseSettings, timezone: 'UTC' }, 'America/New_York')
    expect(draft.timezone).toBe('America/New_York')
  })

  it('falls back to the stored UTC default when the browser timezone is empty', () => {
    const draft = draftFromSettings({ ...baseSettings, timezone: 'UTC' }, '')
    expect(draft.timezone).toBe('UTC')
  })

  it('converts stored height and weekly run goal to the display units of the stored unit system', () => {
    const imperial = draftFromSettings(
      { ...baseSettings, unit_system: 'imperial' },
      'Europe/Berlin',
    )
    expect(imperial.height).toBe(70.9)
    expect(imperial.weeklyRunGoal).toBe(12.43)
    expect(imperial.maxHr).toBe(190)
  })

  it('does not carry any weight goal fields', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect('goalWeight' in draft).toBe(false)
    expect('goalMonthlyMode' in draft).toBe(false)
  })
})

describe('unit conversions', () => {
  it('round-trips weight through display values', () => {
    const kg = weightToKg(176.4, 'imperial')
    expect(kg).toBe(80.014)
    expect(weightForDisplay(kg, 'imperial')).toBe(176.4)
  })

  it('converts distance between meters and display units', () => {
    expect(distanceForDisplay(5000, 'metric')).toBe(5)
    expect(distanceForDisplay(5000, 'imperial')).toBe(3.11)
    expect(distanceToMeters(5.1, 'metric')).toBe(5100)
    expect(distanceToMeters(3.11, 'imperial')).toBe(5005)
  })

  it('round-trips height through display values', () => {
    expect(heightForDisplay(180, 'metric')).toBe(180)
    expect(heightForDisplay(180, 'imperial')).toBe(70.9)
    expect(heightToCm(70.9, 'imperial')).toBe(180.1)
  })

  it('treats zero or negative height as no height', () => {
    expect(heightToCm(0, 'metric')).toBeNull()
    expect(heightToCm(-5, 'metric')).toBeNull()
    expect(heightToCm(0, 'imperial')).toBeNull()
    expect(heightForDisplay(0, 'metric')).toBeNull()
    expect(heightForDisplay(-5, 'metric')).toBeNull()
  })
})

describe('convertDraftUnits', () => {
  it('converts display values and preserves touched flags', () => {
    const draft = {
      ...draftFromSettings(baseSettings, 'Europe/Berlin'),
      height: 180,
      weeklyRunGoal: 5.1,
      heightTouched: true,
      weeklyRunGoalTouched: true,
    }

    const imperial = convertDraftUnits(draft, 'imperial')
    expect(imperial.unitSystem).toBe('imperial')
    expect(imperial.height).toBe(70.9)
    expect(imperial.weeklyRunGoal).toBe(3.17)
    expect(imperial.heightTouched).toBe(true)
    expect(imperial.weeklyRunGoalTouched).toBe(true)

    const back = convertDraftUnits(imperial, 'metric')
    expect(back.height).toBe(180.1)
    expect(back.weeklyRunGoal).toBe(5.1)
  })

  it('returns the same draft when the unit system is unchanged', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(convertDraftUnits(draft, 'metric')).toBe(draft)
  })
})

describe('goalDraftFromSettings', () => {
  it('maps the stored goals into display units', () => {
    const settings: Settings = {
      ...baseSettings,
      unit_system: 'imperial',
      goal_monthly_mode: 'rate',
      goal_monthly_target_kg: null,
      goal_monthly_rate_kg: -2.5,
      goal_weight_target_date: '2026-06-01',
      goal_weight_target_kg: 78,
    }
    const draft = goalDraftFromSettings(settings)

    expect(draft.goalWeight).toBe(176.4)
    expect(draft.goalRatePerWeek).toBe(-1.1)
    expect(draft.goalMonthlyMode).toBe('rate')
    expect(draft.goalMonthlyTarget).toBeNull()
    expect(draft.goalMonthlyRate).toBe(-5.5)
    expect(draft.goalTargetWeight).toBe(172)
    expect(draft.goalTargetDate).toBe('2026-06-01')
  })

  it('starts with every touched flag false', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(draft.goalWeightTouched).toBe(false)
    expect(draft.goalRateTouched).toBe(false)
    expect(draft.goalMonthlyTargetTouched).toBe(false)
    expect(draft.goalMonthlyRateTouched).toBe(false)
    expect(draft.goalTargetWeightTouched).toBe(false)
    expect(draft.goalTargetDateTouched).toBe(false)
  })

  it('keeps missing goals as null', () => {
    const settings: Settings = {
      ...baseSettings,
      goal_weight_kg: null,
      goal_rate_kg_per_week: null,
      goal_monthly_mode: null,
      goal_monthly_target_kg: null,
      goal_monthly_rate_kg: null,
      goal_weight_target_kg: null,
      goal_weight_target_date: null,
    }
    const draft = goalDraftFromSettings(settings)

    expect(draft.goalWeight).toBeNull()
    expect(draft.goalRatePerWeek).toBeNull()
    expect(draft.goalMonthlyMode).toBeNull()
    expect(draft.goalMonthlyTarget).toBeNull()
    expect(draft.goalMonthlyRate).toBeNull()
    expect(draft.goalTargetWeight).toBeNull()
    expect(draft.goalTargetDate).toBeNull()
  })
})

describe('validateGoalDraft', () => {
  it('accepts an empty draft', () => {
    const settings: Settings = {
      ...baseSettings,
      goal_weight_kg: null,
      goal_rate_kg_per_week: null,
      goal_monthly_mode: null,
      goal_monthly_target_kg: null,
      goal_monthly_rate_kg: null,
      goal_weight_target_kg: null,
      goal_weight_target_date: null,
    }
    expect(validateGoalDraft(goalDraftFromSettings(settings))).toBeNull()
  })

  it('rejects a non-positive final goal weight', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(validateGoalDraft({ ...draft, goalWeight: 0 })).toBe(
      'Goal weight must be greater than 0.',
    )
    expect(validateGoalDraft({ ...draft, goalWeight: -5 })).toBe(
      'Goal weight must be greater than 0.',
    )
  })

  it('rejects a zero weekly rate', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(validateGoalDraft({ ...draft, goalRatePerWeek: 0 })).toBe(
      'Weekly rate must not be 0.',
    )
  })

  it('rejects a zero monthly target or rate when that mode is active', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(validateGoalDraft({ ...draft, goalMonthlyMode: 'target', goalMonthlyTarget: 0 })).toBe(
      'Monthly target weight must be greater than 0.',
    )
    expect(validateGoalDraft({ ...draft, goalMonthlyMode: 'rate', goalMonthlyRate: 0 })).toBe(
      'Monthly rate must not be 0.',
    )
  })

  it('requires the dated target fields to be set together', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(
      validateGoalDraft({ ...draft, goalTargetWeight: 75, goalTargetDate: null }),
    ).toBe('Enter both a target weight and target date, or clear both.')
    expect(
      validateGoalDraft({ ...draft, goalTargetWeight: null, goalTargetDate: '2026-06-01' }),
    ).toBe('Enter both a target weight and target date, or clear both.')
    expect(
      validateGoalDraft({ ...draft, goalTargetWeight: 75, goalTargetDate: '2026-06-01' }),
    ).toBeNull()
  })

  it('rejects a non-positive dated target weight', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(
      validateGoalDraft({ ...draft, goalTargetWeight: 0, goalTargetDate: '2026-06-01' }),
    ).toBe('Target weight must be greater than 0.')
  })
})

describe('buildGoalPatch', () => {
  it('sends nothing when the draft matches the stored goals', () => {
    expect(buildGoalPatch(baseSettings, goalDraftFromSettings(baseSettings))).toEqual({})
  })

  it('sends the edited weekly rate converted back to kg', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(
      buildGoalPatch(baseSettings, { ...draft, goalRatePerWeek: -0.8, goalRateTouched: true }),
    ).toEqual({ goal_rate_kg_per_week: -0.8 })
  })

  it('sends an explicit null when the weekly rate is cleared', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(
      buildGoalPatch(baseSettings, { ...draft, goalRatePerWeek: null, goalRateTouched: true }),
    ).toEqual({ goal_rate_kg_per_week: null })
  })

  it('omits a cleared weekly rate that was already null', () => {
    const settings = { ...baseSettings, goal_rate_kg_per_week: null }
    const draft = goalDraftFromSettings(settings)
    expect(
      buildGoalPatch(settings, { ...draft, goalRatePerWeek: null, goalRateTouched: true }),
    ).toEqual({})
  })

  it('sends the edited final goal weight converted back to kg', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(
      buildGoalPatch(baseSettings, { ...draft, goalWeight: 82.5, goalWeightTouched: true }),
    ).toEqual({ goal_weight_kg: 82.5 })
  })

  it('sends an explicit null when the final goal weight is cleared', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(
      buildGoalPatch(baseSettings, { ...draft, goalWeight: null, goalWeightTouched: true }),
    ).toEqual({ goal_weight_kg: null })
  })

  it('converts an imperial final goal weight to kilograms', () => {
    const settings = { ...baseSettings, unit_system: 'imperial' as const }
    const draft = goalDraftFromSettings(settings)
    expect(
      buildGoalPatch(settings, { ...draft, goalWeight: 180, goalWeightTouched: true }),
    ).toEqual({ goal_weight_kg: 81.647 })
  })

  it('sends the monthly mode with its value when the mode is first set', () => {
    const settings: Settings = {
      ...baseSettings,
      goal_monthly_mode: null,
      goal_monthly_target_kg: null,
      goal_monthly_rate_kg: null,
    }
    const draft = goalDraftFromSettings(settings)
    expect(
      buildGoalPatch(settings, {
        ...draft,
        goalMonthlyMode: 'target',
        goalMonthlyTarget: 75,
        goalMonthlyTargetTouched: true,
      }),
    ).toEqual({ goal_monthly_mode: 'target', goal_monthly_target_kg: 75 })
  })

  it('sends the matching value when the monthly mode switches', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(
      buildGoalPatch(baseSettings, {
        ...draft,
        goalMonthlyMode: 'rate',
        goalMonthlyRate: -2,
        goalMonthlyRateTouched: true,
      }),
    ).toEqual({ goal_monthly_mode: 'rate', goal_monthly_rate_kg: -2 })
  })

  it('sends only the touched monthly value when the mode is unchanged', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(
      buildGoalPatch(baseSettings, {
        ...draft,
        goalMonthlyTarget: 77,
        goalMonthlyTargetTouched: true,
      }),
    ).toEqual({ goal_monthly_target_kg: 77 })
  })

  it('clears the monthly goal when its active value is cleared', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(
      buildGoalPatch(baseSettings, {
        ...draft,
        goalMonthlyTarget: null,
        goalMonthlyTargetTouched: true,
      }),
    ).toEqual({ goal_monthly_mode: null })
  })

  it('sets both dated target fields together', () => {
    const draft = goalDraftFromSettings(baseSettings)
    expect(
      buildGoalPatch(baseSettings, {
        ...draft,
        goalTargetWeight: 78,
        goalTargetWeightTouched: true,
        goalTargetDate: '2026-06-01',
        goalTargetDateTouched: true,
      }),
    ).toEqual({ goal_weight_target_kg: 78, goal_weight_target_date: '2026-06-01' })
  })

  it('converts a dated target weight from imperial pounds', () => {
    const settings = { ...baseSettings, unit_system: 'imperial' as const }
    const draft = goalDraftFromSettings(settings)
    expect(
      buildGoalPatch(settings, {
        ...draft,
        goalTargetWeight: 172,
        goalTargetWeightTouched: true,
        goalTargetDate: '2026-06-01',
        goalTargetDateTouched: true,
      }),
    ).toEqual({ goal_weight_target_kg: 78.018, goal_weight_target_date: '2026-06-01' })
  })

  it('sends only the changed date when the target weight is untouched', () => {
    const settings: Settings = {
      ...baseSettings,
      unit_system: 'imperial',
      goal_weight_target_kg: 78,
      goal_weight_target_date: '2026-06-01',
    }
    const draft = goalDraftFromSettings(settings)
    expect(
      buildGoalPatch(settings, {
        ...draft,
        goalTargetDate: '2026-07-01',
        goalTargetDateTouched: true,
      }),
    ).toEqual({ goal_weight_target_date: '2026-07-01' })
  })

  it('clears both dated fields when either one is cleared', () => {
    const settings: Settings = {
      ...baseSettings,
      goal_weight_target_kg: 78,
      goal_weight_target_date: '2026-06-01',
    }
    const draft = goalDraftFromSettings(settings)
    expect(
      buildGoalPatch(settings, {
        ...draft,
        goalTargetDate: null,
        goalTargetDateTouched: true,
      }),
    ).toEqual({ goal_weight_target_kg: null, goal_weight_target_date: null })
  })

  it('omits an untouched dated target after a unit switch', () => {
    const settings: Settings = {
      ...baseSettings,
      unit_system: 'imperial',
      goal_weight_target_kg: 78,
      goal_weight_target_date: '2026-06-01',
    }
    const draft = goalDraftFromSettings(settings)
    expect(buildGoalPatch(settings, draft)).toEqual({})
  })
})

describe('buildSettingsPatch', () => {
  it('sends nothing when the draft matches the stored settings', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(buildSettingsPatch(baseSettings, draft)).toEqual({})
  })

  it('sends only the unit system when a display value changed via conversion only', () => {
    const draft = convertDraftUnits(
      draftFromSettings(baseSettings, 'Europe/Berlin'),
      'imperial',
    )
    expect(buildSettingsPatch(baseSettings, draft)).toEqual({ unit_system: 'imperial' })
  })

  it('trims the timezone and omits it when unchanged', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(buildSettingsPatch(baseSettings, { ...draft, timezone: ' Europe/Berlin ' })).toEqual({})
    expect(
      buildSettingsPatch(baseSettings, { ...draft, timezone: ' America/New_York ' }),
    ).toEqual({ timezone: 'America/New_York' })
  })

  it('sends an explicit null when a value is cleared', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(baseSettings, { ...draft, weeklyRunGoal: null, weeklyRunGoalTouched: true }),
    ).toEqual({ weekly_run_goal_m: null })
    expect(
      buildSettingsPatch(baseSettings, { ...draft, maxHr: null, maxHrTouched: true }),
    ).toEqual({ max_hr: null })
    expect(
      buildSettingsPatch(baseSettings, { ...draft, height: null, heightTouched: true }),
    ).toEqual({ height_cm: null })
  })

  it('omits a cleared value that was already null', () => {
    const settings = { ...baseSettings, weekly_run_goal_m: null }
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(settings, { ...draft, weeklyRunGoal: null, weeklyRunGoalTouched: true }),
    ).toEqual({})
  })

  it('converts height to centimeters and clears it with null', () => {
    const settings = { ...baseSettings, unit_system: 'imperial' as const }
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(buildSettingsPatch(settings, { ...draft, height: 71, heightTouched: true })).toEqual({
      height_cm: 180.3,
    })
    expect(buildSettingsPatch(settings, { ...draft, height: null, heightTouched: true })).toEqual({
      height_cm: null,
    })
  })

  it('treats a non-positive height edit as clearing the height', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(buildSettingsPatch(baseSettings, { ...draft, height: 0, heightTouched: true })).toEqual({
      height_cm: null,
    })
    expect(buildSettingsPatch(baseSettings, { ...draft, height: -5, heightTouched: true })).toEqual({
      height_cm: null,
    })
  })

  it('sends edited values converted back to canonical units', () => {
    const metricDraft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(baseSettings, {
        ...metricDraft,
        weeklyRunGoal: 21.5,
        weeklyRunGoalTouched: true,
      }),
    ).toEqual({ weekly_run_goal_m: 21500 })
  })

  it('converts edited imperial values to canonical units', () => {
    const settings = { ...baseSettings, unit_system: 'imperial' as const }
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(settings, { ...draft, weeklyRunGoal: 13.1, weeklyRunGoalTouched: true }),
    ).toEqual({ weekly_run_goal_m: 21082 })
  })

  it('rounds max heart rate and omits it when untouched', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(buildSettingsPatch(baseSettings, { ...draft, maxHr: 188.6, maxHrTouched: true })).toEqual(
      { max_hr: 189 },
    )
    expect(buildSettingsPatch(baseSettings, { ...draft, maxHr: 200, maxHrTouched: false })).toEqual(
      {},
    )
  })

  it('combines independent changes into one patch', () => {
    const draft = convertDraftUnits(
      draftFromSettings(baseSettings, 'Europe/Berlin'),
      'imperial',
    )
    expect(
      buildSettingsPatch(baseSettings, {
        ...draft,
        timezone: 'America/New_York',
        maxHr: 185,
        maxHrTouched: true,
      }),
    ).toEqual({
      unit_system: 'imperial',
      timezone: 'America/New_York',
      max_hr: 185,
    })
  })
})
