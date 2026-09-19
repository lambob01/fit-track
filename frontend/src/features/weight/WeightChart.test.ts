import { describe, expect, it } from 'vitest'
import type { WeightSeries } from '../../api/types'
import type { DateRange } from '../../lib/dateRange'
import { dateKeyToTimestamp } from '../../lib/datetime'
import { DAY_MS, DAYS_PER_MONTH, DAYS_PER_WEEK } from '../../lib/goals'
import {
  buildChartData,
  buildOverlayHorizons,
  buildXDomain,
  type BuildOptions,
  type ChartRow,
} from './WeightChart'

const TIMEZONE = 'UTC'
const RANGE: DateRange = {
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-10-01T00:00:00.000Z',
}
const RANGE_FROM = Date.parse(RANGE.from)
const RANGE_TO = Date.parse(RANGE.to)
const FIRST_POINT_ISO = '2026-09-02T08:00:00.000Z'
const LATEST_ISO = '2026-09-07T08:00:00.000Z'
const FIRST_POINT_TS = Date.parse(FIRST_POINT_ISO)
const LATEST_TS = Date.parse(LATEST_ISO)
const RATE_CAP_HORIZON = LATEST_TS + 4 * DAYS_PER_WEEK * DAY_MS

const DATED_LINE = [
  { date: '2026-09-05', weight_kg: 79 },
  { date: '2026-09-15', weight_kg: 77 },
  { date: '2026-10-05', weight_kg: 75 },
  { date: '2026-10-20', weight_kg: 73 },
]
const DATED_HORIZON = dateKeyToTimestamp(DATED_LINE[DATED_LINE.length - 1].date, TIMEZONE)

const RATE = -0.5
const MONTHLY_RATE = -2

function makeSeries(overrides: Partial<WeightSeries> = {}): WeightSeries {
  return {
    bucket: 'day',
    from: RANGE.from,
    to: RANGE.to,
    points: [
      { bucket_start: '2026-09-02', measured_at: FIRST_POINT_ISO, weight_kg: 80 },
      { bucket_start: '2026-09-07', measured_at: LATEST_ISO, weight_kg: 79.5 },
    ],
    moving_average: [
      { measured_at: FIRST_POINT_ISO, value: 80.1 },
      { measured_at: LATEST_ISO, value: 79.6 },
    ],
    trend: { slope_per_day: -0.07, intercept: 80, from_value: 80.1, to_value: 79.6 },
    goal_weight_kg: 75,
    goals: {
      final_weight_kg: 75,
      rate_kg_per_week: RATE,
      monthly: { mode: null, target_kg: null, rate_kg_per_month: null },
    },
    required_rate_line: null,
    on_track: null,
    ...overrides,
  }
}

function makeMonthlySeries(mode: 'rate' | 'target', value: number): WeightSeries {
  return makeSeries({
    goals: {
      final_weight_kg: 75,
      rate_kg_per_week: RATE,
      monthly: {
        mode,
        target_kg: mode === 'target' ? value : null,
        rate_kg_per_month: mode === 'rate' ? value : null,
      },
    },
  })
}

