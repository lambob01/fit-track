import { describe, expect, it } from 'vitest'
import type {
  Exercise,
  ExerciseGoal,
  ExerciseProgress,
  ProgressSession,
} from '../../api/types'
import { dateKeyToTimestamp } from '../../lib/datetime'
import {
  BODYWEIGHT_PROGRESS_METRICS,
  buildProgressData,
  buildProgressYDomain,
  buildRequiredRatePoints,
  clearedGoalPatch,
  effectiveSeriesKey,
  formatSeriesAxisValue,
  formatSeriesTooltipValue,
  goalAppliesToSeries,
  goalDraftError,
  goalDraftToPatch,
  goalEstimateText,
  goalShortLabel,
  goalTargetLabel,
  goalTargetValue,
  hasWeightedSessions,
  initialGoalMode,
  mergeRequiredRatePoints,
  PROGRESS_METRICS,
  progressSeriesValue,
  SERIES_META,
} from './progressSeries'

function session(overrides: Partial<ProgressSession> = {}): ProgressSession {
  return {
    workout_id: 'w1',
    performed_at: '2026-09-01T10:00:00Z',
    top_set_kg: 100,
    e1rm_kg: 110,
    volume_kg: 1000,
    reps_volume: 20,
    ...overrides,
  }
}

function progress(overrides: Partial<ExerciseProgress> = {}): ExerciseProgress {
  return {
    sessions: [session()],
    sets_per_week: [],
    avg_rpe: [],
    estimated_weight_at_reps: null,
    goal: null,
    ...overrides,
  }
}

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'e1',
    name: 'Bench Press',
    muscle_group: 'chest',
    category: 'push',
    equipment: 'barbell',
    is_compound: true,
    is_archived: false,
    goal_weight_kg: null,
    goal_reps: null,
    goal_target_date: null,
    goal_reps_bodyweight: null,
    ...overrides,
  }
}

function weightGoal(overrides: Partial<ExerciseGoal> = {}): ExerciseGoal {
  return {
    mode: 'weight',
    weight_kg: 100,
    reps: 5,
    target_date: '2026-12-01',
    required_rate_line: [
      { date: '2026-09-01', weight_kg: 90, reps: null },
      { date: '2026-12-01', weight_kg: 100, reps: null },
    ],
    on_track: 'on_pace',
    estimate_date: '2026-11-15',
    ...overrides,
  }
}

describe('hasWeightedSessions', () => {
  it('is false when every session has no weighted set', () => {
    expect(
      hasWeightedSessions([
        session({ top_set_kg: null, e1rm_kg: null, volume_kg: 0 }),
        session({ top_set_kg: null, e1rm_kg: null, volume_kg: 0 }),
      ]),
    ).toBe(false)
  })

  it('is true when any session has a weighted set', () => {
    expect(
      hasWeightedSessions([session({ top_set_kg: null }), session({ top_set_kg: 60 })]),
    ).toBe(true)
  })
})

describe('progressSeriesValue', () => {
  it('maps each series key, including nulls', () => {
    const entry = session({ top_set_kg: null, e1rm_kg: 88.5 })
    expect(progressSeriesValue(entry, 'top_set')).toBeNull()
    expect(progressSeriesValue(entry, 'e1rm')).toBe(88.5)
    expect(progressSeriesValue(entry, 'volume')).toBe(1000)
    expect(progressSeriesValue(entry, 'reps_volume')).toBe(20)
  })
})

