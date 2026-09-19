import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WeightBucket, WeightSeries } from '../../api/types'
import { ChartCard } from '../../components/ChartCard'
import { useSettings } from '../../context/SettingsContext'
import type { DateRange } from '../../lib/dateRange'
import { formatLocal } from '../../lib/datetime'
import { formatWeight } from '../../lib/units'

const BUCKETS: { key: WeightBucket; short: string; label: string }[] = [
  { key: 'day', short: 'D', label: 'Day' },
  { key: 'week', short: 'W', label: 'Week' },
  { key: 'month', short: 'M', label: 'Month' },
  { key: 'year', short: 'Y', label: 'Year' },
]

interface ChartRow {
  ts: number
  weight: number | null
  average: number | null
  trend: number | null
}

function buildChartData(series: WeightSeries): ChartRow[] {
  const rows = new Map<number, ChartRow>()

  function rowAt(iso: string): ChartRow {
    const ts = new Date(iso).getTime()
    const existing = rows.get(ts)
    if (existing !== undefined) {
      return existing
    }
    const row: ChartRow = { ts, weight: null, average: null, trend: null }
    rows.set(ts, row)
    return row
  }

  for (const point of series.points) {
    rowAt(point.measured_at).weight = point.weight_kg
  }

  for (const point of series.moving_average) {
    rowAt(point.measured_at).average = point.value
  }

  if (series.trend !== null && series.moving_average.length > 0) {
    const first = series.moving_average[0]
    const last = series.moving_average[series.moving_average.length - 1]
    rowAt(first.measured_at).trend = series.trend.from_value
    rowAt(last.measured_at).trend = series.trend.to_value
  }

  return [...rows.values()].sort((a, b) => a.ts - b.ts)
}

function buildYDomain(series: WeightSeries | undefined): [number, number] | undefined {
  if (series === undefined || series.points.length === 0) {
    return undefined
  }

  const values = [
    ...series.points.map((point) => point.weight_kg),
    ...series.moving_average.map((point) => point.value),
  ]

  if (series.trend !== null) {
    values.push(series.trend.from_value, series.trend.to_value)
  }

  if (series.goal_weight_kg !== null) {
    values.push(series.goal_weight_kg)
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.15, 0.5)

  return [min - padding, max + padding]
}

function BucketToggle({
  bucket,
  onChange,
}: {
  bucket: WeightBucket
  onChange: (bucket: WeightBucket) => void
}) {
  return (
    <div role="group" aria-label="Bucket size" className="flex gap-1.5">
      {BUCKETS.map(({ key, short, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={bucket === key}
          aria-label={label}
          title={label}
          onClick={() => onChange(key)}
          className={[
            'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors',
            bucket === key
              ? 'border-accent bg-accent text-surface'
              : 'border-line bg-surface text-content-muted hover:border-content-muted hover:text-content',
          ].join(' ')}
        >
          {short}
        </button>
      ))}
    </div>
  )
}

export interface WeightChartProps {
  series: WeightSeries | undefined
  isPending: boolean
  range: DateRange
  onRangeChange: (range: DateRange) => void
  bucket: WeightBucket
  onBucketChange: (bucket: WeightBucket) => void
}

export function WeightChart({
  series,
  isPending,
  range,
  onRangeChange,
  bucket,
  onBucketChange,
}: WeightChartProps) {
  const { unitSystem, timezone } = useSettings()
  const hasData = series !== undefined && series.points.length > 0
  const data = series === undefined ? [] : buildChartData(series)
  const yDomain = buildYDomain(series)
  const goal = series?.goal_weight_kg ?? null
  const tickPattern = bucket === 'year' ? 'yyyy' : bucket === 'month' ? 'MMM yyyy' : 'MMM d'

  return (
    <ChartCard
      title="Weight trend"
      range={range}
      onRangeChange={onRangeChange}
      hasData={hasData}
      emptyMessage={isPending ? 'Loading chart…' : 'No weight entries in this range.'}
      actions={<BucketToggle bucket={bucket} onChange={onBucketChange} />}
    >
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(value: number) =>
            formatLocal(new Date(value).toISOString(), timezone, tickPattern)
          }
          tick={{ fill: 'var(--color-content-muted)', fontSize: 10 }}
          stroke="var(--color-line)"
          minTickGap={24}
        />
        <YAxis
          domain={yDomain}
          tickFormatter={(value: number) => formatWeight(value, unitSystem)}
          tick={{ fill: 'var(--color-content-muted)', fontSize: 10 }}
          stroke="var(--color-line)"
          width={58}
        />
        <Tooltip
          formatter={(value, name) => [formatWeight(Number(value), unitSystem), name]}
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
        {goal !== null && (
          <ReferenceLine
            y={goal}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{
              value: `Goal ${formatWeight(goal, unitSystem)}`,
              position: 'insideBottomRight',
              fill: '#f59e0b',
              fontSize: 11,
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="weight"
          name="Weight"
          stroke="var(--color-accent)"
          strokeWidth={2}
          dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--color-accent)' }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="average"
          name="7-day avg"
          stroke="#818cf8"
          strokeWidth={1.5}
          dot={false}
          connectNulls
        />
        <Line
          type="linear"
          dataKey="trend"
          name="Trend"
          stroke="#f472b6"
          strokeWidth={1.5}
          strokeDasharray="6 4"
          dot={false}
          connectNulls
        />
      </LineChart>
    </ChartCard>
  )
}
