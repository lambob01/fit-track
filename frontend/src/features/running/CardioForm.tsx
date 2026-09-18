import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CardioActivity, CardioActivityInput, CardioType, UnitSystem } from '../../api/types'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../context/SettingsContext'
import { fromLocalDateTimeInput, toLocalDateTimeInput } from '../../lib/datetime'
import { formatDuration, parseDurationInput } from '../../lib/duration'
import { mToMi, miToM } from '../../lib/units'

// eslint-disable-next-line react-refresh/only-export-components -- shared label map for the list view
export const CARDIO_TYPE_LABELS: Record<CardioType, string> = {
  run: 'Run',
  cycle: 'Cycle',
  swim: 'Swim',
  row: 'Row',
  other: 'Other',
}

const TYPE_OPTIONS: CardioType[] = ['run', 'cycle', 'swim', 'row', 'other']

function distanceForDisplay(meters: number, unitSystem: UnitSystem): number {
  if (unitSystem === 'imperial') {
    return Number(mToMi(meters).toFixed(2))
  }
  return Number((meters / 1000).toFixed(2))
}

function distanceToMeters(value: number, unitSystem: UnitSystem): number {
  if (unitSystem === 'imperial') {
    return miToM(value)
  }
  return value * 1000
}

export interface CardioFormProps {
  activity: CardioActivity | null
  isSaving: boolean
  error: string | null
  onSubmit: (input: CardioActivityInput) => void
  onCancel: () => void
}

export function CardioForm({ activity, isSaving, error, onSubmit, onCancel }: CardioFormProps) {
  const { unitSystem, timezone } = useSettings()
  const [performedAt, setPerformedAt] = useState(() =>
    toLocalDateTimeInput(activity?.performed_at ?? new Date().toISOString(), timezone),
  )
  const [type, setType] = useState<CardioType>(activity?.type ?? 'run')
  const [distance, setDistance] = useState<number | null>(() =>
    activity?.distance_m == null ? null : distanceForDisplay(activity.distance_m, unitSystem),
  )
  const [durationText, setDurationText] = useState(() =>
    activity === null ? '' : formatDuration(activity.duration_s),
  )
  const [avgHr, setAvgHr] = useState<number | null>(activity?.avg_hr ?? null)
  const [routeName, setRouteName] = useState(activity?.route_name ?? '')
  const [notes, setNotes] = useState(activity?.notes ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const distanceLabel = unitSystem === 'imperial' ? 'mi' : 'km'
  const distancePlaceholder = unitSystem === 'imperial' ? 'e.g. 3.1' : 'e.g. 5'
  const displayError = validationError ?? error

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (performedAt === '') {
      setValidationError('Date and time are required.')
      return
    }

    const durationS = parseDurationInput(durationText)
    if (durationS === null) {
      setValidationError('Enter a duration like 25:00 or 25 (minutes).')
      return
    }

    if (distance !== null && !(distance >= 0)) {
      setValidationError('Distance cannot be negative.')
      return
    }

    if (avgHr !== null && !(avgHr >= 30 && avgHr <= 250)) {
      setValidationError('Average heart rate must be between 30 and 250 bpm.')
      return
    }

    setValidationError(null)
    onSubmit({
      performed_at: fromLocalDateTimeInput(performedAt, timezone),
      type,
      distance_m:
        distance === null ? null : Number(distanceToMeters(distance, unitSystem).toFixed(1)),
      duration_s: durationS,
      avg_hr: avgHr === null ? null : Math.round(avgHr),
      route_name: routeName.trim() === '' ? null : routeName.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
    })
  }

  return (
    <section className="rounded-xl border border-line bg-surface-raised p-4">
      <h2 className="text-sm font-semibold tracking-tight">
        {activity === null ? 'Add activity' : 'Edit activity'}
      </h2>

      <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Date &amp; time</span>
          <input
            type="datetime-local"
            value={performedAt}
            onChange={(event) => setPerformedAt(event.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Type</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as CardioType)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {CARDIO_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Distance ({distanceLabel}, optional)</span>
          <NumberField
            value={distance}
            onChange={setDistance}
            inputMode="decimal"
            placeholder={distancePlaceholder}
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Duration (mm:ss or minutes)</span>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            value={durationText}
            onChange={(event) => setDurationText(event.target.value)}
            placeholder="e.g. 25:00 or 25"
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Avg HR (bpm, optional)</span>
          <NumberField
            value={avgHr}
            onChange={setAvgHr}
            inputMode="numeric"
            placeholder="e.g. 150"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Route name (optional)</span>
          <input
            type="text"
            value={routeName}
            onChange={(event) => setRouteName(event.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
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
            {isSaving ? 'Saving…' : activity === null ? 'Add activity' : 'Save changes'}
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
