import { describe, expect, it } from 'vitest'
import type { Settings } from '../../api/types'
import {
  buildSettingsPatch,
  convertDraftUnits,
  distanceForDisplay,
  distanceToMeters,
  draftFromSettings,
  heightForDisplay,
  heightToCm,
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

  it('converts stored goals to the display units of the stored unit system', () => {
    const imperial = draftFromSettings(
      { ...baseSettings, unit_system: 'imperial' },
      'Europe/Berlin',
    )
    expect(imperial.goalWeight).toBe(176.4)
    expect(imperial.weeklyRunGoal).toBe(12.43)
    expect(imperial.maxHr).toBe(190)
  })

  it('maps the extended goal fields into display units', () => {
    const settings: Settings = {
      ...baseSettings,
      unit_system: 'imperial',
      goal_monthly_mode: 'rate',
      goal_monthly_target_kg: null,
      goal_monthly_rate_kg: -2.5,
      goal_weight_target_date: '2026-06-01',
      goal_weight_target_kg: 78,
    }
    const draft = draftFromSettings(settings, 'Europe/Berlin')

    expect(draft.goalRatePerWeek).toBe(-1.1)
    expect(draft.goalMonthlyMode).toBe('rate')
    expect(draft.goalMonthlyTarget).toBeNull()
    expect(draft.goalMonthlyRate).toBe(-5.5)
    expect(draft.goalTargetWeight).toBe(172)
    expect(draft.goalTargetDate).toBe('2026-06-01')
    expect(draft.height).toBe(70.9)
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
      goalWeight: 80.3,
      weeklyRunGoal: 5.1,
      goalWeightTouched: true,
      weeklyRunGoalTouched: true,
    }

    const imperial = convertDraftUnits(draft, 'imperial')
    expect(imperial.unitSystem).toBe('imperial')
    expect(imperial.goalWeight).toBe(177)
    expect(imperial.weeklyRunGoal).toBe(3.17)
    expect(imperial.goalWeightTouched).toBe(true)
    expect(imperial.weeklyRunGoalTouched).toBe(true)

    const back = convertDraftUnits(imperial, 'metric')
    expect(back.goalWeight).toBe(80.3)
    expect(back.weeklyRunGoal).toBe(5.1)
  })

  it('returns the same draft when the unit system is unchanged', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(convertDraftUnits(draft, 'metric')).toBe(draft)
  })

  it('converts the extended goal fields between unit systems', () => {
    const settings: Settings = {
      ...baseSettings,
      unit_system: 'imperial',
      goal_monthly_mode: 'rate',
      goal_monthly_rate_kg: -2.5,
      goal_weight_target_date: '2026-06-01',
      goal_weight_target_kg: 78,
      height_cm: 180,
    }
    const metric = convertDraftUnits(draftFromSettings(settings, 'Europe/Berlin'), 'metric')

    expect(metric.goalRatePerWeek).toBe(-0.5)
    expect(metric.goalMonthlyRate).toBe(-2.5)
    expect(metric.goalTargetWeight).toBe(78)
    expect(metric.height).toBeCloseTo(180.1, 1)
  })
})

describe('buildSettingsPatch goals', () => {
  it('sends the edited weekly rate converted back to kg', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(baseSettings, { ...draft, goalRatePerWeek: -0.8, goalRateTouched: true }),
    ).toEqual({ goal_rate_kg_per_week: -0.8 })
  })

  it('sends an explicit null when the weekly rate is cleared', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(baseSettings, { ...draft, goalRatePerWeek: null, goalRateTouched: true }),
    ).toEqual({ goal_rate_kg_per_week: null })
  })

  it('omits a cleared weekly rate that was already null', () => {
    const settings = { ...baseSettings, goal_rate_kg_per_week: null }
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(settings, { ...draft, goalRatePerWeek: null, goalRateTouched: true }),
    ).toEqual({})
  })

  it('sends the monthly mode with its value when the mode is first set', () => {
    const settings: Settings = {
      ...baseSettings,
      goal_monthly_mode: null,
      goal_monthly_target_kg: null,
      goal_monthly_rate_kg: null,
    }
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(settings, {
        ...draft,
        goalMonthlyMode: 'target',
        goalMonthlyTarget: 75,
        goalMonthlyTargetTouched: true,
      }),
    ).toEqual({ goal_monthly_mode: 'target', goal_monthly_target_kg: 75 })
  })

  it('sends the matching value when the monthly mode switches', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(baseSettings, {
        ...draft,
        goalMonthlyMode: 'rate',
        goalMonthlyRate: -2,
        goalMonthlyRateTouched: true,
      }),
    ).toEqual({ goal_monthly_mode: 'rate', goal_monthly_rate_kg: -2 })
  })

  it('sends only the touched monthly value when the mode is unchanged', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(baseSettings, {
        ...draft,
        goalMonthlyTarget: 77,
        goalMonthlyTargetTouched: true,
      }),
    ).toEqual({ goal_monthly_target_kg: 77 })
  })

  it('clears the monthly goal when its active value is cleared', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(baseSettings, {
        ...draft,
        goalMonthlyTarget: null,
        goalMonthlyTargetTouched: true,
      }),
    ).toEqual({ goal_monthly_mode: null })
  })

  it('sets both dated target fields together', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(baseSettings, {
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
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(settings, {
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
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(settings, {
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
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(settings, {
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
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(buildSettingsPatch(settings, draft)).toEqual({})
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
})

describe('buildSettingsPatch', () => {
  it('sends nothing when the draft matches the stored settings', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(buildSettingsPatch(baseSettings, draft)).toEqual({})
  })

  it('sends only the unit system when a goal display value changed via conversion only', () => {
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

  it('sends an explicit null when a goal is cleared', () => {
    const draft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(baseSettings, { ...draft, goalWeight: null, goalWeightTouched: true }),
    ).toEqual({ goal_weight_kg: null })
    expect(
      buildSettingsPatch(baseSettings, { ...draft, weeklyRunGoal: null, weeklyRunGoalTouched: true }),
    ).toEqual({ weekly_run_goal_m: null })
    expect(
      buildSettingsPatch(baseSettings, { ...draft, maxHr: null, maxHrTouched: true }),
    ).toEqual({ max_hr: null })
  })

  it('omits a cleared goal that was already null', () => {
    const settings = { ...baseSettings, goal_weight_kg: null }
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(settings, { ...draft, goalWeight: null, goalWeightTouched: true }),
    ).toEqual({})
  })

  it('sends edited goal values converted back to canonical units', () => {
    const metricDraft = draftFromSettings(baseSettings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(baseSettings, {
        ...metricDraft,
        goalWeight: 82.5,
        goalWeightTouched: true,
      }),
    ).toEqual({ goal_weight_kg: 82.5 })
    expect(
      buildSettingsPatch(baseSettings, {
        ...metricDraft,
        weeklyRunGoal: 21.5,
        weeklyRunGoalTouched: true,
      }),
    ).toEqual({ weekly_run_goal_m: 21500 })
  })

  it('converts edited imperial goals to canonical units', () => {
    const settings = { ...baseSettings, unit_system: 'imperial' as const }
    const draft = draftFromSettings(settings, 'Europe/Berlin')
    expect(
      buildSettingsPatch(settings, { ...draft, goalWeight: 180, goalWeightTouched: true }),
    ).toEqual({ goal_weight_kg: 81.647 })
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
      {
        ...draftFromSettings(baseSettings, 'Europe/Berlin'),
        goalWeight: null,
        goalWeightTouched: true,
      },
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
      goal_weight_kg: null,
      max_hr: 185,
    })
  })
})