describe('effectiveSeriesKey', () => {
  it('keeps weighted metrics for weighted exercises', () => {
    for (const metric of ['top_set', 'e1rm', 'volume', 'sets_per_week', 'avg_rpe', 'e1rm_at_reps'] as const) {
      expect(effectiveSeriesKey(metric, true)).toBe(metric)
    }
  })

  it('never keeps the reps series for a weighted exercise', () => {
    expect(effectiveSeriesKey('reps_volume', true)).toBe('top_set')
  })

  it('keeps shared metrics and the reps series for bodyweight exercises', () => {
    expect(effectiveSeriesKey('reps_volume', false)).toBe('reps_volume')
    expect(effectiveSeriesKey('sets_per_week', false)).toBe('sets_per_week')
    expect(effectiveSeriesKey('avg_rpe', false)).toBe('avg_rpe')
  })

  it('falls back to reps for weight-only metrics on bodyweight exercises', () => {
    expect(effectiveSeriesKey('top_set', false)).toBe('reps_volume')
    expect(effectiveSeriesKey('e1rm_at_reps', false)).toBe('reps_volume')
  })

  it('defines the shared metric in both toggle groups', () => {
    const bodyweightKeys = BODYWEIGHT_PROGRESS_METRICS.map((item) => item.key)
    const weightedKeys = PROGRESS_METRICS.map((item) => item.key)
    expect(bodyweightKeys).toEqual(['reps_volume', 'sets_per_week', 'avg_rpe'])
    expect(weightedKeys).toContain('sets_per_week')
    expect(weightedKeys).toContain('avg_rpe')
    expect(weightedKeys).toContain('e1rm_at_reps')
    expect(weightedKeys).not.toContain('reps_volume')
  })
})

describe('buildProgressData', () => {
  it('uses the reps series and sorts by timestamp', () => {
    const data = buildProgressData(
      progress({
        sessions: [
          session({ workout_id: 'b', performed_at: '2026-09-03T10:00:00Z', reps_volume: 30 }),
          session({ workout_id: 'a', performed_at: '2026-09-01T10:00:00Z', reps_volume: 18 }),
        ],
      }),
      'reps_volume',
    )

    expect(data.map((point) => point.value)).toEqual([18, 30])
    expect(data[0].ts).toBeLessThan(data[1].ts)
  })

  it('maps weekly set counts to their week-start instants', () => {
    const data = buildProgressData(
      progress({
        sets_per_week: [
          { week_start: '2026-09-14T07:00:00Z', sets: 4 },
          { week_start: '2026-09-21T07:00:00Z', sets: 6 },
        ],
      }),
      'sets_per_week',
    )

    expect(data).toEqual([
      { ts: new Date('2026-09-14T07:00:00Z').getTime(), value: 4 },
      { ts: new Date('2026-09-21T07:00:00Z').getTime(), value: 6 },
    ])
  })

  it('maps average RPE points', () => {
    const data = buildProgressData(
      progress({ avg_rpe: [{ performed_at: '2026-09-02T10:00:00Z', avg_rpe: 8.5 }] }),
      'avg_rpe',
    )

    expect(data).toEqual([{ ts: new Date('2026-09-02T10:00:00Z').getTime(), value: 8.5 }])
  })

  it('maps estimated weight at reps and tolerates a null payload', () => {
    const data = buildProgressData(
      progress({
        estimated_weight_at_reps: [
          { performed_at: '2026-09-02T10:00:00Z', weight_kg: 120 },
        ],
      }),
      'e1rm_at_reps',
    )
    expect(data).toEqual([{ ts: new Date('2026-09-02T10:00:00Z').getTime(), value: 120 }])
    expect(buildProgressData(progress(), 'e1rm_at_reps')).toEqual([])
  })
})

describe('buildProgressYDomain', () => {
  it('returns undefined without numeric values', () => {
    expect(buildProgressYDomain([{ ts: 1, value: null }])).toBeUndefined()
  })

  it('pads a single value', () => {
    expect(buildProgressYDomain([{ ts: 1, value: 100 }])).toEqual([90, 110])
  })

  it('never drops below zero', () => {
    expect(buildProgressYDomain([{ ts: 1, value: 0.5 }])).toEqual([0, 1.5])
  })

  it('includes extra overlays such as goal targets', () => {
    expect(buildProgressYDomain([{ ts: 1, value: 90 }], [100])).toEqual([88.5, 101.5])
  })

  it('is defined by the goal alone when there is no data yet', () => {
    expect(buildProgressYDomain([], [100])).toEqual([90, 110])
  })
})

