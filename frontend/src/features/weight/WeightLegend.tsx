import {
  markerDot,
  SEMANTIC_LINES,
  seriesChannel,
  seriesStyle,
  type MarkerShape,
} from '../../lib/chartTheme'

export interface LegendVisibility {
  showWeight: boolean
  showAverage: boolean
  showTrend: boolean
  showBmi: boolean
  showWeekly: boolean
  showMonthly: boolean
  showDated: boolean
  showFinal: boolean
  hasDatedTarget: boolean
  finalKg: number | null
  monthlyTargetKg: number | null
  weeklyRateKg: number | null
  monthlyRateKg: number | null
}

export interface LegendItem {
  key: string
  label: string
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
  marker: MarkerShape | null
}

// eslint-disable-next-line react-refresh/only-export-components -- pure builder is unit-tested separately
export function buildLegendItems(visibility: LegendVisibility): LegendItem[] {
  const weight = seriesStyle(0)
  const bmi = seriesStyle(1, 1.5)

  const items: LegendItem[] = []

  if (visibility.showWeight) {
    items.push({
      key: 'weight',
      label: 'Weight',
      stroke: weight.stroke,
      strokeWidth: weight.strokeWidth,
      marker: seriesChannel(0).marker,
    })
  }

  if (visibility.showAverage) {
    items.push({
      key: 'average',
      label: '7-day avg',
      ...SEMANTIC_LINES.movingAverage,
      marker: null,
    })
  }

  if (visibility.showTrend) {
    items.push({
      key: 'trend',
      label: 'Trend',
      ...SEMANTIC_LINES.trend,
      marker: null,
    })
  }

  if (visibility.showWeekly && visibility.weeklyRateKg !== null) {
    items.push({
      key: 'weekly',
      label: 'Weekly projection',
      ...SEMANTIC_LINES.weeklyProjection,
      marker: null,
    })
  }

  if (visibility.showMonthly && visibility.monthlyRateKg !== null) {
    items.push({
      key: 'monthly',
      label: 'Monthly projection',
      ...SEMANTIC_LINES.monthlyProjection,
      marker: null,
    })
  }

  if (visibility.showDated && visibility.hasDatedTarget) {
    items.push({
      key: 'requiredRate',
      label: 'Required rate',
      ...SEMANTIC_LINES.requiredRate,
      marker: null,
    })
  }

  if (visibility.showFinal && visibility.finalKg !== null) {
    items.push({
      key: 'goal',
      label: 'Goal',
      ...SEMANTIC_LINES.goal,
      marker: null,
    })
  }

  if (visibility.showMonthly && visibility.monthlyTargetKg !== null) {
    items.push({
      key: 'monthlyTarget',
      label: 'Monthly target',
      ...SEMANTIC_LINES.goalDashed,
      marker: null,
    })
  }

  if (visibility.showBmi) {
    items.push({
      key: 'bmi',
      label: 'BMI (right axis)',
      stroke: bmi.stroke,
      strokeWidth: bmi.strokeWidth,
      strokeDasharray: bmi.strokeDasharray,
      marker: seriesChannel(1).marker,
    })
  }

  return items
}

function LegendSwatch({ item }: { item: LegendItem }) {
  return (
    <svg width={28} height={8} viewBox="0 0 28 8" aria-hidden="true" className="shrink-0">
      <line
        x1={1}
        y1={4}
        x2={27}
        y2={4}
        stroke={item.stroke}
        strokeWidth={item.strokeWidth}
        strokeDasharray={item.strokeDasharray}
        strokeLinecap="round"
      />
      {item.marker !== null && markerDot(item.marker, item.stroke)({ cx: 14, cy: 4 })}
    </svg>
  )
}

export function WeightLegend(visibility: LegendVisibility) {
  const items = buildLegendItems(visibility)
  if (items.length === 0) {
    return null
  }
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <LegendSwatch item={item} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
