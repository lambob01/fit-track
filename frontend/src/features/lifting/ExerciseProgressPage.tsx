import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ApiError, exercisesApi } from '../../api/client'
import type { ExercisePrs, UnitSystem } from '../../api/types'
import { ChartCard } from '../../components/ChartCard'
import { useSettings } from '../../context/SettingsContext'
import { getPresetRange } from '../../lib/dateRange'
import type { DateRange } from '../../lib/dateRange'
import { formatLocal } from '../../lib/datetime'
import { formatWeight } from '../../lib/units'
import { ExerciseGoalForm } from './ExerciseGoalForm'
import { QueryErrorNotice } from './QueryErrorNotice'
import {
  BODYWEIGHT_PROGRESS_METRICS,
  buildProgressData,
  buildProgressYDomain,
  buildRequiredRatePoints,
  effectiveSeriesKey,
  formatSeriesAxisValue,
  formatSeriesTooltipValue,
  goalAppliesToSeries,
  goalEstimateText,
  goalShortLabel,
  goalTargetLabel,
  goalTargetValue,
  hasWeightedSessions,
  mergeRequiredRatePoints,
  PROGRESS_METRICS,
  SERIES_META,
} from './progressSeries'
import type { ProgressSeriesKey, SeriesMeta } from './progressSeries'

const REP_CHOICES = Array.from({ length: 12 }, (_, index) => index + 1)

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

