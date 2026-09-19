import type {
  Exercise,
  ExerciseGoal,
  ExerciseGoalMode,
  ExercisePatch,
  ExerciseProgress,
  ProgressSession,
  UnitSystem,
} from '../../api/types'
import { dateKeyToTimestamp, formatDateKey } from '../../lib/datetime'
import { formatWeight } from '../../lib/units'
import { displayToKg } from './liftingUnits'

export type SessionSeriesKey = 'top_set' | 'e1rm' | 'volume' | 'reps_volume'

export type ProgressSeriesKey =
  | SessionSeriesKey
  | 'sets_per_week'
  | 'avg_rpe'
  | 'e1rm_at_reps'

export type ProgressMetric = Exclude<ProgressSeriesKey, 'reps_volume'>

export const PROGRESS_METRICS: { key: ProgressMetric; label: string }[] = [
  { key: 'top_set', label: 'Top set' },
  { key: 'e1rm', label: 'e1RM' },
  { key: 'volume', label: 'Volume' },
  { key: 'sets_per_week', label: 'Sets/week' },
  { key: 'avg_rpe', label: 'Avg RPE' },
  { key: 'e1rm_at_reps', label: 'e1RM @ reps' },
]

export const BODYWEIGHT_PROGRESS_METRICS: { key: ProgressSeriesKey; label: string }[] = [
  { key: 'reps_volume', label: 'Reps' },
  { key: 'sets_per_week', label: 'Sets/week' },
  { key: 'avg_rpe', label: 'Avg RPE' },
]

export interface SeriesMeta {
  name: string
  isWeight: boolean
  unit?: 'reps' | 'sets' | 'rpe'
}

export const SERIES_META: Record<ProgressSeriesKey, SeriesMeta> = {
  top_set: { name: 'Top set', isWeight: true },
  e1rm: { name: 'e1RM', isWeight: true },
  volume: { name: 'Volume', isWeight: true },
  reps_volume: { name: 'Reps per session', isWeight: false, unit: 'reps' },
  sets_per_week: { name: 'Sets per week', isWeight: false, unit: 'sets' },
  avg_rpe: { name: 'Average RPE', isWeight: false, unit: 'rpe' },
  e1rm_at_reps: { name: 'e1RM at reps', isWeight: true },
}

export interface ProgressPoint {
  ts: number
  value: number | null
  requiredRate?: number | null
}

export function hasWeightedSessions(sessions: ProgressSession[]): boolean {
  return sessions.some((session) => session.top_set_kg !== null)
}

export function effectiveSeriesKey(
  metric: ProgressSeriesKey,
  hasWeighted: boolean,
): ProgressSeriesKey {
  if (hasWeighted) {
    return metric === 'reps_volume' ? 'top_set' : metric
  }
  return metric === 'sets_per_week' || metric === 'avg_rpe' || metric === 'reps_volume'
    ? metric
    : 'reps_volume'
}

export function progressSeriesValue(
  session: ProgressSession,
  series: SessionSeriesKey,
): number | null {
  switch (series) {
    case 'top_set':
      return session.top_set_kg
    case 'e1rm':
      return session.e1rm_kg
    case 'volume':
      return session.volume_kg
    case 'reps_volume':
      return session.reps_volume
  }
}

function buildSessionProgressData(
  sessions: ProgressSession[],
  series: SessionSeriesKey,
): ProgressPoint[] {
  return sessions
    .map((session) => ({
      ts: new Date(session.performed_at).getTime(),
      value: progressSeriesValue(session, series),
    }))
    .sort((a, b) => a.ts - b.ts)
}

export function buildProgressData(
  progress: ExerciseProgress,
  series: ProgressSeriesKey,
): ProgressPoint[] {
  switch (series) {
    case 'top_set':
    case 'e1rm':
    case 'volume':
    case 'reps_volume':
      return buildSessionProgressData(progress.sessions, series)
    case 'sets_per_week':
      return progress.sets_per_week.map((point) => ({
        ts: new Date(point.week_start).getTime(),
        value: point.sets,
      }))
    case 'avg_rpe':
      return progress.avg_rpe.map((point) => ({
        ts: new Date(point.performed_at).getTime(),
        value: point.avg_rpe,
      }))
    case 'e1rm_at_reps':
      return (progress.estimated_weight_at_reps ?? []).map((point) => ({
        ts: new Date(point.performed_at).getTime(),
        value: point.weight_kg,
      }))
  }
}

