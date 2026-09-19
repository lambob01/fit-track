import type { CardioStreaks } from '../../api/types'
import { useSettings } from '../../context/SettingsContext'
import { formatDateKey } from '../../lib/datetime'
import { formatDistance } from '../../lib/units'

export interface StreakHeatmapProps {
  streaks: CardioStreaks
}

const INTENSITY_CLASSES = [
  'bg-line',
  'bg-accent/30',
  'bg-accent/55',
  'bg-accent/80',
  'bg-accent',
] as const

function intensityIndex(distanceM: number, maxDistanceM: number): number {
  if (distanceM <= 0) {
    return 0
  }
  if (maxDistanceM <= 0) {
    return 1
  }
  const ratio = distanceM / maxDistanceM
  if (ratio > 0.75) {
    return 4
  }
  if (ratio > 0.5) {
    return 3
  }
  if (ratio > 0.25) {
    return 2
  }
  return 1
}

export function StreakHeatmap({ streaks }: StreakHeatmapProps) {
  const { unitSystem } = useSettings()
  const maxDistanceM = Math.max(0, ...streaks.weekly_counts.map((week) => week.distance_m))

  return (
    <section className="rounded-xl border border-line bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Consistency</h2>
        <span className="text-xs text-content-muted">Last 12 weeks</span>
      </div>

      <p className="mt-1 text-sm">
        Current streak:{' '}
        <span className="font-semibold tabular-nums">{streaks.current_weeks}</span>{' '}
        {streaks.current_weeks === 1 ? 'week' : 'weeks'} · Longest:{' '}
        <span className="font-semibold tabular-nums">{streaks.longest_weeks}</span>{' '}
        {streaks.longest_weeks === 1 ? 'week' : 'weeks'}
      </p>

      <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {streaks.weekly_counts.map((week) => {
          const label = `Week of ${formatDateKey(week.week_start, 'MMM d')}: ${week.count} ${
            week.count === 1 ? 'run' : 'runs'
          } · ${formatDistance(week.distance_m, unitSystem)}`
          return (
            <div
              key={week.week_start}
              role="img"
              aria-label={label}
              title={label}
              className={[
                'aspect-square rounded-[3px]',
                INTENSITY_CLASSES[intensityIndex(week.distance_m, maxDistanceM)],
              ].join(' ')}
            />
          )
        })}
      </div>

      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-content-muted">
        <span>Less</span>
        {INTENSITY_CLASSES.map((className) => (
          <span
            key={className}
            aria-hidden="true"
            className={['h-2.5 w-2.5 rounded-[2px]', className].join(' ')}
          />
        ))}
        <span>More</span>
      </div>

      <p className="mt-2 text-xs text-content-muted">
        Shaded by weekly running distance; any week with a run continues the streak. The longest
        streak is all-time.
      </p>
    </section>
  )
}
