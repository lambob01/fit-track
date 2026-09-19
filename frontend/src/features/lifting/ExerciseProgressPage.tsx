import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { ApiError, exercisesApi } from '../../api/client'
import type { ExercisePrs, UnitSystem } from '../../api/types'
import { ChartCard } from '../../components/ChartCard'
import { useSettings } from '../../context/SettingsContext'
import { getPresetRange } from '../../lib/dateRange'
import type { DateRange } from '../../lib/dateRange'
import { formatLocal } from '../../lib/datetime'
import { formatWeight } from '../../lib/units'
import { QueryErrorNotice } from './QueryErrorNotice'
import {
  buildProgressData,
  buildProgressYDomain,
  hasWeightedSessions,
  PROGRESS_METRICS,
  SERIES_META,
} from './progressSeries'
import type { ProgressMetric, ProgressSeriesKey } from './progressSeries'

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
  onChange,
}: {
  metric: ProgressMetric
  onChange: (metric: ProgressMetric) => void
}) {
  return (
    <div role="group" aria-label="Chart metric" className="flex flex-wrap gap-1.5">
      {PROGRESS_METRICS.map(({ key, label }) => (
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

function PrCard({ card, timezone }: { card: PrCardData; timezone: string }) {
  return (
    <section className="rounded-xl border border-line bg-surface-raised p-3">
      <h3 className="text-xs font-medium text-content-muted">{card.label}</h3>
      {card.value === null ||
      card.performedAt === null ||
      card.workoutId === null ? (
        <p className="mt-1 text-xl font-semibold text-content-muted">—</p>
      ) : (
        <Link to={`/lifting/workouts/${card.workoutId}`} className="mt-1 block">
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

export function ExerciseProgressPage() {
  const { id } = useParams<{ id: string }>()
  const { unitSystem, timezone } = useSettings()
  const [range, setRange] = useState<DateRange>(() => getPresetRange('90d', timezone))
  const [metric, setMetric] = useState<ProgressMetric>('top_set')

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

  const prsQuery = useQuery({
    queryKey: ['exercise-prs', id],
    queryFn: () => exercisesApi.prs(id!),
    enabled: id !== undefined,
  })

  const exercise = useMemo(
    () => (exercisesQuery.data ?? []).find((item) => item.id === id),
    [exercisesQuery.data, id],
  )

  const sessions = useMemo(() => progressQuery.data?.sessions ?? [], [progressQuery.data])
  const hasWeighted = useMemo(() => hasWeightedSessions(sessions), [sessions])
  const seriesKey: ProgressSeriesKey = hasWeighted ? metric : 'reps_volume'
  const seriesMeta = SERIES_META[seriesKey]

  const points = useMemo(() => buildProgressData(sessions, seriesKey), [sessions, seriesKey])
  const yDomain = useMemo(() => buildProgressYDomain(points), [points])
  const hasChartData = points.some((point) => point.value !== null)

  const emptyMessage = progressQuery.isPending
    ? 'Loading chart…'
    : sessions.length === 0
      ? 'No sets logged in this range.'
      : 'No data for this metric in this range.'

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
              <PrCard key={card.label} card={card} timezone={timezone} />
            ))}
          </div>
        )}
      </section>

      {progressQuery.isError ? (
        <QueryErrorNotice
          message="Could not load exercise progress."
          detail={errorDetail(progressQuery.error)}
          onRetry={() => void progressQuery.refetch()}
        />
      ) : (
        <ChartCard
          title={hasWeighted ? 'Exercise progress' : 'Reps per session'}
          range={range}
          onRangeChange={setRange}
          hasData={hasChartData}
          emptyMessage={emptyMessage}
          actions={
            hasWeighted ? (
              <MetricToggle metric={metric} onChange={setMetric} />
            ) : sessions.length > 0 ? (
              <span className="min-h-11 rounded-full border border-accent bg-accent px-3 text-xs font-medium leading-11 text-surface">
                Reps
              </span>
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
                seriesMeta.isWeight ? formatWeight(value, unitSystem) : String(value)
              }
              tick={{ fill: 'var(--color-content-muted)', fontSize: 10 }}
              stroke="var(--color-line)"
              width={58}
              allowDecimals={!seriesMeta.isWeight ? false : undefined}
            />
            <Tooltip
              formatter={(value, name) => [
                seriesMeta.isWeight
                  ? formatWeight(Number(value), unitSystem)
                  : `${Number(value)} reps`,
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
            <Line
              type="monotone"
              dataKey="value"
              name={seriesMeta.name}
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--color-accent)' }}
              connectNulls
            />
          </LineChart>
        </ChartCard>
      )}
    </div>
  )
}