export function buildProgressYDomain(
  points: ProgressPoint[],
  extraValues: number[] = [],
): [number, number] | undefined {
  const values = [
    ...points.flatMap((point) => (point.value === null ? [] : [point.value])),
    ...extraValues,
  ]
  if (values.length === 0) {
    return undefined
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const padding = span > 0 ? span * 0.15 : Math.max(max * 0.1, 1)

  return [Math.max(0, min - padding), max + padding]
}

export function goalTargetValue(goal: ExerciseGoal | null): number | null {
  if (goal === null) {
    return null
  }
  return goal.mode === 'weight' ? goal.weight_kg : goal.reps
}

export function goalAppliesToSeries(goal: ExerciseGoal, series: ProgressSeriesKey): boolean {
  if (goal.mode === 'weight') {
    return series === 'top_set' || series === 'e1rm' || series === 'e1rm_at_reps'
  }
  return series === 'reps_volume'
}

export function buildRequiredRatePoints(
  goal: ExerciseGoal | null,
  timezone: string,
): ProgressPoint[] {
  if (goal === null || goal.required_rate_line === null) {
    return []
  }
  return goal.required_rate_line.flatMap((point) => {
    const value = goal.mode === 'weight' ? point.weight_kg : point.reps
    return value === null
      ? []
      : [{ ts: dateKeyToTimestamp(point.date, timezone), value }]
  })
}

export function mergeRequiredRatePoints(
  points: ProgressPoint[],
  required: ProgressPoint[],
): ProgressPoint[] {
  const rows = new Map(points.map((point) => [point.ts, { ...point }]))
  for (const point of required) {
    const row = rows.get(point.ts)
    if (row === undefined) {
      rows.set(point.ts, { ts: point.ts, value: null, requiredRate: point.value })
    } else {
      row.requiredRate = point.value
    }
  }
  return [...rows.values()].sort((a, b) => a.ts - b.ts)
}

export function formatSeriesAxisValue(
  value: number,
  meta: SeriesMeta,
  unitSystem: UnitSystem,
): string {
  if (meta.isWeight) {
    return formatWeight(value, unitSystem)
  }
  if (meta.unit === 'rpe') {
    return value.toFixed(1)
  }
  return String(value)
}

export function formatSeriesTooltipValue(
  value: number,
  meta: SeriesMeta,
  unitSystem: UnitSystem,
): string {
  if (meta.isWeight) {
    return formatWeight(value, unitSystem)
  }
  if (meta.unit === 'sets') {
    return `${value} sets`
  }
  if (meta.unit === 'rpe') {
    return `RPE ${value.toFixed(1)}`
  }
  return `${value} reps`
}

export function goalShortLabel(goal: ExerciseGoal, unitSystem: UnitSystem): string {
  if (goal.mode === 'weight' && goal.weight_kg !== null) {
    return goal.reps === null
      ? formatWeight(goal.weight_kg, unitSystem)
      : `${formatWeight(goal.weight_kg, unitSystem)} × ${goal.reps}`
  }
  if (goal.reps !== null) {
    return `${goal.reps} ${goal.reps === 1 ? 'rep' : 'reps'}`
  }
  return 'target'
}

export function goalTargetLabel(goal: ExerciseGoal, unitSystem: UnitSystem): string {
  const target = `Goal ${goalShortLabel(goal, unitSystem)}`
  if (goal.target_date === null) {
    return target
  }
  return `${target} by ${formatDateKey(goal.target_date, 'MMM d, yyyy')}`
}

export function goalEstimateText(goal: ExerciseGoal | null): string | null {
  if (goal === null) {
    return null
  }
  if (goal.on_track === 'expired') {
    return 'Target date has passed.'
  }
  if (goal.estimate_date !== null) {
    return `At current rate, you'll hit this on ~${formatDateKey(goal.estimate_date, 'MMM d, yyyy')}`
  }
  return 'Not on track'
}

export function initialGoalMode(exercise: Exercise, hasWeightedSets: boolean): ExerciseGoalMode {
  if (exercise.goal_weight_kg !== null) {
    return 'weight'
  }
  if (exercise.goal_reps_bodyweight !== null) {
    return 'bodyweight'
  }
  return exercise.is_compound || hasWeightedSets ? 'weight' : 'bodyweight'
}

export interface GoalDraft {
  mode: ExerciseGoalMode
  weight: number | null
  reps: number | null
  bodyweightReps: number | null
  targetDate: string | null
}

export function goalDraftError(draft: GoalDraft): string | null {
  if (draft.mode === 'weight') {
    if (draft.weight === null || draft.weight <= 0) {
      return 'Enter a target weight.'
    }
    if (draft.reps !== null && draft.reps < 1) {
      return 'Reps must be at least 1.'
    }
    return null
  }
  if (draft.bodyweightReps === null || draft.bodyweightReps < 1) {
    return 'Enter a target rep count.'
  }
  return null
}

export function goalDraftToPatch(draft: GoalDraft, unitSystem: UnitSystem): ExercisePatch {
  if (draft.mode === 'weight') {
    return {
      goal_weight_kg: displayToKg(draft.weight, unitSystem),
      goal_reps: draft.reps === null ? null : Math.round(draft.reps),
      goal_target_date: draft.targetDate,
      goal_reps_bodyweight: null,
    }
  }
  return {
    goal_weight_kg: null,
    goal_reps: null,
    goal_target_date: draft.targetDate,
    goal_reps_bodyweight:
      draft.bodyweightReps === null ? null : Math.round(draft.bodyweightReps),
  }
}

export function clearedGoalPatch(): ExercisePatch {
  return {
    goal_weight_kg: null,
    goal_reps: null,
    goal_target_date: null,
    goal_reps_bodyweight: null,
  }
}
