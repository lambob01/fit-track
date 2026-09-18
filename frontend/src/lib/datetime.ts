import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

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
  return formatInTimeZone(new Date(iso), timezone, 'yyyy-MM-dd')
}
