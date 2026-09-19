import type { UnitSystem } from '../api/types'
import { distanceForDisplay, formatPace } from './units'

export const SPLIT_SEGMENT_M = 1000
const DISTANCE_EPSILON_M = 1e-6

export function paceSecondsPerKm(
  distanceM: number | null,
  durationS: number | null,
): number | null {
  if (distanceM === null || !Number.isFinite(distanceM) || distanceM <= 0) {
    return null
  }
  if (durationS === null || !Number.isFinite(durationS) || durationS <= 0) {
    return null
  }
  return durationS / (distanceM / 1000)
}

export function formatSplitPace(
  distanceM: number | null,
  durationS: number | null,
  unitSystem: UnitSystem,
): string | null {
  const pace = paceSecondsPerKm(distanceM, durationS)
  return pace === null ? null : formatPace(pace, unitSystem)
}

/** Per-kilometer segment distances (in meters, last segment = remainder) for a total distance. */
export function inferSplitDistances(distanceM: number | null): number[] {
  if (distanceM === null || !Number.isFinite(distanceM) || distanceM <= 0) {
    return []
  }

  const segments: number[] = []
  let remaining = distanceM
  while (remaining > DISTANCE_EPSILON_M) {
    const segment = Math.min(SPLIT_SEGMENT_M, remaining)
    segments.push(Math.round(segment * 10) / 10)
    remaining -= segment
  }
  return segments
}

/**
 * Canonical per-kilometer segments converted to display units for the splits editor.
 * Segments that would round to `0.00` in the given unit system (e.g. a few-meter remainder
 * in imperial) are merged into the preceding segment so no unusable row is generated.
 */
export function splitRowDistances(
  distanceM: number | null,
  unitSystem: UnitSystem,
): number[] {
  const merged: number[] = []
  for (const segment of inferSplitDistances(distanceM)) {
    if (distanceForDisplay(segment, unitSystem) <= 0 && merged.length > 0) {
      merged[merged.length - 1] += segment
      continue
    }
    merged.push(segment)
  }
  return merged
    .map((segment) => distanceForDisplay(segment, unitSystem))
    .filter((value) => value > 0)
}
