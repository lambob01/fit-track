import { describe, expect, it } from 'vitest'
import type { WeightSeries } from '../../api/types'
import type { DateRange } from '../../lib/dateRange'
import { dateKeyToTimestamp } from '../../lib/datetime'
import { DAY_MS } from '../../lib/goals'
import { buildChartData, type ChartRow } from './WeightChart'

const TIMEZONE = 'UTC'
const RANGE: DateRange = {
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-10-01T00:00:00.000Z',
}
const RANGE_FROM = Date.parse(RANGE.from)
const RANGE_TO = Date.parse(RANGE.to)
const START_TS = Date.parse('2026-09-07T08:00:00.000Z')

const DATED_LINE = [
  { date: '2026-09-05', weight_kg: 79 },
  { date: '2026-09-15', weight_kg: 77 },
  { date: '2026-10-05', weight_kg: 75 },
  { date: '2026-10-20', weight_kg: 73 },
]

function makeSeries(overrides: Partial<WeightSeries> = {}): WeightSeries {
  return {
    bucket: 'day',
    from: RANGE.from,
    to: RANGE.to,
    points: [
      { bucket_start: '2026-09-02', measured_at: '2026-09-02T08:00:00.000Z', weight_kg: 80 },
      { bucket_start: '2026-09-07', measured_at: '2026-09-07T08:00:00.000Z', weight_kg: 79.5 },
    ],
    moving_average: [
      { measured_at: '2026-09-02T08:00:00.000Z', value: 80.1 },
      { measured_at: '2026-09-07T08:00:00.000Z', value: 79.6 },
    ],
    trend: { slope_per_day: -0.07, intercept: 80, from_value: 80.1, to_value: 79.6 },
    goal_weight_kg: 75,
    goals: {
      final_weight_kg: 75,
      rate_kg_per_week: -0.5,
      monthly: { mode: null, target_kg: null, rate_kg_per_month: null },
    },
    required_rate_line: null,
    on_track: null,
    ...overrides,
  }
}

function build(
  series: WeightSeries,
  overrides: {
    range?: DateRange
    showWeekly?: boolean
    showMonthly?: boolean
    showDated?: boolean
    heightCm?: number | null
  } = {},
): ChartRow[] {
  return buildChartData(series, {
    range: RANGE,
    showWeekly: false,
    showMonthly: false,
    showDated: false,
    heightCm: null,
    timezone: TIMEZONE,
    ...overrides,
  })
}

function rowAt(rows: ChartRow[], ts: number): ChartRow | undefined {
  return rows.find((row) => row.ts === ts)
}

