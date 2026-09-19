import { useState } from 'react'
import type { FormEvent } from 'react'
import type { WeightEntry, WeightEntryInput } from '../../api/types'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../context/SettingsContext'
import { fromLocalDateTimeInput, toLocalDateTimeInput } from '../../lib/datetime'
import { kgToLb, lbToKg, weightStep } from '../../lib/units'

export interface WeightFormProps {
  entry: WeightEntry | null
  isSaving: boolean
  error: string | null
  onSubmit: (input: WeightEntryInput) => void
  onCancel: () => void
}

export function WeightForm({ entry, isSaving, error, onSubmit, onCancel }: WeightFormProps) {
  const { unitSystem, timezone } = useSettings()
  const [measuredAt, setMeasuredAt] = useState(() =>
    toLocalDateTimeInput(entry?.measured_at ?? new Date().toISOString(), timezone),
  )
  const [weight, setWeight] = useState<number | null>(() => {
    if (entry === null) {
      return null
    }
    return unitSystem === 'imperial' ? Number(kgToLb(entry.weight_kg).toFixed(1)) : entry.weight_kg
  })
  const [bodyFat, setBodyFat] = useState<number | null>(entry?.body_fat_pct ?? null)
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg'
  const displayError = validationError ?? error

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (measuredAt === '') {
      setValidationError('Date and time are required.')
      return
    }

    if (weight === null || !(weight > 0)) {
      setValidationError('Enter a weight greater than 0.')
      return
    }

    if (bodyFat !== null && !(bodyFat > 0 && bodyFat < 100)) {
      setValidationError('Body fat must be greater than 0 and less than 100.')
      return
    }

    setValidationError(null)
    const weightKg = unitSystem === 'imperial' ? lbToKg(weight) : weight

    onSubmit({
      measured_at: fromLocalDateTimeInput(measuredAt, timezone),
      weight_kg: Number(weightKg.toFixed(3)),
      body_fat_pct: bodyFat,
      notes: notes.trim() === '' ? null : notes.trim(),
    })
  }

  return (
    <section className="rounded-xl border border-line bg-surface-raised p-4">
      <h2 className="text-sm font-semibold tracking-tight">
        {entry === null ? 'Add weight' : 'Edit weight'}
      </h2>

      <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Date &amp; time</span>
          <input
            type="datetime-local"
            value={measuredAt}
            onChange={(event) => setMeasuredAt(event.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Weight ({unitLabel})</span>
          <NumberField
            value={weight}
            onChange={setWeight}
            step={weightStep(unitSystem)}
            stepperLabel={`Weight (${unitLabel})`}
            inputMode="decimal"
            placeholder={unitSystem === 'imperial' ? 'e.g. 175' : 'e.g. 80'}
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Body fat % (optional)</span>
          <NumberField
            value={bodyFat}
            onChange={setBodyFat}
            inputMode="decimal"
            placeholder="e.g. 18"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>

        {displayError !== null && (
          <p role="alert" className="text-sm text-red-400 light:text-red-600">
            {displayError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSaving}
            className="min-h-11 flex-1 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : entry === null ? 'Add entry' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}