describe('goal helpers', () => {
  it('returns the target value for each mode', () => {
    expect(goalTargetValue(weightGoal())).toBe(100)
    expect(goalTargetValue(weightGoal({ mode: 'bodyweight', reps: 15, weight_kg: null }))).toBe(15)
    expect(goalTargetValue(null)).toBeNull()
  })

  it('only applies a weighted goal to weight-based series', () => {
    const goal = weightGoal()
    expect(goalAppliesToSeries(goal, 'top_set')).toBe(true)
    expect(goalAppliesToSeries(goal, 'e1rm')).toBe(true)
    expect(goalAppliesToSeries(goal, 'e1rm_at_reps')).toBe(true)
    expect(goalAppliesToSeries(goal, 'volume')).toBe(false)
    expect(goalAppliesToSeries(goal, 'sets_per_week')).toBe(false)
    expect(goalAppliesToSeries(goal, 'avg_rpe')).toBe(false)
    expect(goalAppliesToSeries(goal, 'reps_volume')).toBe(false)
  })

  it('only applies a bodyweight goal to the reps series', () => {
    const goal = weightGoal({ mode: 'bodyweight', reps: 15, weight_kg: null })
    expect(goalAppliesToSeries(goal, 'reps_volume')).toBe(true)
    expect(goalAppliesToSeries(goal, 'top_set')).toBe(false)
    expect(goalAppliesToSeries(goal, 'sets_per_week')).toBe(false)
  })

  it('builds required-rate points from the goal line for each mode', () => {
    const timezone = 'UTC'
    const weighted = buildRequiredRatePoints(weightGoal(), timezone)
    expect(weighted).toEqual([
      { ts: dateKeyToTimestamp('2026-09-01', timezone), value: 90 },
      { ts: dateKeyToTimestamp('2026-12-01', timezone), value: 100 },
    ])

    const bodyweight = buildRequiredRatePoints(
      weightGoal({
        mode: 'bodyweight',
        weight_kg: null,
        reps: 15,
        required_rate_line: [
          { date: '2026-09-01', weight_kg: null, reps: 10 },
          { date: '2026-12-01', weight_kg: null, reps: 15 },
        ],
      }),
      timezone,
    )
    expect(bodyweight.map((point) => point.value)).toEqual([10, 15])
  })

  it('has no required-rate points without a dated goal', () => {
    expect(buildRequiredRatePoints(null, 'UTC')).toEqual([])
    expect(
      buildRequiredRatePoints(weightGoal({ required_rate_line: null }), 'UTC'),
    ).toEqual([])
  })

  it('merges required-rate points into the data by timestamp', () => {
    const merged = mergeRequiredRatePoints(
      [
        { ts: 20, value: 90 },
        { ts: 10, value: 80 },
      ],
      [
        { ts: 10, value: 85 },
        { ts: 30, value: 100 },
      ],
    )

    expect(merged).toEqual([
      { ts: 10, value: 80, requiredRate: 85 },
      { ts: 20, value: 90 },
      { ts: 30, value: null, requiredRate: 100 },
    ])
  })

  it('formats axis and tooltip values per series unit', () => {
    expect(formatSeriesAxisValue(100, SERIES_META.top_set, 'metric')).toBe('100 kg')
    expect(formatSeriesAxisValue(8.5, SERIES_META.avg_rpe, 'metric')).toBe('8.5')
    expect(formatSeriesAxisValue(4, SERIES_META.sets_per_week, 'metric')).toBe('4')
    expect(formatSeriesTooltipValue(8.5, SERIES_META.avg_rpe, 'metric')).toBe('RPE 8.5')
    expect(formatSeriesTooltipValue(4, SERIES_META.sets_per_week, 'metric')).toBe('4 sets')
    expect(formatSeriesTooltipValue(20, SERIES_META.reps_volume, 'metric')).toBe('20 reps')
    expect(formatSeriesTooltipValue(100, SERIES_META.e1rm_at_reps, 'metric')).toBe('100 kg')
  })

  it('labels goals with units and the target date', () => {
    const goal = weightGoal()
    expect(goalShortLabel(goal, 'metric')).toBe('100 kg × 5')
    expect(goalTargetLabel(goal, 'metric')).toBe('Goal 100 kg × 5 by Dec 1, 2026')

    const bodyweight = weightGoal({
      mode: 'bodyweight',
      weight_kg: null,
      reps: 15,
      target_date: null,
    })
    expect(goalShortLabel(bodyweight, 'metric')).toBe('15 reps')
    expect(goalTargetLabel(bodyweight, 'metric')).toBe('Goal 15 reps')
  })

  it('describes the estimate, an untracked trend, and an expired target', () => {
    expect(goalEstimateText(weightGoal())).toBe(
      "At current rate, you'll hit this on ~Nov 15, 2026",
    )
    expect(goalEstimateText(weightGoal({ estimate_date: null }))).toBe('Not on track')
    expect(goalEstimateText(weightGoal({ on_track: 'expired', estimate_date: null }))).toBe(
      'Target date has passed.',
    )
    expect(goalEstimateText(null)).toBeNull()
  })
})

