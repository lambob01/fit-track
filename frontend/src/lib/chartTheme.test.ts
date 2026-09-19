import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CHART_COLORS,
  CHART_PALETTE_DARK,
  CHART_PALETTE_LIGHT,
  markerDot,
  SEMANTIC_LINES,
  SERIES_CHANNELS,
  seriesChannel,
  seriesColor,
  seriesStyle,
} from './chartTheme'

interface OklchToken {
  lightness: number
  chroma: number
}

function parseOklch(token: string): OklchToken {
  const match = /^oklch\(([\d.]+) ([\d.]+) [\d.]+\)$/.exec(token)
  if (match === null) {
    throw new Error(`not an OKLCH token: ${token}`)
  }
  return { lightness: Number(match[1]), chroma: Number(match[2]) }
}

describe('chart palette', () => {
  it('wires the six CSS variable slots in order', () => {
    expect(CHART_COLORS).toEqual([
      'var(--chart-1)',
      'var(--chart-2)',
      'var(--chart-3)',
      'var(--chart-4)',
      'var(--chart-5)',
      'var(--chart-6)',
    ])
  })

  it('exposes six distinct OKLCH tokens per theme', () => {
    expect(CHART_PALETTE_DARK).toHaveLength(6)
    expect(new Set(CHART_PALETTE_DARK).size).toBe(6)
    expect(new Set(CHART_PALETTE_LIGHT).size).toBe(6)
  })

  it('avoids highly saturated web colours in both themes', () => {
    for (const token of [...CHART_PALETTE_DARK, ...CHART_PALETTE_LIGHT]) {
      expect(parseOklch(token).chroma).toBeLessThanOrEqual(0.15)
    }
  })

  it('uses lighter variants for the dark theme', () => {
    for (let index = 0; index < CHART_PALETTE_DARK.length; index += 1) {
      expect(parseOklch(CHART_PALETTE_DARK[index]).lightness).toBeGreaterThan(
        parseOklch(CHART_PALETTE_LIGHT[index]).lightness,
      )
    }
  })
})

describe('series secondary channels', () => {
  it('gives every palette entry a distinct marker shape and dash pattern', () => {
    expect(SERIES_CHANNELS).toHaveLength(CHART_COLORS.length)
    expect(new Set(SERIES_CHANNELS.map((channel) => channel.marker)).size).toBe(
      SERIES_CHANNELS.length,
    )
    expect(
      new Set(SERIES_CHANNELS.map((channel) => channel.dash ?? 'solid')).size,
    ).toBe(SERIES_CHANNELS.length)
  })

  it('wraps around for indices past the palette', () => {
    expect(seriesColor(6)).toBe(seriesColor(0))
    expect(seriesChannel(7).marker).toBe(seriesChannel(1).marker)
    expect(seriesStyle(1).strokeDasharray).toBe('2 2')
    expect(typeof seriesStyle(0).dot).toBe('function')
  })

  it('renders every marker shape as a distinct SVG element', () => {
    const markup = SERIES_CHANNELS.map((channel) =>
      renderToStaticMarkup(markerDot(channel.marker, 'var(--chart-1)')({ cx: 8, cy: 8 })),
    )
    expect(markup.every((element) => element.startsWith('<g'))).toBe(true)
    expect(new Set(markup).size).toBe(SERIES_CHANNELS.length)
  })
})

describe('semantic lines', () => {
  it('differentiates muted overlays by dash pattern only', () => {
    const muted = [
      SEMANTIC_LINES.movingAverage,
      SEMANTIC_LINES.trend,
      SEMANTIC_LINES.weeklyProjection,
      SEMANTIC_LINES.monthlyProjection,
      SEMANTIC_LINES.requiredRate,
    ]
    expect(new Set(muted.map((line) => line.stroke)).size).toBe(1)
    expect(new Set(muted.map((line) => line.strokeDasharray ?? 'solid')).size).toBe(muted.length)
  })

  it('matches the spec line styles', () => {
    expect(SEMANTIC_LINES.requiredRate.strokeDasharray).toBe('1 4')
    expect(SEMANTIC_LINES.trend.strokeDasharray).toBe('6 4')
    expect(SEMANTIC_LINES.movingAverage.strokeDasharray).toBeUndefined()
    expect(SEMANTIC_LINES.goal.stroke).toBe('var(--chart-3)')
    expect(SEMANTIC_LINES.goal.strokeDasharray).toBeUndefined()
  })

  it('keeps every semantic stroke on a CSS variable', () => {
    for (const line of Object.values(SEMANTIC_LINES)) {
      expect(line.stroke).toMatch(/^var\(--/)
    }
  })
})
