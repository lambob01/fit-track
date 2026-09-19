import { addDays, format, getDay, parse } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

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

export function mondayOfDateKey(dateKey: string): string {
  const weekday = getDay(parseDateKey(dateKey))
  return addDaysToDateKey(dateKey, weekday === 0 ? -6 : 1 - weekday)
}

export function formatDateKey(dateKey: string, pattern: string): string {
  return format(parseDateKey(dateKey), pattern)
}
