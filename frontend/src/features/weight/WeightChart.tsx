import { useState } from 'react'
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
import {
  CHART_AXIS_PROPS,
  CHART_GRID_PROPS,
  CHART_TOOLTIP_PROPS,
  SEMANTIC_LINES,
  seriesStyle,
} from '../../lib/chartTheme'
import type { DateRange } from '../../lib/dateRange'
import { BMI_DISCLAIMER, calculateBmi } from '../../lib/bmi'
import { dateKeyToTimestamp, formatLocal } from '../../lib/datetime'
import { DAY_MS, DAYS_PER_MONTH, DAYS_PER_WEEK, projectWeight } from '../../lib/goals'
import { formatWeight } from '../../lib/units'
import { WeightLegend } from './WeightLegend'

const BUCKETS: { key: WeightBucket; short: string; label: string }[] = [
  { key: 'day', short: 'D', label: 'Day' },
  { key: 'week', short: 'W', label: 'Week' },
  { key: 'month', short: 'M', label: 'Month' },
  { key: 'year', short: 'Y', label: 'Year' },
]

type OverlayKey = 'final' | 'weekly' | 'monthly' | 'dated'

export interface ChartRow {
  ts: number
  weight: number | null
  average: number | null
  trend: number | null
  weeklyProjection: number | null
  monthlyProjection: number | null
  requiredRate: number | null
  bmi: number | null
}

interface BuildOptions {
  range: DateRange
  showWeekly: boolean
  showMonthly: boolean
  showDated: boolean
  heightCm: number | null
  timezone: string
}

const WEIGHT_KEYS = [
  'weight',
  'average',
  'trend',
  'weeklyProjection',
  'monthlyProjection',
  'requiredRate',
] as const

// eslint-disable-next-line react-refresh/only-export-components -- pure builder is unit-tested separately
export function buildChartData(series: WeightSeries, options: BuildOptions): ChartRow[] {
  const rows = new Map<number, ChartRow>()

  function rowAt(ts: number): ChartRow {
    const existing = rows.get(ts)
    if (existing !== undefined) {
      return existing
    }
    const row: ChartRow = {
      ts,
      weight: null,
      average: null,
      trend: null,
      weeklyProjection: null,
      monthlyProjection: null,
      requiredRate: null,
      bmi: null,
    }
    rows.set(ts, row)
    return row
  }

  for (const point of series.points) {
    const row = rowAt(new Date(point.measured_at).getTime())
    row.weight = point.weight_kg
    if (options.heightCm !== null) {
      row.bmi = calculateBmi(point.weight_kg, options.heightCm)
    }
  }

  for (const point of series.moving_average) {
    rowAt(new Date(point.measured_at).getTime()).average = point.value
  }

  if (series.trend !== null && series.moving_average.length > 0) {
    const first = series.moving_average[0]
    const last = series.moving_average[series.moving_average.length - 1]
    rowAt(new Date(first.measured_at).getTime()).trend = series.trend.from_value
    rowAt(new Date(last.measured_at).getTime()).trend = series.trend.to_value
  }

  if (options.showDated) {
    for (const point of series.required_rate_line ?? []) {
      rowAt(dateKeyToTimestamp(point.date, options.timezone)).requiredRate = point.weight_kg
    }
  }

  const latest = series.points[series.points.length - 1]
  if ((options.showWeekly || options.showMonthly) && latest !== undefined) {
    const startTs = new Date(latest.measured_at).getTime()
    const requiredLine = series.required_rate_line ?? []
    const horizon =
      requiredLine.length > 0
        ? dateKeyToTimestamp(requiredLine[requiredLine.length - 1].date, options.timezone)
        : Math.max(new Date(series.to).getTime(), startTs) + 12 * DAYS_PER_WEEK * DAY_MS

    if (options.showWeekly && series.goals.rate_kg_per_week !== null) {
      const points = projectWeight(
        startTs,
        horizon,
        latest.weight_kg,
        series.goals.rate_kg_per_week / DAYS_PER_WEEK,
      )
      for (const point of points) {
        rowAt(point.ts).weeklyProjection = point.value
      }
    }

    if (
      options.showMonthly &&
      series.goals.monthly.mode === 'rate' &&
      series.goals.monthly.rate_kg_per_month !== null
    ) {
      const points = projectWeight(
        startTs,
        horizon,
        latest.weight_kg,
        series.goals.monthly.rate_kg_per_month / DAYS_PER_MONTH,
      )
      for (const point of points) {
        rowAt(point.ts).monthlyProjection = point.value
      }
    }
  }

  const rangeFrom = new Date(options.range.from).getTime()
  const rangeTo = new Date(options.range.to).getTime()

  const clipped = [...rows.values()].filter(
    (row) => row.ts >= rangeFrom && row.ts <= rangeTo,
  )
  const requiredRatePointCount = clipped.filter((row) => row.requiredRate !== null).length
  if (requiredRatePointCount < 2) {
    for (const row of clipped) {
      row.requiredRate = null
    }
  }

  return clipped.sort((a, b) => a.ts - b.ts)
}

