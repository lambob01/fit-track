import { addDays, addMonths, endOfMonth, format, getDay, parse, startOfMonth } from 'date-fns'
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'

const DATE_KEY_FORMAT = 'yyyy-MM-dd'

function parseDateKey(dateKey: string): Date {
  return parse(dateKey, DATE_KEY_FORMAT, new Date())
}

export function formatLocal(iso: string, timezone: string, pattern: string): string {
  return formatInTimeZone(new Date(iso), timezone, pattern)
}

export function toLocalDateTimeInput(iso: string, timezone: string): string {
  return formatInTimeZone(new Date(iso), timezone, "yyyy-MM-dd'T'HH:mm")
}

export function fromLocalDateTimeInput(value: string, timezone: string): string {
  return fromZonedTime(value, timezone).toISOString()
}

export function toUtcIso(date: Date): string {
  return date.toISOString()
}

export function localDateKey(iso: string, timezone: string): string {
  return formatInTimeZone(new Date(iso), timezone, DATE_KEY_FORMAT)
}

export function todayDateKey(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, DATE_KEY_FORMAT)
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  return format(addDays(parseDateKey(dateKey), days), DATE_KEY_FORMAT)
}

export function addMonthsToDateKey(dateKey: string, months: number): string {
  return format(addMonths(parseDateKey(dateKey), months), DATE_KEY_FORMAT)
}

export function monthStartDateKey(dateKey: string): string {
  return format(startOfMonth(parseDateKey(dateKey)), DATE_KEY_FORMAT)
}

export function monthEndDateKey(dateKey: string): string {
  return format(endOfMonth(parseDateKey(dateKey)), DATE_KEY_FORMAT)
}

export function mondayIndex(dateKey: string): number {
  const weekday = getDay(parseDateKey(dateKey))
  return weekday === 0 ? 6 : weekday - 1
}

export function mondayOfDateKey(dateKey: string): string {
  return addDaysToDateKey(dateKey, -mondayIndex(dateKey))
}

export function localMidnightIso(dateKey: string, timezone: string): string {
  return fromZonedTime(`${dateKey}T00:00:00`, timezone).toISOString()
}

export function localMonthEndTs(timezone: string, now: Date = new Date()): number {
  return fromZonedTime(endOfMonth(toZonedTime(now, timezone)), timezone).getTime()
}

export interface LocalWeekRange {
  from: string
  to: string
}

export function localWeekRange(dateKey: string, timezone: string): LocalWeekRange {
  const monday = mondayOfDateKey(dateKey)

  return {
    from: localMidnightIso(monday, timezone),
    to: localMidnightIso(addDaysToDateKey(monday, 7), timezone),
  }
}

export function formatDateKey(dateKey: string, pattern: string): string {
  return format(parseDateKey(dateKey), pattern)
}

export function dateKeyToTimestamp(dateKey: string, timezone: string): number {
  return fromZonedTime(`${dateKey}T12:00:00`, timezone).getTime()
}
