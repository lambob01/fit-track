import type { UnitSystem } from '../../api/types'
import type { CalendarListDay } from '../../lib/calendarRange'
import { formatDateKey } from '../../lib/datetime'
import { formatWeight } from '../../lib/units'

export interface CalendarListProps {
  rows: CalendarListDay[]
  unitSystem: UnitSystem
  today: string
  onSelectDay: (date: string) => void
}

export function CalendarList({ rows, unitSystem, today, onSelectDay }: CalendarListProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-content-muted">No days in this range.</p>
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const isToday = row.date === today

        return (
          <li
            key={row.date}
            className={[
              'overflow-hidden rounded-xl border bg-surface-raised',
              isToday ? 'border-accent' : 'border-line',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={() => onSelectDay(row.date)}
              className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
            >
              <span className="w-12 shrink-0">
                <span
                  className={[
                    'block text-xs',
                    isToday ? 'font-semibold text-accent' : 'text-content-muted',
                  ].join(' ')}
                >
                  {isToday ? 'Today' : formatDateKey(row.date, 'EEE')}
                </span>
                <span className="block text-lg font-semibold tabular-nums">
                  {formatDateKey(row.date, 'd')}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {row.template_name ?? 'Rest'}
                  </span>
                  {row.completed ? (
                    <span className="shrink-0 text-xs text-content-muted">
                      ✓ Done
                      {row.workouts.length > 1 ? ` (${row.workouts.length})` : ''}
                    </span>
                  ) : row.missed ? (
                    <span className="shrink-0 text-xs text-content-muted">Missed</span>
                  ) : null}
                </span>
                {row.workouts.map((workout) => (
                  <span key={workout.id} className="mt-1 block truncate text-xs text-content-muted">
                    {workout.name ?? 'Workout'}
                    {workout.volume_kg > 0 ? ` · ${formatWeight(workout.volume_kg, unitSystem)}` : ''}
                  </span>
                ))}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
