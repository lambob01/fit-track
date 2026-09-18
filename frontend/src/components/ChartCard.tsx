import type { ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'
import type { DateRange } from '../lib/dateRange'
import { DateRangePicker } from './DateRangePicker'

export interface ChartCardProps {
  title: string
  range: DateRange
  onRangeChange: (range: DateRange) => void
  hasData: boolean
  emptyMessage?: string
  height?: number
  className?: string
  children: ReactNode
}

export function ChartCard({
  title,
  range,
  onRangeChange,
  hasData,
  emptyMessage = 'No data for this range.',
  height = 256,
  className,
  children,
}: ChartCardProps) {
  return (
    <section
      className={['rounded-xl border border-line bg-surface-raised p-4', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <DateRangePicker value={range} onChange={onRangeChange} />
      </div>

      <div className="mt-4" style={{ height }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-content-muted">
            {emptyMessage}
          </p>
        )}
      </div>
    </section>
  )
}
