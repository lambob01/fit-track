import type { ProgressSession } from '../../api/types'

export type ProgressMetric = 'top_set' | 'e1rm' | 'volume'

export type ProgressSeriesKey = ProgressMetric | 'reps_volume'

export const PROGRESS_METRICS: { key: ProgressMetric; label: string }[] = [
  { key: 'top_set', label: 'Top set' },
  { key: 'e1rm', label: 'e1RM' },
  { key: 'volume', label: 'Volume' },
]

export const SERIES_META: Record<ProgressSeriesKey, { name: string; isWeight: boolean }> = {
  top_set: { name: 'Top set', isWeight: true },
  e1rm: { name: 'e1RM', isWeight: true },
  volume: { name: 'Volume', isWeight: true },
  reps_volume: { name: 'Reps', isWeight: false },
}

export interface ProgressPoint {
  ts: number
  value: number | null
}

export function hasWeightedSessions(sessions: ProgressSession[]): boolean {
  return sessions.some((session) => session.top_set_kg !== null)
}

export function progressSeriesValue(
  session: ProgressSession,
  series: ProgressSeriesKey,
): number | null {
  switch (series) {
    case 'top_set':
      return session.top_set_kg
    case 'e1rm':
      return session.e1rm_kg
    case 'volume':
      return session.volume_kg
    case 'reps_volume':
      return session.reps_volume
  }
}

export function buildProgressData(
  sessions: ProgressSession[],
  series: ProgressSeriesKey,
): ProgressPoint[] {
  return sessions
    .map((session) => ({
      ts: new Date(session.performed_at).getTime(),
      value: progressSeriesValue(session, series),
    }))
    .sort((a, b) => a.ts - b.ts)
}

export function buildProgressYDomain(
  points: ProgressPoint[],
): [number, number] | undefined {
  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]))
  if (values.length === 0) {
    return undefined
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const padding = span > 0 ? span * 0.15 : Math.max(max * 0.1, 1)

  return [Math.max(0, min - padding), max + padding]
}