describe('goal form helpers', () => {
  it('picks the mode from an existing goal first', () => {
    expect(initialGoalMode(exercise({ goal_reps_bodyweight: 12 }), true)).toBe('bodyweight')
    expect(initialGoalMode(exercise({ goal_weight_kg: 100 }), false)).toBe('weight')
  })

  it('defaults compound or previously weighted exercises to weight', () => {
    expect(initialGoalMode(exercise({ is_compound: true }), false)).toBe('weight')
    expect(initialGoalMode(exercise({ is_compound: false }), true)).toBe('weight')
    expect(initialGoalMode(exercise({ is_compound: false }), false)).toBe('bodyweight')
  })

  it('mirrors backend validation', () => {
    expect(
      goalDraftError({
        mode: 'weight',
        weight: null,
        reps: null,
        bodyweightReps: null,
        targetDate: '2026-12-01',
      }),
    ).toBe('Enter a target weight.')
    expect(
      goalDraftError({
        mode: 'weight',
        weight: 100,
        reps: 0,
        bodyweightReps: null,
        targetDate: null,
      }),
    ).toBe('Reps must be at least 1.')
    expect(
      goalDraftError({
        mode: 'bodyweight',
        weight: null,
        reps: null,
        bodyweightReps: null,
        targetDate: '2026-12-01',
      }),
    ).toBe('Enter a target rep count.')
    expect(
      goalDraftError({
        mode: 'weight',
        weight: 100,
        reps: 5,
        bodyweightReps: null,
        targetDate: '2026-12-01',
      }),
    ).toBeNull()
  })

  it('converts weighted drafts to kg and clears the other mode', () => {
    const patch = goalDraftToPatch(
      {
        mode: 'weight',
        weight: 225,
        reps: 5.4,
        bodyweightReps: null,
        targetDate: '2026-12-01',
      },
      'imperial',
    )
    expect(patch.goal_weight_kg).toBeCloseTo(102.058, 2)
    expect(patch.goal_reps).toBe(5)
    expect(patch.goal_target_date).toBe('2026-12-01')
    expect(patch.goal_reps_bodyweight).toBeNull()
  })

  it('keeps bodyweight drafts and clears the weighted fields', () => {
    expect(
      goalDraftToPatch(
        {
          mode: 'bodyweight',
          weight: null,
          reps: null,
          bodyweightReps: 12,
          targetDate: null,
        },
        'metric',
      ),
    ).toEqual({
      goal_weight_kg: null,
      goal_reps: null,
      goal_target_date: null,
      goal_reps_bodyweight: 12,
    })
  })

  it('clears every goal field', () => {
    expect(clearedGoalPatch()).toEqual({
      goal_weight_kg: null,
      goal_reps: null,
      goal_target_date: null,
      goal_reps_bodyweight: null,
    })
  })
})
