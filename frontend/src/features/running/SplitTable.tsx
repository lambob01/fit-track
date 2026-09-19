import type { CardioSplit, SplitSource, UnitSystem } from '../../api/types'
import { formatDuration } from '../../lib/duration'
import { formatSplitPace } from '../../lib/pace'
import { formatDistance } from '../../lib/units'

export interface SplitTableProps {
  splits: CardioSplit[]
  source: SplitSource
  unitSystem: UnitSystem
}

export function SplitTable({ splits, source, unitSystem }: SplitTableProps) {
  return (
    <section className="rounded-xl border border-line bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Splits</h2>
        <span className="text-xs text-content-muted">
          {source === 'stored' ? 'Recorded' : 'Derived · even pace'}
        </span>
      </div>

      {splits.length === 0 ? (
        <p className="mt-2 text-sm text-content-muted">
          No splits recorded and no distance to derive them from.
        </p>
      ) : (
        <>
          <table className="mt-2 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-content-muted">
                <th scope="col" className="py-1.5 pr-2 font-medium">
                  #
                </th>
                <th scope="col" className="py-1.5 pr-2 font-medium">
                  Distance
                </th>
                <th scope="col" className="py-1.5 pr-2 font-medium">
                  Time
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Pace
                </th>
              </tr>
            </thead>
            <tbody>
              {splits.map((split) => (
                <tr key={split.split_number} className="border-t border-line">
                  <td className="py-2 pr-2 text-content-muted">{split.split_number}</td>
                  <td className="py-2 pr-2">{formatDistance(split.distance_m, unitSystem)}</td>
                  <td className="py-2 pr-2">{formatDuration(split.duration_s)}</td>
                  <td className="py-2 text-right">
                    {formatSplitPace(split.distance_m, split.duration_s, unitSystem) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {source === 'derived' && (
            <p className="mt-2 text-xs text-content-muted">
              Derived from the total distance and time at an even pace; this run has no
              per-split data.
            </p>
          )}
        </>
      )}
    </section>
  )
}