describe('buildChartData range clipping', () => {
  it('clips every row to the selected range when the required-rate line runs past it', () => {
    const data = build(makeSeries({ required_rate_line: DATED_LINE }), {
      showWeekly: true,
      showDated: true,
    })

    expect(data.length).toBeGreaterThan(0)
    for (const row of data) {
      expect(row.ts).toBeGreaterThanOrEqual(RANGE_FROM)
      expect(row.ts).toBeLessThanOrEqual(RANGE_TO)
    }

    const targetDateTs = dateKeyToTimestamp(DATED_LINE[DATED_LINE.length - 1].date, TIMEZONE)
    expect(data.some((row) => row.ts === targetDateTs)).toBe(false)
    expect(Math.max(...data.map((row) => row.ts))).toBeLessThanOrEqual(RANGE_TO)
  })

  it('keeps required-rate and projection values inside the window unchanged', () => {
    const data = build(makeSeries({ required_rate_line: DATED_LINE }), {
      showWeekly: true,
      showDated: true,
    })

    expect(rowAt(data, dateKeyToTimestamp('2026-09-05', TIMEZONE))?.requiredRate).toBe(79)
    expect(rowAt(data, dateKeyToTimestamp('2026-09-15', TIMEZONE))?.requiredRate).toBe(77)

    expect(rowAt(data, START_TS)?.weeklyProjection).toBeCloseTo(79.5, 6)
    expect(rowAt(data, START_TS + 7 * DAY_MS)?.weeklyProjection).toBeCloseTo(79, 6)
    expect(rowAt(data, START_TS + 14 * DAY_MS)?.weeklyProjection).toBeCloseTo(78.5, 6)
    expect(rowAt(data, START_TS + 21 * DAY_MS)?.weeklyProjection).toBeCloseTo(78, 6)

    expect(rowAt(data, Date.parse('2026-09-02T08:00:00.000Z'))).toMatchObject({
      weight: 80,
      average: 80.1,
      trend: 80.1,
    })
    expect(rowAt(data, START_TS)).toMatchObject({ weight: 79.5, average: 79.6, trend: 79.6 })
  })

  it('leaves rows untouched when no dated target is set', () => {
    const data = build(makeSeries())

    expect(data).toEqual([
      {
        ts: Date.parse('2026-09-02T08:00:00.000Z'),
        weight: 80,
        average: 80.1,
        trend: 80.1,
        weeklyProjection: null,
        monthlyProjection: null,
        requiredRate: null,
        bmi: null,
      },
      {
        ts: START_TS,
        weight: 79.5,
        average: 79.6,
        trend: 79.6,
        weeklyProjection: null,
        monthlyProjection: null,
        requiredRate: null,
        bmi: null,
      },
    ])
  })

  it('returns no rows for a range with no points', () => {
    const data = build(makeSeries({ required_rate_line: DATED_LINE }), {
      range: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-05T00:00:00.000Z' },
      showWeekly: true,
      showMonthly: true,
      showDated: true,
    })

    expect(data).toEqual([])
  })

  it('keeps rows that sit exactly on either range boundary', () => {
    const series = makeSeries({
      points: [
        { bucket_start: '2026-09-01', measured_at: RANGE.from, weight_kg: 80 },
        { bucket_start: '2026-10-01', measured_at: RANGE.to, weight_kg: 79 },
      ],
      moving_average: [],
      trend: null,
    })

    expect(build(series).map((row) => row.ts)).toEqual([RANGE_FROM, RANGE_TO])
  })

  it('clips weekly projections to the range without a dated target', () => {
    const data = build(makeSeries(), { showWeekly: true })

    expect(data.some((row) => row.ts > RANGE_TO)).toBe(false)
    const projected = data.filter((row) => row.weeklyProjection !== null)
    expect(projected.map((row) => row.ts)).toEqual([
      START_TS,
      START_TS + 7 * DAY_MS,
      START_TS + 14 * DAY_MS,
      START_TS + 21 * DAY_MS,
    ])
  })
})

describe('buildChartData required-rate line visibility', () => {
  it('leaves no required-rate values when every line point is outside the window', () => {
    const data = build(
      makeSeries({
        required_rate_line: [
          { date: '2026-10-05', weight_kg: 75 },
          { date: '2026-10-20', weight_kg: 73 },
        ],
      }),
      { showDated: true },
    )

    expect(data.length).toBeGreaterThan(0)
    expect(data.every((row) => row.requiredRate === null)).toBe(true)
  })

  it('leaves no required-rate values when only one line point falls inside the window', () => {
    const data = build(
      makeSeries({
        required_rate_line: [
          { date: '2026-09-25', weight_kg: 78 },
          { date: '2026-10-05', weight_kg: 75 },
        ],
      }),
      { showDated: true },
    )

    expect(data.every((row) => row.requiredRate === null)).toBe(true)
  })

  it('keeps required-rate values when two line points fall inside the window', () => {
    const data = build(
      makeSeries({
        required_rate_line: [
          { date: '2026-09-05', weight_kg: 79 },
          { date: '2026-09-15', weight_kg: 77 },
        ],
      }),
      { showDated: true },
    )

    expect(rowAt(data, dateKeyToTimestamp('2026-09-05', TIMEZONE))?.requiredRate).toBe(79)
    expect(rowAt(data, dateKeyToTimestamp('2026-09-15', TIMEZONE))?.requiredRate).toBe(77)
  })
})
