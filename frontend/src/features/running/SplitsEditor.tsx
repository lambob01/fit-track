import type { UnitSystem } from '../../api/types'
import { NumberField } from '../../components/NumberField'
import { TrashIcon } from '../../components/icons'

export interface SplitRowDraft {
  distance: number | null
  durationText: string
}

export interface SplitsEditorProps {
  rows: SplitRowDraft[]
  unitSystem: UnitSystem
  onChange: (rows: SplitRowDraft[]) => void
  onAddRow: () => void
  onRemoveAll: () => void
}

export function SplitsEditor({
  rows,
  unitSystem,
  onChange,
  onAddRow,
  onRemoveAll,
}: SplitsEditorProps) {
  const distanceUnit = unitSystem === 'imperial' ? 'mi' : 'km'

  function updateRow(index: number, patch: Partial<SplitRowDraft>) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  return (
    <div role="group" aria-label="Splits" className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-content-muted">Splits (optional)</p>
        <button
          type="button"
          onClick={onRemoveAll}
          className="min-h-11 rounded-lg px-2 text-xs font-medium text-content-muted transition-colors hover:text-content"
        >
          Remove all
        </button>
      </div>

      <div className="mt-1 space-y-2">
        {rows.map((row, index) => (
          <div
            key={index}
            className="rounded-lg border border-line bg-surface-raised p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">Split {index + 1}</p>
              <button
                type="button"
                aria-label={`Remove split ${index + 1}`}
                onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-content-muted transition-colors hover:text-content"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1 flex gap-2">
              <label className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-[11px] text-content-muted">
                  Distance ({distanceUnit})
                </span>
                <NumberField
                  value={row.distance}
                  onChange={(value) => updateRow(index, { distance: value })}
                  inputMode="decimal"
                />
              </label>
              <label className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-[11px] text-content-muted">Time (mm:ss)</span>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={row.durationText}
                  onChange={(event) => updateRow(index, { durationText: event.target.value })}
                  placeholder="e.g. 5:30"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddRow}
        className="mt-2 min-h-11 w-full rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
      >
        + Add split
      </button>
    </div>
  )
}
