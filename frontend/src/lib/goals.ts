import { differenceInCalendarDays, parseISO } from 'date-fns'

export const DAY_MS = 86_400_000
export const DAYS_PER_WEEK = 7
export const DAYS_PER_MONTH = 30.4375

export type RequiredRate = number | 'expired' | null

export function requiredRatePerWeek(
  currentKg: number | null,
  targetKg: number | null,
  targetDateKey: string | null,
  todayKey: string,
): RequiredRate {
  if (currentKg === null || targetKg === null || targetDateKey === null) {
    return null
  }

  const remainingDays = differenceInCalendarDays(parseISO(targetDateKey), parseISO(todayKey))
  if (remainingDays <= 0) {
    return 'expired'
  }

  return (targetKg - currentKg) / (remainingDays / DAYS_PER_WEEK)
}

export interface ProjectionPoint {
  ts: number
  value: number
}

export function projectWeight(
  startTs: number,
  endTs: number,
  startKg: number,
  ratePerDay: number,
): ProjectionPoint[] {
  const points: ProjectionPoint[] = [{ ts: startTs, value: startKg }]
  if (endTs <= startTs) {
    return points
  }

  let day = DAYS_PER_WEEK
  while (day < (endTs - startTs) / DAY_MS) {
    points.push({ ts: startTs + day * DAY_MS, value: startKg + ratePerDay * day })
    day += DAYS_PER_WEEK
  }
  points.push({ ts: endTs, value: startKg + ratePerDay * ((endTs - startTs) / DAY_MS) })
  return points
}
