import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError, cardioApi } from '../../api/client'
import type { CardioComparison, CardioComparisonTotals, CardioPrs, UnitSystem } from '../../api/types'
import { ProgressBar } from '../../components/ProgressBar'
import { useSettings } from '../../context/SettingsContext'
import {
  addDaysToDateKey,
  formatLocal,
  localDateKey,
  mondayOfDateKey,
  todayDateKey,
} from '../../lib/datetime'
import { formatDuration } from '../../lib/duration'
import { formatDistance, formatPace } from '../../lib/units'
import { QueryErrorNotice } from '../lifting/QueryErrorNotice'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function totalsValue(
  totals: CardioComparisonTotals,
  metric: 'distance' | 'duration' | 'count' | 'pace',
  unitSystem: UnitSystem,
): string {
  if (metric === 'distance') {
    return formatDistance(totals.total_distance_m, unitSystem)
  }
  if (metric === 'duration') {
    return formatDuration(totals.total_duration_s)
  }
  if (metric === 'count') {
    return formatCount(totals.activity_count)
  }
  return totals.avg_pace_s_per_km === null
    ? '—'
    : formatPace(totals.avg_pace_s_per_km, unitSystem)
}

function ComparisonTable({
  comparison,
  unitSystem,
}: {
  comparison: CardioComparison
  unitSystem: UnitSystem
}) {
  const periods = [
    { key: 'this', label: 'This week', totals: comparison.this_week },
    { key: 'last', label: 'Last week', totals: comparison.last_week },
    { key: 'average', label: '4-wk avg', totals: comparison.four_week_average },
  ]
  const metrics = [
    { key: 'distance', label: 'Distance' },
    { key: 'duration', label: 'Time' },
    { key: 'count', label: 'Runs' },
    { key: 'pace', label: 'Avg pace' },
  ] as const

  return (
    <table className="mt-3 w-full text-xs tabular-nums">
      <thead>
        <tr className="text-content-muted">
          <th scope="col" className="py-1 pr-2 text-left font-medium">
            <span className="sr-only">Metric</span>
          </th>
          {periods.map((period) => (
            <th key={period.key} scope="col" className="py-1 pl-2 text-right font-medium">
              {period.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {metrics.map((metric) => (
          <tr key={metric.key} className="border-t border-line">
            <th scope="row" className="py-1.5 pr-2 text-left font-normal text-content-muted">
              {metric.label}
            </th>
            {periods.map((period) => (
              <td key={period.key} className="py-1.5 pl-2 text-right">
                {totalsValue(period.totals, metric.key, unitSystem)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface PrHit {
  key: string
  label: string
  activityId: string
  value: string
}

function prsHitThisWeek(
  prs: CardioPrs,
  timezone: string,
  unitSystem: UnitSystem,
): PrHit[] {
  const monday = mondayOfDateKey(todayDateKey(timezone))
  const nextMonday = addDaysToDateKey(monday, 7)
  const candidates = [
    {
      key: 'fastest_1k',
      label: 'Fastest 1k',
      pr: prs.fastest_1k,
      format: (value: number) => formatDuration(value),
    },
    {
      key: 'fastest_5k',
      label: 'Fastest 5k',
      pr: prs.fastest_5k,
      format: (value: number) => formatDuration(value),
    },
    {
      key: 'fastest_10k',
      label: 'Fastest 10k',
      pr: prs.fastest_10k,
      format: (value: number) => formatDuration(value),
    },
    {
      key: 'longest_distance',
      label: 'Longest distance',
      pr: prs.longest_distance,
      format: (value: number) => formatDistance(value, unitSystem),
    },
    {
      key: 'longest_duration',
      label: 'Longest duration',
      pr: prs.longest_duration,
      format: (value: number) => formatDuration(value),
    },
  ]

  return candidates.flatMap(({ key, label, pr, format }) => {
    if (pr === null) {
      return []
    }
    const day = localDateKey(pr.performed_at, timezone)
    if (day < monday || day >= nextMonday) {
      return []
    }
    return [{ key, label, activityId: pr.cardio_activity_id, value: format(pr.value) }]
  })
}

export function WeeklySummary() {
  const { unitSystem, timezone } = useSettings()

  const weekQuery = useQuery({
    queryKey: ['cardio', 'week'],
    queryFn: () => cardioApi.week(),
  })

  const prsQuery = useQuery({
    queryKey: ['cardio', 'prs'],
    queryFn: () => cardioApi.prs(),
  })

  const streaksQuery = useQuery({
    queryKey: ['cardio', 'streaks'],
    queryFn: () => cardioApi.streaks(),
  })

  const comparisonQuery = useQuery({
    queryKey: ['cardio', 'comparison'],
    queryFn: () => cardioApi.comparison(),
  })

  const prHits =
    prsQuery.data === undefined ? [] : prsHitThisWeek(prsQuery.data, timezone, unitSystem)

  return (
    <section className="rounded-xl border border-line bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">This week</h2>
        {weekQuery.isSuccess && (
          <span className="text-xs text-content-muted">
            {formatLocal(weekQuery.data.week_start, timezone, 'MMM d')} –{' '}
            {formatLocal(weekQuery.data.week_end, timezone, 'MMM d')}
          </span>
        )}
      </div>

      {weekQuery.isPending ? (
        <p className="mt-2 text-sm text-content-muted">Loading this week…</p>
      ) : weekQuery.isError ? (
        <QueryErrorNotice
          className="mt-2"
          message="Could not load this week."
          detail={errorDetail(weekQuery.error)}
          onRetry={() => void weekQuery.refetch()}
        />
      ) : (
        <>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatDistance(weekQuery.data.total_distance_m, unitSystem)}
          </p>
          <p className="mt-1 text-sm text-content-muted">
            {weekQuery.data.activity_count === 1
              ? '1 activity'
              : `${weekQuery.data.activity_count} activities`}
            {weekQuery.data.total_duration_s > 0 &&
              ` · ${formatDuration(weekQuery.data.total_duration_s)}`}
            {weekQuery.data.avg_pace_s_per_km !== null &&
              ` · ${formatPace(weekQuery.data.avg_pace_s_per_km, unitSystem)} avg`}
          </p>
          {streaksQuery.data !== undefined && (
            <p className="mt-1 text-xs text-content-muted">
              Current streak: {streaksQuery.data.current_weeks}{' '}
              {streaksQuery.data.current_weeks === 1 ? 'week' : 'weeks'} · Longest:{' '}
              {streaksQuery.data.longest_weeks}{' '}
              {streaksQuery.data.longest_weeks === 1 ? 'week' : 'weeks'}
            </p>
          )}
          {weekQuery.data.weekly_goal_m !== null && (
            <ProgressBar
              className="mt-3"
              label={`Weekly goal · ${formatDistance(weekQuery.data.weekly_goal_m, unitSystem)}`}
              value={weekQuery.data.total_distance_m}
              max={weekQuery.data.weekly_goal_m}
            />
          )}
        </>
      )}

      <h3 className="mt-4 text-xs font-medium text-content-muted">PRs hit this week</h3>
      {prsQuery.isPending ? (
        <p className="mt-1 text-sm text-content-muted">Loading PRs…</p>
      ) : prsQuery.isError ? (
        <QueryErrorNotice
          className="mt-2"
          message="Could not load PRs."
          detail={errorDetail(prsQuery.error)}
          onRetry={() => void prsQuery.refetch()}
        />
      ) : prHits.length === 0 ? (
        <p className="mt-1 text-sm text-content-muted">No PRs this week.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {prHits.map((hit) => (
            <li key={hit.key}>
              <Link
                to={`/running/${hit.activityId}`}
                className="flex items-center justify-between gap-2"
              >
                <span>{hit.label}</span>
                <span className="tabular-nums">{hit.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-4 text-xs font-medium text-content-muted">
        This week vs. last week vs. 4-week average
      </h3>
      {comparisonQuery.isPending ? (
        <p className="mt-1 text-sm text-content-muted">Loading comparison…</p>
      ) : comparisonQuery.isError ? (
        <QueryErrorNotice
          className="mt-2"
          message="Could not load the weekly comparison."
          detail={errorDetail(comparisonQuery.error)}
          onRetry={() => void comparisonQuery.refetch()}
        />
      ) : (
        <ComparisonTable comparison={comparisonQuery.data} unitSystem={unitSystem} />
      )}
    </section>
  )
}