function build(series: WeightSeries, overrides: Partial<BuildOptions> = {}): ChartRow[] {
  return buildChartData(series, {
    range: RANGE,
    showWeight: true,
    showAverage: true,
    showTrend: true,
    showBmi: false,
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
  it('clips every actual series row to the selected range', () => {
    const data = build(
      makeSeries({
        points: [
          { bucket_start: '2026-09-02', measured_at: '2026-09-02T08:00:00.000Z', weight_kg: 80 },
          { bucket_start: '2026-10-15', measured_at: '2026-10-15T08:00:00.000Z', weight_kg: 78 },
        ],
      }),
    )

    expect(data.length).toBeGreaterThan(0)
    for (const row of data) {
      expect(row.ts).toBeGreaterThanOrEqual(RANGE_FROM)
      expect(row.ts).toBeLessThanOrEqual(RANGE_TO)
    }
    expect(rowAt(data, Date.parse('2026-10-15T08:00:00.000Z'))).toBeUndefined()
  })

  it('leaves rows untouched when no overlays are enabled', () => {
    const data = build(makeSeries())

    expect(data).toEqual([
      {
        ts: FIRST_POINT_TS,
        weight: 80,
        average: 80.1,
        trend: 80.1,
        weeklyProjection: null,
        monthlyProjection: null,
        requiredRate: null,
        bmi: null,
      },
      {
        ts: LATEST_TS,
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
})

describe('buildChartData overlay toggles', () => {
  it('excludes every overlay value when its toggle is off', () => {
    const data = build(makeSeries({ required_rate_line: DATED_LINE }), {})

    expect(
      data.every(
        (row) =>
          row.weeklyProjection === null &&
          row.monthlyProjection === null &&
          row.requiredRate === null,
      ),
    ).toBe(true)
    expect(data.every((row) => row.ts <= RANGE_TO)).toBe(true)
  })

  it('extends the axis to the dated target when the target-date toggle is on', () => {
    const data = build(makeSeries({ required_rate_line: DATED_LINE }), { showDated: true })

    expect(Math.max(...data.map((row) => row.ts))).toBe(DATED_HORIZON)
    expect(rowAt(data, DATED_HORIZON)?.requiredRate).toBe(73)
    expect(rowAt(data, dateKeyToTimestamp('2026-09-05', TIMEZONE))?.requiredRate).toBe(79)
    expect(rowAt(data, dateKeyToTimestamp('2026-09-15', TIMEZONE))?.requiredRate).toBe(77)
  })

  it('caps the weekly rate projection at four weeks past the latest entry', () => {
    const data = build(makeSeries(), { showWeekly: true })

    expect(Math.max(...data.map((row) => row.ts))).toBe(RATE_CAP_HORIZON)
    expect(rowAt(data, RATE_CAP_HORIZON)?.weeklyProjection).toBeCloseTo(
      79.5 + (RATE / DAYS_PER_WEEK) * ((RATE_CAP_HORIZON - LATEST_TS) / DAY_MS),
      6,
    )
    expect(rowAt(data, LATEST_TS)?.weeklyProjection).toBeCloseTo(79.5, 6)
  })

  it('caps the weekly rate projection while the dated line keeps its target horizon', () => {
    const data = build(makeSeries({ required_rate_line: DATED_LINE }), {
      showWeekly: true,
      showDated: true,
    })

    const projectionRows = data.filter((row) => row.weeklyProjection !== null)
    expect(Math.max(...projectionRows.map((row) => row.ts))).toBe(RATE_CAP_HORIZON)
    expect(Math.max(...data.map((row) => row.ts))).toBe(DATED_HORIZON)
    expect(rowAt(data, DATED_HORIZON)?.requiredRate).toBe(73)
  })

  it('projects the monthly rate only to the four-week cap', () => {
    const data = build(makeMonthlySeries('rate', MONTHLY_RATE), { showMonthly: true })

    expect(Math.max(...data.map((row) => row.ts))).toBe(RATE_CAP_HORIZON)
    expect(rowAt(data, RATE_CAP_HORIZON)?.monthlyProjection).toBeCloseTo(
      79.5 + (MONTHLY_RATE / DAYS_PER_MONTH) * ((RATE_CAP_HORIZON - LATEST_TS) / DAY_MS),
      6,
    )
    expect(rowAt(data, LATEST_TS)?.monthlyProjection).toBeCloseTo(79.5, 6)
  })

  it('draws the monthly target line to the end of the current local month', () => {
    const now = new Date('2026-09-19T12:00:00.000Z')
    const range: DateRange = {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-15T00:00:00.000Z',
    }
    const monthEnd = Date.parse('2026-09-30T23:59:59.999Z')
    const data = build(makeMonthlySeries('target', 76), { range, showMonthly: true, now })

    expect(Math.max(...data.map((row) => row.ts))).toBe(monthEnd)
    expect(rowAt(data, monthEnd)?.monthlyProjection).toBeCloseTo(76, 6)
    expect(rowAt(data, LATEST_TS)?.monthlyProjection).toBeCloseTo(79.5, 6)
  })

  it('clips actual series rows even when an overlay extends the axis', () => {
    const data = build(
      makeSeries({
        points: [
          { bucket_start: '2026-09-02', measured_at: '2026-09-02T08:00:00.000Z', weight_kg: 80 },
          { bucket_start: '2026-10-15', measured_at: '2026-10-15T08:00:00.000Z', weight_kg: 78 },
          { bucket_start: '2026-09-07', measured_at: '2026-09-07T08:00:00.000Z', weight_kg: 79.5 },
        ],
        required_rate_line: DATED_LINE,
      }),
      { showDated: true },
    )

    const beyond = data.filter((row) => row.ts > RANGE_TO)
    expect(beyond.length).toBeGreaterThan(0)
    expect(
      beyond.every(
        (row) =>
          row.weight === null && row.average === null && row.trend === null && row.bmi === null,
      ),
    ).toBe(true)
  })

  it('suppresses the required-rate line when fewer than two in-domain points remain', () => {
    const data = build(
      makeSeries({
        required_rate_line: [
          { date: '2026-08-20', weight_kg: 78 },
          { date: '2026-10-20', weight_kg: 73 },
        ],
      }),
      { showDated: true },
    )

    expect(data.length).toBeGreaterThan(0)
    expect(data.every((row) => row.requiredRate === null)).toBe(true)
  })

  it('keeps required-rate values when two in-domain points exist', () => {
    const data = build(
      makeSeries({
        required_rate_line: [
          { date: '2026-09-25', weight_kg: 78 },
          { date: '2026-10-20', weight_kg: 73 },
        ],
      }),
      { showDated: true },
    )

    expect(rowAt(data, dateKeyToTimestamp('2026-09-25', TIMEZONE))?.requiredRate).toBe(78)
    expect(rowAt(data, DATED_HORIZON)?.requiredRate).toBe(73)
  })
})

describe('buildOverlayHorizons', () => {
  const BASE = {
    range: RANGE,
    showWeekly: false,
    showMonthly: false,
    showDated: false,
    timezone: TIMEZONE,
  }

  it('returns no horizons when every overlay toggle is off', () => {
    expect(buildOverlayHorizons(makeSeries({ required_rate_line: DATED_LINE }), BASE)).toEqual({
      weekly: null,
      monthly: null,
      dated: null,
    })
  })

  it('returns the dated horizon only when the target-date toggle is on', () => {
    expect(
      buildOverlayHorizons(makeSeries({ required_rate_line: DATED_LINE }), {
        ...BASE,
        showDated: true,
      }).dated,
    ).toBe(DATED_HORIZON)
  })

  it('caps the weekly rate horizon at four weeks past the latest entry', () => {
    expect(buildOverlayHorizons(makeSeries(), { ...BASE, showWeekly: true }).weekly).toBe(
      RATE_CAP_HORIZON,
    )
  })

  it('caps the weekly rate horizon even when a later dated target exists', () => {
    expect(
      buildOverlayHorizons(makeSeries({ required_rate_line: DATED_LINE }), {
        ...BASE,
        showWeekly: true,
      }).weekly,
    ).toBe(RATE_CAP_HORIZON)
  })

  it('bounds the weekly rate horizon by a nearer dated target', () => {
    const earlyLine = [
      { date: '2026-09-08', weight_kg: 79.4 },
      { date: '2026-09-12', weight_kg: 79 },
    ]

    expect(
      buildOverlayHorizons(makeSeries({ required_rate_line: earlyLine }), {
        ...BASE,
        showWeekly: true,
      }).weekly,
    ).toBe(dateKeyToTimestamp('2026-09-12', TIMEZONE))
  })

  it('returns the end of the current local month for a monthly target', () => {
    const horizons = buildOverlayHorizons(makeMonthlySeries('target', 76), {
      ...BASE,
      showMonthly: true,
      now: new Date('2026-09-19T12:00:00.000Z'),
    })

    expect(horizons.monthly).toBe(Date.parse('2026-09-30T23:59:59.999Z'))
  })

  it('returns the four-week cap for a monthly rate', () => {
    const horizons = buildOverlayHorizons(makeMonthlySeries('rate', MONTHLY_RATE), {
      ...BASE,
      showMonthly: true,
    })

    expect(horizons.monthly).toBe(RATE_CAP_HORIZON)
  })

  it('returns no horizons for a range with no points', () => {
    expect(
      buildOverlayHorizons(makeSeries({ required_rate_line: DATED_LINE }), {
        ...BASE,
        range: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-05T00:00:00.000Z' },
        showWeekly: true,
        showMonthly: true,
        showDated: true,
      }),
    ).toEqual({ weekly: null, monthly: null, dated: null })
  })
})

describe('buildXDomain', () => {
  const NO_HORIZONS = { weekly: null, monthly: null, dated: null }

  it('returns the exact range when there are no rows and no overlay horizons', () => {
    expect(buildXDomain(RANGE, NO_HORIZONS)).toEqual([RANGE_FROM, RANGE_TO])
  })

  it('starts at the first data point when data begins after the range start', () => {
    const rows = [{ ts: FIRST_POINT_TS }, { ts: LATEST_TS }]

    expect(buildXDomain(RANGE, NO_HORIZONS, rows)).toEqual([FIRST_POINT_TS, RANGE_TO])
  })

  it('keeps the range start when the first data point sits at or before it', () => {
    expect(buildXDomain(RANGE, NO_HORIZONS, [{ ts: RANGE_FROM }, { ts: LATEST_TS }])).toEqual([
      RANGE_FROM,
      RANGE_TO,
    ])
    expect(
      buildXDomain(RANGE, NO_HORIZONS, [{ ts: RANGE_FROM - DAY_MS }, { ts: LATEST_TS }]),
    ).toEqual([RANGE_FROM, RANGE_TO])
  })

  it('extends to the weekly rate cap horizon', () => {
    expect(buildXDomain(RANGE, { ...NO_HORIZONS, weekly: RATE_CAP_HORIZON })).toEqual([
      RANGE_FROM,
      RATE_CAP_HORIZON,
    ])
  })

  it('extends to the dated target horizon', () => {
    expect(buildXDomain(RANGE, { ...NO_HORIZONS, dated: DATED_HORIZON })).toEqual([
      RANGE_FROM,
      DATED_HORIZON,
    ])
  })

  it('extends to the monthly target horizon', () => {
    const monthlyHorizon = Date.parse('2026-10-31T23:59:59.999Z')

    expect(buildXDomain(RANGE, { ...NO_HORIZONS, monthly: monthlyHorizon })).toEqual([
      RANGE_FROM,
      monthlyHorizon,
    ])
  })

  it('keeps the range end when a horizon falls before it', () => {
    expect(
      buildXDomain(RANGE, {
        weekly: RANGE_TO - DAY_MS,
        monthly: null,
        dated: RANGE_TO - 2 * DAY_MS,
      }),
    ).toEqual([RANGE_FROM, RANGE_TO])
  })

  it('combines a later data start with an overlay horizon', () => {
    const rows = [{ ts: FIRST_POINT_TS }, { ts: LATEST_TS }]

    expect(buildXDomain(RANGE, { ...NO_HORIZONS, weekly: RATE_CAP_HORIZON }, rows)).toEqual([
      FIRST_POINT_TS,
      RATE_CAP_HORIZON,
    ])
  })

  it('uses built chart data to start at the first data row and end at the capped horizon', () => {
    const series = makeSeries()
    const options: BuildOptions = {
      range: RANGE,
      showWeight: true,
      showAverage: true,
      showTrend: true,
      showBmi: false,
      showWeekly: true,
      showMonthly: false,
      showDated: false,
      heightCm: null,
      timezone: TIMEZONE,
    }

    expect(
      buildXDomain(RANGE, buildOverlayHorizons(series, options), buildChartData(series, options)),
    ).toEqual([FIRST_POINT_TS, RATE_CAP_HORIZON])
  })
})