function buildYDomain(rows: ChartRow[], extra: number[]): [number, number] | undefined {
  const values = [...extra]

  for (const row of rows) {
    for (const key of WEIGHT_KEYS) {
      const value = row[key]
      if (value !== null) {
        values.push(value)
      }
    }
  }

  if (values.length === 0) {
    return undefined
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.15, 0.5)

  return [min - padding, max + padding]
}

function buildBmiDomain(rows: ChartRow[]): [number, number] | undefined {
  const values = rows.flatMap((row) => (row.bmi === null ? [] : [row.bmi]))

  if (values.length === 0) {
    return undefined
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.1, 1)

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

function OverlayToggle({
  label,
  active,
  onToggle,
}: {
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={[
        'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-accent bg-accent text-surface'
          : 'border-line bg-surface text-content-muted hover:border-content-muted hover:text-content',
      ].join(' ')}
    >
      {label}
    </button>
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
  const { unitSystem, timezone, heightCm } = useSettings()
  const [overrides, setOverrides] = useState<Partial<Record<OverlayKey, boolean>>>({})

  const hasData = series !== undefined && series.points.length > 0
  const finalKg = series?.goals.final_weight_kg ?? series?.goal_weight_kg ?? null
  const weeklyRate = series?.goals.rate_kg_per_week ?? null
  const monthly = series?.goals.monthly ?? null
  const monthlyTargetKg = monthly !== null && monthly.mode === 'target' ? monthly.target_kg : null
  const monthlyRateKg = monthly !== null && monthly.mode === 'rate' ? monthly.rate_kg_per_month : null
  const hasDatedTarget = (series?.required_rate_line?.length ?? 0) > 0

  const defaults: Record<OverlayKey, boolean> = {
    final: !hasDatedTarget,
    weekly: false,
    monthly: false,
    dated: hasDatedTarget,
  }
  const shown: Record<OverlayKey, boolean> = { ...defaults, ...overrides }

  function toggleOverlay(key: OverlayKey) {
    setOverrides((current) => ({ ...current, [key]: !shown[key] }))
  }

  const data =
    series === undefined
      ? []
      : buildChartData(series, {
          range,
          showWeekly: shown.weekly,
          showMonthly: shown.monthly,
          showDated: shown.dated,
          heightCm,
          timezone,
        })

  const showRequiredRateLine = data.some((row) => row.requiredRate !== null)

  const extraValues: number[] = []
  if (shown.final && finalKg !== null) {
    extraValues.push(finalKg)
  }
  if (shown.monthly && monthlyTargetKg !== null) {
    extraValues.push(monthlyTargetKg)
  }

  const yDomain = buildYDomain(data, extraValues)
  const showBmi = heightCm !== null && hasData
  const bmiDomain = showBmi ? buildBmiDomain(data) : undefined
  const tickPattern = bucket === 'year' ? 'yyyy' : bucket === 'month' ? 'MMM yyyy' : 'MMM d'

  return (
    <>
      <ChartCard
        title="Weight trend"
        range={range}
        onRangeChange={onRangeChange}
        hasData={hasData}
        emptyMessage={isPending ? 'Loading chart…' : 'No weight entries in this range.'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {finalKg !== null && (
              <OverlayToggle
                label="Final"
                active={shown.final}
                onToggle={() => toggleOverlay('final')}
              />
            )}
            {weeklyRate !== null && hasData && (
              <OverlayToggle
                label="Weekly"
                active={shown.weekly}
                onToggle={() => toggleOverlay('weekly')}
              />
            )}
            {(monthlyTargetKg !== null || monthlyRateKg !== null) && hasData && (
              <OverlayToggle
                label="Monthly"
                active={shown.monthly}
                onToggle={() => toggleOverlay('monthly')}
              />
            )}
            {hasDatedTarget && (
              <OverlayToggle
                label="Target date"
                active={shown.dated}
                onToggle={() => toggleOverlay('dated')}
              />
            )}
            <BucketToggle bucket={bucket} onChange={onBucketChange} />
          </div>
        }
      >
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value: number) =>
              formatLocal(new Date(value).toISOString(), timezone, tickPattern)
            }
            {...CHART_AXIS_PROPS}
            minTickGap={24}
          />
          <YAxis
            yAxisId="weight"
            domain={yDomain}
            tickFormatter={(value: number) => formatWeight(value, unitSystem)}
            {...CHART_AXIS_PROPS}
            width={58}
          />
          {showBmi && (
            <YAxis
              yAxisId="bmi"
              orientation="right"
              domain={bmiDomain}
              tickFormatter={(value: number) => value.toFixed(0)}
              {...CHART_AXIS_PROPS}
              width={32}
            />
          )}
          <Tooltip
            formatter={(value, name) => [
              name === 'BMI'
                ? Number(value).toFixed(1)
                : formatWeight(Number(value), unitSystem),
              name,
            ]}
            labelFormatter={(label) =>
              typeof label === 'number'
                ? formatLocal(new Date(label).toISOString(), timezone, 'MMM d, yyyy')
                : String(label)
            }
            {...CHART_TOOLTIP_PROPS}
          />
          {shown.final && finalKg !== null && (
            <ReferenceLine
              yAxisId="weight"
              y={finalKg}
              {...SEMANTIC_LINES.goal}
              label={{
                value: `Goal ${formatWeight(finalKg, unitSystem)}`,
                position: 'insideBottomRight',
                fill: 'var(--color-content-muted)',
                fontSize: 11,
              }}
            />
          )}
          {shown.monthly && monthlyTargetKg !== null && (
            <ReferenceLine
              yAxisId="weight"
              y={monthlyTargetKg}
              {...SEMANTIC_LINES.goalDashed}
              label={{
                value: `Monthly ${formatWeight(monthlyTargetKg, unitSystem)}`,
                position: 'insideTopRight',
                fill: 'var(--color-content-muted)',
                fontSize: 11,
              }}
            />
          )}
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="weight"
            name="Weight"
            {...seriesStyle(0)}
            connectNulls
          />
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="average"
            name="7-day avg"
            {...SEMANTIC_LINES.movingAverage}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="weight"
            type="linear"
            dataKey="trend"
            name="Trend"
            {...SEMANTIC_LINES.trend}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="weight"
            type="linear"
            dataKey="weeklyProjection"
            name="Weekly projection"
            {...SEMANTIC_LINES.weeklyProjection}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="weight"
            type="linear"
            dataKey="monthlyProjection"
            name="Monthly projection"
            {...SEMANTIC_LINES.monthlyProjection}
            dot={false}
            connectNulls
          />
          {showRequiredRateLine && (
            <Line
              yAxisId="weight"
              type="linear"
              dataKey="requiredRate"
              name="Required rate"
              {...SEMANTIC_LINES.requiredRate}
              dot={false}
              connectNulls
            />
          )}
          {showBmi && (
            <Line
              yAxisId="bmi"
              type="linear"
              dataKey="bmi"
              name="BMI"
              {...seriesStyle(1, 1.5)}
              connectNulls
            />
          )}
        </LineChart>
      </ChartCard>
      {hasData && (
        <WeightLegend
          showWeekly={shown.weekly}
          showMonthly={shown.monthly}
          showDated={shown.dated && showRequiredRateLine}
          showFinal={shown.final}
          hasDatedTarget={hasDatedTarget}
          finalKg={finalKg}
          monthlyTargetKg={monthlyTargetKg}
          weeklyRateKg={weeklyRate}
          monthlyRateKg={monthlyRateKg}
          showBmi={showBmi}
        />
      )}
      {showBmi && <p className="text-xs text-content-muted">{BMI_DISCLAIMER}</p>}
    </>
  )
}
