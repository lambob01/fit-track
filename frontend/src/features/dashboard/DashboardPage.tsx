import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, dashboardApi } from '../../api/client'
import { ProgressBar } from '../../components/ProgressBar'
import { QuickAddBar } from '../../components/QuickAddBar'
import { useSettings } from '../../context/SettingsContext'
import { formatLocal } from '../../lib/datetime'
import { formatDistance, formatPace, formatWeight } from '../../lib/units'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-raised p-4">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export function DashboardPage() {
  const { unitSystem, timezone } = useSettings()
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  })

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
      <QuickAddBar />

      {isPending ? (
        <p className="text-sm text-content-muted">Loading dashboard…</p>
      ) : isError ? (
        <div
          role="alert"
          className="rounded-xl border border-line bg-surface-raised p-4 text-sm"
        >
          <p className="font-medium">Could not load the dashboard.</p>
          <p className="mt-1 text-content-muted">
            {error instanceof ApiError ? error.detail : error.message}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 min-h-9 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Latest weight">
            {data.latest_weight === null ? (
              <p className="text-sm text-content-muted">No weight entries yet.</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatWeight(data.latest_weight.weight_kg, unitSystem)}
                </p>
                <p className="mt-1 text-sm text-content-muted">
                  {formatLocal(data.latest_weight.measured_at, timezone, 'MMM d, yyyy')}
                </p>
                {data.latest_weight.body_fat_pct !== null && (
                  <p className="mt-1 text-sm text-content-muted">
                    {data.latest_weight.body_fat_pct}% body fat
                  </p>
                )}
              </>
            )}

            {data.weight_goal !== null && (
              <>
                <p className="mt-2 text-sm text-content-muted">
                  Goal {formatWeight(data.weight_goal.goal_weight_kg, unitSystem)}
                </p>
                {data.latest_weight !== null && (
                  <ProgressBar
                    className="mt-3"
                    label="Goal progress"
                    value={Math.min(
                      data.latest_weight.weight_kg,
                      data.weight_goal.goal_weight_kg,
                    )}
                    max={Math.max(
                      data.latest_weight.weight_kg,
                      data.weight_goal.goal_weight_kg,
                    )}
                  />
                )}
              </>
            )}
          </Card>

          <Card title="Last workout">
            {data.last_workout === null ? (
              <p className="text-sm text-content-muted">No workouts logged yet.</p>
            ) : (
              <Link to={`/lifting/workouts/${data.last_workout.id}`} className="block">
                <p className="font-medium">
                  {data.last_workout.name ?? 'Workout'}
                </p>
                <p className="mt-1 text-sm text-content-muted">
                  {formatLocal(data.last_workout.performed_at, timezone, 'MMM d, yyyy')}
                </p>
                <p className="mt-1 text-sm text-content-muted">
                  {formatWeight(data.last_workout.volume_kg, unitSystem)} volume ·{' '}
                  {data.last_workout.exercise_count} exercises · {data.last_workout.set_count}{' '}
                  sets
                </p>
              </Link>
            )}
          </Card>

          <Card title="This week's running">
            <p className="text-sm text-content-muted">
              {formatLocal(data.week_cardio.week_start, timezone, 'MMM d')} –{' '}
              {formatLocal(data.week_cardio.week_end, timezone, 'MMM d')}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {formatDistance(data.week_cardio.total_distance_m, unitSystem)}
            </p>
            <p className="mt-1 text-sm text-content-muted">
              {data.week_cardio.activity_count === 1
                ? '1 run'
                : `${data.week_cardio.activity_count} runs`}
              {data.week_cardio.avg_pace_s_per_km !== null &&
                ` · ${formatPace(data.week_cardio.avg_pace_s_per_km, unitSystem)} avg`}
            </p>
            <ProgressBar
              className="mt-3"
              label="Weekly goal"
              value={data.week_cardio.total_distance_m}
              max={data.week_cardio.weekly_goal_m}
            />
          </Card>
        </div>
      )}
    </div>
  )
}
