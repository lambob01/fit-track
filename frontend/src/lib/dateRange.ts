import { startOfDay, subDays, subYears } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { toUtcIso } from './datetime'

export type DateRangePreset = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom'

export type RangePresetKey = Exclude<DateRangePreset, 'custom'>

export interface DateRange {
  from: string
  to: string
}

export const RANGE_PRESET_KEYS: RangePresetKey[] = ['7d', '30d', '90d', '1y', 'all']

const PRESET_LOOKBACK_DAYS: Record<'7d' | '30d' | '90d', number> = {
  '7d': 6,
  '30d': 29,
  '90d': 89,
}

function startOfLocalDayUtc(date: Date, timezone: string): Date {
  return fromZonedTime(startOfDay(date), timezone)
}

export function getPresetRange(
  preset: RangePresetKey,
  timezone: string,
  now: Date = new Date(),
): DateRange {
  const to = toUtcIso(now)

  if (preset === 'all') {
    return { from: toUtcIso(new Date(0)), to }
  }

  const zonedNow = toZonedTime(now, timezone)

  if (preset === '1y') {
    return { from: toUtcIso(startOfLocalDayUtc(subYears(zonedNow, 1), timezone)), to }
  }

  const lookback = PRESET_LOOKBACK_DAYS[preset]
  return { from: toUtcIso(startOfLocalDayUtc(subDays(zonedNow, lookback), timezone)), to }
}

export function inferPreset(
  value: DateRange,
  timezone: string,
  now: Date = new Date(),
): DateRangePreset {
  const match = RANGE_PRESET_KEYS.find(
    (preset) => getPresetRange(preset, timezone, now).from === value.from,
  )

  return match ?? 'custom'
}
