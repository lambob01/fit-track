import type { CardioZones } from '../../api/types'
import { formatDuration } from '../../lib/duration'

export interface ZonesBarProps {
  zones: CardioZones | null
  avgHr: number | null
}

export function ZonesBar({ zones, avgHr }: ZonesBarProps) {
  if (zones === null) {
    return null
  }

  const maxSeconds = Math.max(0, ...zones.zones.map((zone) => zone.seconds))

  return (
    <section className="rounded-xl border border-line bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Heart rate zones</h2>
        <span className="text-xs text-content-muted">Max HR {zones.max_hr} bpm</span>
      </div>

      <ul className="mt-3 space-y-2">
        {zones.zones.map((zone) => (
          <li key={zone.zone} className="flex items-center gap-2 text-xs">
            <span className="w-7 shrink-0 font-medium">{zone.zone}</span>
            <span className="w-16 shrink-0 text-content-muted">{zone.label}</span>
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent"
                style={{
                  width: maxSeconds > 0 ? `${(zone.seconds / maxSeconds) * 100}%` : '0%',
                }}
              />
            </div>
            <span className="w-14 shrink-0 text-right tabular-nums">
              {formatDuration(zone.seconds)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-content-muted">
        {avgHr === null
          ? 'No average heart rate was recorded for this activity, so zone times are unavailable.'
          : `Estimated from the session average HR (${avgHr} bpm), not per-beat heart rate.`}
      </p>
    </section>
  )
}
