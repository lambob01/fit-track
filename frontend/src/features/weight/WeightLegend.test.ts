import { describe, expect, it } from 'vitest'
import { SEMANTIC_LINES, seriesChannel, seriesStyle } from '../../lib/chartTheme'
import { buildLegendItems, type LegendItem, type LegendVisibility } from './WeightLegend'

const BASE: LegendVisibility = {
  showWeight: true,
  showAverage: true,
  showTrend: true,
  showBmi: false,
  showWeekly: false,
  showMonthly: false,
  showDated: false,
  showFinal: false,
  hasDatedTarget: false,
  finalKg: null,
  monthlyTargetKg: null,
  weeklyRateKg: null,
  monthlyRateKg: null,
}

function build(overrides: Partial<LegendVisibility> = {}): LegendItem[] {
  return buildLegendItems({ ...BASE, ...overrides })
}

function labels(overrides: Partial<LegendVisibility> = {}): string[] {
  return build(overrides).map((item) => item.label)
}

describe('buildLegendItems visibility', () => {
  it('lists the base series that are toggled on', () => {
    expect(labels()).toEqual(['Weight', '7-day avg', 'Trend'])
  })

  it('hides the weight series when its toggle is off', () => {
    expect(labels({ showWeight: false })).toEqual(['7-day avg', 'Trend'])
  })

  it('hides the moving average when its toggle is off', () => {
    expect(labels({ showAverage: false })).toEqual(['Weight', 'Trend'])
  })

  it('hides the trend when its toggle is off', () => {
    expect(labels({ showTrend: false })).toEqual(['Weight', '7-day avg'])
  })

  it('returns nothing when every toggle is off', () => {
    expect(
      labels({ showWeight: false, showAverage: false, showTrend: false, showBmi: false }),
    ).toEqual([])
  })

  it('lists the weekly projection only when shown and a weekly rate exists', () => {
    expect(labels({ showWeekly: false, weeklyRateKg: 0.5 })).not.toContain('Weekly projection')
    expect(labels({ showWeekly: true, weeklyRateKg: null })).not.toContain('Weekly projection')
    expect(labels({ showWeekly: true, weeklyRateKg: 0.5 })).toContain('Weekly projection')
  })

  it('lists the monthly projection only when shown in rate mode', () => {
    expect(labels({ showMonthly: false, monthlyRateKg: 0.5 })).not.toContain('Monthly projection')
    expect(labels({ showMonthly: true, monthlyRateKg: null })).not.toContain('Monthly projection')
    expect(labels({ showMonthly: true, monthlyRateKg: 0.5 })).toContain('Monthly projection')
  })

  it('lists the monthly target only when monthly is shown and a target exists', () => {
    expect(labels({ showMonthly: false, monthlyTargetKg: 75 })).not.toContain('Monthly target')
    expect(labels({ showMonthly: true, monthlyTargetKg: null })).not.toContain('Monthly target')
    const targetMode = labels({ showMonthly: true, monthlyTargetKg: 75 })
    expect(targetMode).toContain('Monthly target')
    expect(targetMode).not.toContain('Monthly projection')
  })

  it('lists the required rate only when dated is shown and a target line exists', () => {
    expect(labels({ showDated: true, hasDatedTarget: false })).not.toContain('Required rate')
    expect(labels({ showDated: false, hasDatedTarget: true })).not.toContain('Required rate')
    expect(labels({ showDated: true, hasDatedTarget: true })).toContain('Required rate')
  })

  it('lists the goal only when final is shown and a goal exists', () => {
    expect(labels({ showFinal: true, finalKg: null })).not.toContain('Goal')
    expect(labels({ showFinal: false, finalKg: 80 })).not.toContain('Goal')
    expect(labels({ showFinal: true, finalKg: 80 })).toContain('Goal')
  })

  it('lists BMI with an axis qualifier only when shown', () => {
    expect(labels({ showBmi: false })).not.toContain('BMI (right axis)')
    expect(labels({ showBmi: true })).toContain('BMI (right axis)')
  })

  it('mirrors every rendered series when all overlays are on', () => {
    expect(
      labels({
        showWeekly: true,
        showMonthly: true,
        showDated: true,
        showFinal: true,
        hasDatedTarget: true,
        finalKg: 80,
        monthlyTargetKg: null,
        weeklyRateKg: 0.5,
        monthlyRateKg: 0.5,
        showBmi: true,
      }),
    ).toEqual([
      'Weight',
      '7-day avg',
      'Trend',
      'Weekly projection',
      'Monthly projection',
      'Required rate',
      'Goal',
      'BMI (right axis)',
    ])
  })

  it('mirrors every rendered series in monthly target mode', () => {
    expect(
      labels({
        showMonthly: true,
        showFinal: true,
        finalKg: 80,
        monthlyTargetKg: 75,
      }),
    ).toEqual(['Weight', '7-day avg', 'Trend', 'Goal', 'Monthly target'])
  })
})

describe('buildLegendItems swatches', () => {
  it('uses the weight and BMI series styles verbatim', () => {
    const [weight] = build()
    const bmi = build({ showBmi: true }).at(-1)

    expect(weight.stroke).toBe(seriesStyle(0).stroke)
    expect(weight.strokeWidth).toBe(seriesStyle(0).strokeWidth)
    expect(weight.strokeDasharray).toBe(seriesStyle(0).strokeDasharray)
    expect(bmi?.stroke).toBe(seriesStyle(1, 1.5).stroke)
    expect(bmi?.strokeWidth).toBe(seriesStyle(1, 1.5).strokeWidth)
    expect(bmi?.strokeDasharray).toBe(seriesStyle(1, 1.5).strokeDasharray)
    expect(bmi?.strokeDasharray).toBe('2 2')
  })

  it('marks only the series that render dots', () => {
    const items = build({ showBmi: true })
    const marked = items.filter((item) => item.marker !== null)
    expect(marked.map((item) => item.label)).toEqual(['Weight', 'BMI (right axis)'])
    expect(items.find((item) => item.label === 'Weight')?.marker).toBe(seriesChannel(0).marker)
    expect(items.find((item) => item.label === 'BMI (right axis)')?.marker).toBe(
      seriesChannel(1).marker,
    )
  })

  it('copies semantic strokes, widths, and dash arrays from the theme', () => {
    const items = build({
      showWeekly: true,
      showMonthly: true,
      showDated: true,
      hasDatedTarget: true,
      showFinal: true,
      finalKg: 80,
      monthlyTargetKg: 75,
      weeklyRateKg: 0.5,
      monthlyRateKg: 0.5,
    })
    const semantic: Record<string, { stroke: string; strokeWidth: number; strokeDasharray?: string }> =
      {
        '7-day avg': SEMANTIC_LINES.movingAverage,
        Trend: SEMANTIC_LINES.trend,
        'Weekly projection': SEMANTIC_LINES.weeklyProjection,
        'Monthly projection': SEMANTIC_LINES.monthlyProjection,
        'Required rate': SEMANTIC_LINES.requiredRate,
        Goal: SEMANTIC_LINES.goal,
        'Monthly target': SEMANTIC_LINES.goalDashed,
      }

    for (const [label, style] of Object.entries(semantic)) {
      const item = items.find((candidate) => candidate.label === label)
      expect(item?.stroke, label).toBe(style.stroke)
      expect(item?.strokeWidth, label).toBe(style.strokeWidth)
      expect(item?.strokeDasharray, label).toBe(style.strokeDasharray)
    }
  })
})
