import { createElement, type ReactNode } from 'react'

export const CHART_PALETTE_DARK = [
  'oklch(0.78 0.13 160)',
  'oklch(0.72 0.12 250)',
  'oklch(0.78 0.12 85)',
  'oklch(0.72 0.14 330)',
  'oklch(0.72 0.11 195)',
  'oklch(0.70 0.13 290)',
] as const

export const CHART_PALETTE_LIGHT = [
  'oklch(0.58 0.13 160)',
  'oklch(0.55 0.14 250)',
  'oklch(0.60 0.12 85)',
  'oklch(0.55 0.15 330)',
  'oklch(0.55 0.11 195)',
  'oklch(0.52 0.14 290)',
] as const

export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const

export const CHART_NEUTRAL = 'var(--color-content-muted)'
export const CHART_GOAL = 'var(--chart-3)'

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'star'

export interface SeriesChannel {
  dash?: string
  marker: MarkerShape
}

export const SERIES_CHANNELS: readonly SeriesChannel[] = [
  { dash: undefined, marker: 'circle' },
  { dash: '2 2', marker: 'square' },
  { dash: '5 3', marker: 'triangle' },
  { dash: '7 2 2 2', marker: 'diamond' },
  { dash: '1 2', marker: 'cross' },
  { dash: '12 4', marker: 'star' },
]

export function seriesColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]
}

export function seriesChannel(index: number): SeriesChannel {
  return SERIES_CHANNELS[index % SERIES_CHANNELS.length]
}

export interface MarkerProps {
  cx?: number
  cy?: number
  index?: number
}

const MARKER_RADIUS = 3

function starPoints(outer: number, inner: number): string {
  const points: string[] = []
  for (let step = 0; step < 10; step += 1) {
    const radius = step % 2 === 0 ? outer : inner
    const angle = (Math.PI / 5) * step - Math.PI / 2
    points.push(`${(radius * Math.cos(angle)).toFixed(2)},${(radius * Math.sin(angle)).toFixed(2)}`)
  }
  return points.join(' ')
}

function markerShape(shape: MarkerShape, fill: string): ReactNode {
  switch (shape) {
    case 'circle':
      return createElement('circle', { r: MARKER_RADIUS, fill })
    case 'square':
      return createElement('rect', {
        x: -MARKER_RADIUS,
        y: -MARKER_RADIUS,
        width: MARKER_RADIUS * 2,
        height: MARKER_RADIUS * 2,
        fill,
      })
    case 'triangle':
      return createElement('polygon', {
        points: `0,${-MARKER_RADIUS - 1} ${MARKER_RADIUS + 1},${MARKER_RADIUS} ${-MARKER_RADIUS - 1},${MARKER_RADIUS}`,
        fill,
      })
    case 'diamond':
      return createElement('polygon', {
        points: `0,${-MARKER_RADIUS - 1} ${MARKER_RADIUS + 1},0 0,${MARKER_RADIUS + 1} ${-MARKER_RADIUS - 1},0`,
        fill,
      })
    case 'cross':
      return createElement('path', {
        d: `M${-MARKER_RADIUS - 1},${-MARKER_RADIUS - 1} L${MARKER_RADIUS + 1},${MARKER_RADIUS + 1} M${-MARKER_RADIUS - 1},${MARKER_RADIUS + 1} L${MARKER_RADIUS + 1},${-MARKER_RADIUS - 1}`,
        stroke: fill,
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        fill: 'none',
      })
    case 'star':
      return createElement('polygon', {
        points: starPoints(MARKER_RADIUS + 2, MARKER_RADIUS * 0.6),
        fill,
      })
  }
}

export function markerDot(shape: MarkerShape, fill: string) {
  return function ChartMarker({ cx, cy, index = 0 }: MarkerProps): ReactNode {
    if (typeof cx !== 'number' || typeof cy !== 'number') {
      return null
    }
    return createElement(
      'g',
      { key: index, transform: `translate(${cx} ${cy})` },
      markerShape(shape, fill),
    )
  }
}

export interface ChartSeriesStyle {
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
  dot: (props: MarkerProps) => ReactNode
}

export function seriesStyle(index: number, strokeWidth = 2): ChartSeriesStyle {
  const { dash, marker } = seriesChannel(index)
  const stroke = seriesColor(index)
  return {
    stroke,
    strokeWidth,
    ...(dash === undefined ? {} : { strokeDasharray: dash }),
    dot: markerDot(marker, stroke),
  }
}

export interface SemanticLineStyle {
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
}

export const SEMANTIC_LINES: Record<
  'movingAverage' | 'trend' | 'weeklyProjection' | 'monthlyProjection' | 'requiredRate' | 'goal' | 'goalDashed',
  SemanticLineStyle
> = {
  movingAverage: { stroke: CHART_NEUTRAL, strokeWidth: 1 },
  trend: { stroke: CHART_NEUTRAL, strokeWidth: 1, strokeDasharray: '6 4' },
  weeklyProjection: { stroke: CHART_NEUTRAL, strokeWidth: 1, strokeDasharray: '4 2 1 2' },
  monthlyProjection: { stroke: CHART_NEUTRAL, strokeWidth: 1, strokeDasharray: '9 3 1 3' },
  requiredRate: { stroke: CHART_NEUTRAL, strokeWidth: 1, strokeDasharray: '1 4' },
  goal: { stroke: CHART_GOAL, strokeWidth: 1 },
  goalDashed: { stroke: CHART_GOAL, strokeWidth: 1, strokeDasharray: '4 4' },
}

export const CHART_TICK = {
  fill: 'var(--color-content-muted)',
  fontSize: 10,
} as const

export const CHART_AXIS_PROPS = {
  tick: CHART_TICK,
  stroke: 'var(--color-line)',
} as const

export const CHART_GRID_PROPS = {
  stroke: 'var(--color-line)',
  strokeDasharray: '3 3',
  vertical: false,
} as const

export const CHART_TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: 'var(--color-surface-raised)',
    border: '1px solid var(--color-line)',
    borderRadius: '0.5rem',
    fontSize: '0.75rem',
  },
  labelStyle: { color: 'var(--color-content-muted)' },
  itemStyle: { color: 'var(--color-content)' },
} as const

export const CHART_LEGEND_PROPS = {
  iconType: 'plainline',
  iconSize: 18,
  wrapperStyle: { fontSize: '0.75rem', color: 'var(--color-content-muted)' },
} as const