function MetricToggle({
  metric,
  metrics,
  onChange,
}: {
  metric: ProgressSeriesKey
  metrics: { key: ProgressSeriesKey; label: string }[]
  onChange: (metric: ProgressSeriesKey) => void
}) {
  return (
    <div role="group" aria-label="Chart metric" className="flex flex-wrap gap-1.5">
      {metrics.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={metric === key}
          onClick={() => onChange(key)}
          className={[
            'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors',
            metric === key
              ? 'border-accent bg-accent text-surface'
              : 'border-line bg-surface text-content-muted hover:border-content-muted hover:text-content',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function RepPicker({
  reps,
  onChange,
}: {
  reps: number
  onChange: (reps: number) => void
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-xs font-medium text-content-muted">
      Reps
      <select
        value={reps}
        aria-label="Rep count for e1RM"
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 rounded-lg border border-line bg-surface px-2 text-sm text-content focus:border-accent focus:outline-none"
      >
        {REP_CHOICES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  )
}

interface PrCardData {
  label: string
  value: string | null
  detail: string | null
  performedAt: string | null
  workoutId: string | null
}

function buildPrCards(prs: ExercisePrs, unitSystem: UnitSystem): PrCardData[] {
  const heaviest = prs.heaviest_weight
  const bestE1rm = prs.best_e1rm
  const bestReps = prs.best_reps
  const bestVolume = prs.best_session_volume

  return [
    {
      label: 'Heaviest weight',
      value: heaviest === null ? null : formatWeight(heaviest.weight_kg, unitSystem),
      detail:
        heaviest === null
          ? null
          : `${heaviest.reps} ${heaviest.reps === 1 ? 'rep' : 'reps'}`,
      performedAt: heaviest?.performed_at ?? null,
      workoutId: heaviest?.workout_id ?? null,
    },
    {
      label: 'Best e1RM',
      value: bestE1rm === null ? null : formatWeight(bestE1rm.e1rm_kg, unitSystem),
      detail:
        bestE1rm === null
          ? null
          : `${formatWeight(bestE1rm.weight_kg, unitSystem)} × ${bestE1rm.reps}`,
      performedAt: bestE1rm?.performed_at ?? null,
      workoutId: bestE1rm?.workout_id ?? null,
    },
    {
      label: 'Best reps',
      value: bestReps === null ? null : `${bestReps.reps} ${bestReps.reps === 1 ? 'rep' : 'reps'}`,
      detail:
        bestReps === null
          ? null
          : bestReps.weight_kg === null
            ? 'Bodyweight'
            : formatWeight(bestReps.weight_kg, unitSystem),
      performedAt: bestReps?.performed_at ?? null,
      workoutId: bestReps?.workout_id ?? null,
    },
    {
      label: 'Best session volume',
      value: bestVolume === null ? null : formatWeight(bestVolume.volume_kg, unitSystem),
      detail: bestVolume === null ? null : 'Total weight × reps',
      performedAt: bestVolume?.performed_at ?? null,
      workoutId: bestVolume?.workout_id ?? null,
    },
  ]
}

function PrCard({
  card,
  timezone,
  range,
}: {
  card: PrCardData
  timezone: string
  range: DateRange
}) {
  return (
    <section className="rounded-xl border border-line bg-surface-raised p-3">
      <h3 className="text-xs font-medium text-content-muted">{card.label}</h3>
      {card.value === null ||
      card.performedAt === null ||
      card.workoutId === null ? (
        <p className="mt-1 text-xl font-semibold text-content-muted">—</p>
      ) : (
        <Link
          to={`/lifting/workouts/${card.workoutId}`}
          state={{ range }}
          className="mt-1 block"
        >
          <p className="text-xl font-semibold tabular-nums">{card.value}</p>
          {card.detail !== null && (
            <p className="mt-0.5 text-xs text-content-muted">{card.detail}</p>
          )}
          <p className="mt-0.5 text-xs text-content-muted">
            {formatLocal(card.performedAt, timezone, 'MMM d, yyyy')}
          </p>
        </Link>
      )}
    </section>
  )
}

function chartTitle(seriesKey: ProgressSeriesKey, repCount: number): string {
  if (seriesKey === 'e1rm_at_reps') {
    return `e1RM at ${repCount} reps`
  }
  return SERIES_META[seriesKey].name
}

function yAllowDecimals(meta: SeriesMeta): boolean | undefined {
  if (meta.isWeight) {
    return undefined
  }
  return meta.unit === 'rpe'
}

export function ExerciseProgressPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const { unitSystem, timezone } = useSettings()
  const [range, setRange] = useState<DateRange>(() => {
    const state = location.state as { range?: DateRange } | null
    return state?.range ?? getPresetRange('90d', timezone)
  })
  const [metric, setMetric] = useState<ProgressSeriesKey>('top_set')
  const [repCount, setRepCount] = useState(5)
  const [goalFormOpen, setGoalFormOpen] = useState(false)

  const exercisesQuery = useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: () => exercisesApi.list({ include_archived: true, limit: 500 }),
    staleTime: 5 * 60 * 1000,
  })

  const progressQuery = useQuery({
    queryKey: ['exercise-progress', id, range.from, range.to],
    queryFn: () => exercisesApi.progress(id!, range),
    enabled: id !== undefined,
  })

  const progress = progressQuery.data
  const sessions = useMemo(() => progress?.sessions ?? [], [progress])
  const hasWeighted = useMemo(() => hasWeightedSessions(sessions), [sessions])
  const seriesKey = effectiveSeriesKey(metric, hasWeighted)

  const repsQuery = useQuery({
    queryKey: ['exercise-progress-reps', id, range.from, range.to, repCount],
    queryFn: () => exercisesApi.progress(id!, { ...range, reps: repCount }),
    enabled: id !== undefined && seriesKey === 'e1rm_at_reps',
  })

  const prsQuery = useQuery({
    queryKey: ['exercise-prs', id],
    queryFn: () => exercisesApi.prs(id!),
    enabled: id !== undefined,
  })

  const exercise = useMemo(
    () => (exercisesQuery.data ?? []).find((item) => item.id === id),
    [exercisesQuery.data, id],
  )

  const seriesMeta = SERIES_META[seriesKey]

  const goal = progress?.goal ?? null
  const goalValue = goalTargetValue(goal)
  const showGoalOverlay =
    goal !== null && goalValue !== null && goalAppliesToSeries(goal, seriesKey)

  const estimatedPoints =
    seriesKey === 'e1rm_at_reps' ? (repsQuery.data?.estimated_weight_at_reps ?? null) : null
  const basePoints = useMemo(() => {
    if (progress === undefined) {
      return []
    }
    return buildProgressData(
      seriesKey === 'e1rm_at_reps'
        ? { ...progress, estimated_weight_at_reps: estimatedPoints }
        : progress,
      seriesKey,
    )
  }, [progress, seriesKey, estimatedPoints])
  const requiredPoints = useMemo(
    () => (showGoalOverlay && goal !== null ? buildRequiredRatePoints(goal, timezone) : []),
    [showGoalOverlay, goal, timezone],
  )
  const points = useMemo(
    () => mergeRequiredRatePoints(basePoints, requiredPoints),
    [basePoints, requiredPoints],
  )
  const yDomain = useMemo(
    () =>
      buildProgressYDomain(
        points,
        showGoalOverlay && goalValue !== null ? [goalValue] : [],
      ),
    [points, showGoalOverlay, goalValue],
  )
  const hasChartData = points.some((point) => point.value !== null)
  const repsPending = seriesKey === 'e1rm_at_reps' && repsQuery.isPending

  const emptyMessage =
    progressQuery.isPending || repsPending
      ? 'Loading chart…'
      : sessions.length === 0
        ? 'No sets logged in this range.'
        : seriesKey === 'avg_rpe'
          ? 'No RPE data in this range.'
          : seriesKey === 'e1rm_at_reps'
            ? 'No e1RM data in this range.'
            : 'No data for this metric in this range.'

  const chartFailed = progressQuery.isError || (seriesKey === 'e1rm_at_reps' && repsQuery.isError)
  const chartError = progressQuery.error ?? repsQuery.error

  function refetchChart() {
    void progressQuery.refetch()
    if (seriesKey === 'e1rm_at_reps') {
      void repsQuery.refetch()
    }
  }

  const exerciseMeta =
    exercise === undefined
      ? null
      : [
          exercise.category,
          exercise.muscle_group,
          exercise.equipment !== 'other' ? exercise.equipment : null,
        ]
          .filter((value) => value !== null && value !== '' && value !== 'other')
          .join(' · ')

  const prCards = prsQuery.data === undefined ? [] : buildPrCards(prsQuery.data, unitSystem)
  const estimateText = goalEstimateText(goal)

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/lifting/exercises"
          className="text-sm font-medium text-content-muted transition-colors hover:text-content"
        >
          ← Exercise library
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">
          {exercise?.name ?? 'Exercise'}
        </h1>
        {exerciseMeta !== null && exerciseMeta !== '' && (
          <p className="mt-0.5 text-xs text-content-muted">{exerciseMeta}</p>
        )}
      </div>

      {exercisesQuery.isError && (
        <QueryErrorNotice
          message="Exercise details could not be loaded."
          detail={errorDetail(exercisesQuery.error)}
          onRetry={() => void exercisesQuery.refetch()}
        />
      )}

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">Goal</h2>
            {goal === null ? (
              <p className="mt-1 text-sm text-content-muted">No goal set.</p>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium">
                  {goalTargetLabel(goal, unitSystem)}
                </p>
                {estimateText !== null && (
                  <p className="mt-0.5 text-xs text-content-muted">{estimateText}</p>
                )}
              </>
            )}
          </div>
          {exercise !== undefined && (
            <button
              type="button"
              onClick={() => setGoalFormOpen(true)}
              className="min-h-11 shrink-0 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              {goal === null ? 'Set goal' : 'Edit goal'}
            </button>
          )}
        </div>
      </section>

      {goalFormOpen && exercise !== undefined && (
        <ExerciseGoalForm
          exercise={exercise}
          hasWeightedSets={hasWeighted}
          onClose={() => setGoalFormOpen(false)}
        />
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">Personal records</h2>
          <span className="text-xs text-content-muted">All time</span>
        </div>

        {prsQuery.isPending ? (
          <p className="text-sm text-content-muted">Loading records…</p>
        ) : prsQuery.isError ? (
          <QueryErrorNotice
            message="Could not load personal records."
            detail={errorDetail(prsQuery.error)}
            onRetry={() => void prsQuery.refetch()}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {prCards.map((card) => (
              <PrCard key={card.label} card={card} timezone={timezone} range={range} />
            ))}
          </div>
        )}
      </section>

      {chartFailed ? (
        <QueryErrorNotice
          message="Could not load exercise progress."
          detail={errorDetail(chartError)}
          onRetry={refetchChart}
        />
      ) : (
        <ChartCard
          title={chartTitle(seriesKey, repCount)}
          range={range}
          onRangeChange={setRange}
          hasData={hasChartData}
          emptyMessage={emptyMessage}
          actions={
            hasWeighted || sessions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <MetricToggle
                  metric={seriesKey}
                  metrics={hasWeighted ? PROGRESS_METRICS : BODYWEIGHT_PROGRESS_METRICS}
                  onChange={setMetric}
                />
                {seriesKey === 'e1rm_at_reps' && (
                  <RepPicker reps={repCount} onChange={setRepCount} />
                )}
              </div>
            ) : undefined
          }
        >
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value: number) =>
                formatLocal(new Date(value).toISOString(), timezone, 'MMM d')
              }
              tick={{ fill: 'var(--color-content-muted)', fontSize: 10 }}
              stroke="var(--color-line)"
              minTickGap={24}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(value: number) =>
                formatSeriesAxisValue(value, seriesMeta, unitSystem)
              }
              tick={{ fill: 'var(--color-content-muted)', fontSize: 10 }}
              stroke="var(--color-line)"
              width={58}
              allowDecimals={yAllowDecimals(seriesMeta)}
            />
            <Tooltip
              formatter={(value, name) => [
                formatSeriesTooltipValue(Number(value), seriesMeta, unitSystem),
                name,
              ]}
              labelFormatter={(label) =>
                typeof label === 'number'
                  ? formatLocal(new Date(label).toISOString(), timezone, 'MMM d, yyyy')
                  : String(label)
              }
              contentStyle={{
                backgroundColor: 'var(--color-surface-raised)',
                border: '1px solid var(--color-line)',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
              }}
              labelStyle={{ color: 'var(--color-content-muted)' }}
              itemStyle={{ color: 'var(--color-content)' }}
            />
            {showGoalOverlay && goal !== null && goalValue !== null && requiredPoints.length === 0 && (
              <ReferenceLine
                y={goalValue}
                stroke="var(--color-content-muted)"
                strokeWidth={1}
                label={{
                  value: `Goal ${goalShortLabel(goal, unitSystem)}`,
                  position: 'insideBottomRight',
                  fill: 'var(--color-content-muted)',
                  fontSize: 11,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              name={seriesMeta.name}
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--chart-1)' }}
              connectNulls
            />
            <Line
              type="linear"
              dataKey="requiredRate"
              name="Required rate"
              stroke="var(--color-content-muted)"
              strokeWidth={1.5}
              strokeDasharray="2 4"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ChartCard>
      )}
    </div>
  )
}
