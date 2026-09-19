import type { CalendarDay } from '../../api/types'
import { monthGrid } from '../../lib/calendarRange'
import { formatDateKey } from '../../lib/datetime'

export interface MonthGridProps {
  monthDateKey: string
  days: CalendarDay[]
  today: string
  onSelectDay: (day: CalendarDay) => void
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export function MonthGrid({ monthDateKey, days, today, onSelectDay }: MonthGridProps) {
  const daysByDate = new Map(days.map((day) => [day.date, day]))
  const cells = monthGrid(monthDateKey)

  return (
    <section className="rounded-xl border border-line bg-surface-raised p-2">
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            aria-hidden="true"
            className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-content-muted"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-x-0.5 gap-y-1">
        {cells.map((dateKey, index) => {
          if (dateKey === null) {
            return <div key={`blank-${index}`} aria-hidden="true" />
          }

          const day = daysByDate.get(dateKey)
          const isToday = dateKey === today
          const templateName = day?.template_name ?? 'Rest'

          return (
            <button
              key={dateKey}
              type="button"
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${formatDateKey(dateKey, 'EEEE, MMM d')}: ${templateName}`}
              disabled={day === undefined}
              onClick={() => {
                if (day !== undefined) {
                  onSelectDay(day)
                }
              }}
              className={[
                'flex min-h-14 w-full min-w-0 flex-col items-stretch rounded-lg border px-0.5 py-1 text-center transition-colors disabled:opacity-60',
                isToday
                  ? 'border-accent'
                  : day?.completed === true
                    ? 'border-line bg-surface-strong'
                    : 'border-transparent hover:border-line-strong',
              ].join(' ')}
            >
              <span className="flex items-center justify-center gap-0.5 text-xs font-semibold tabular-nums">
                {formatDateKey(dateKey, 'd')}
                {day?.completed === true && (
                  <span aria-hidden="true" className="text-[10px] text-content-muted">
                    ✓
                  </span>
                )}
              </span>
              <span className="mt-0.5 block w-full truncate text-[10px] leading-tight text-content-muted">
                {templateName}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
