import { useState } from 'react'
import type { SetPatch, UnitSystem, WorkoutSet } from '../../api/types'
import { NumberField } from '../../components/NumberField'
import { formatWeight } from '../../lib/units'
import { displayToKg, displayWeight } from './liftingUnits'

function normalizeRpe(value: number | null): number | null {
  if (value === null) {
    return null
  }
  const clamped = Math.min(10, Math.max(0, value))
  return Math.round(clamped * 2) / 2
}

function round3(value: number): number {
  return Number(value.toFixed(3))
}

export interface StepperFieldProps {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  step: number
  inputMode: 'decimal' | 'numeric'
  placeholder?: string
  disabled?: boolean
}

export function StepperField({
  label,
  value,
  onChange,
  step,
  inputMode,
  placeholder,
  disabled,
}: StepperFieldProps) {
  function decrement() {
    if (value === null) {
      return
    }
    const next = round3(value - step)
    onChange(next > 0 ? next : null)
  }

  function increment() {
    onChange(value === null ? step : round3(value + step))
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-content-muted">{label}</span>
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={decrement}
          disabled={disabled || value === null}
          className="min-h-12 min-w-12 shrink-0 rounded-lg border border-line bg-surface text-xl font-semibold text-content transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          −
        </button>
        <div className="min-w-0 flex-1">
          <NumberField
            value={value}
            onChange={onChange}
            inputMode={inputMode}
            placeholder={placeholder}
            disabled={disabled}
            className="h-12 text-center"
          />
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={increment}
          disabled={disabled}
          className="min-h-12 min-w-12 shrink-0 rounded-lg border border-line bg-surface text-xl font-semibold text-content transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  )
}

export interface SetRowProps {
  set: WorkoutSet
  unitSystem: UnitSystem
  isBusy: boolean
  onPatch: (patch: SetPatch) => void
  onDelete: () => void
}

export function SetRow({ set, unitSystem, isBusy, onPatch, onDelete }: SetRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [weight, setWeight] = useState<number | null>(null)
  const [reps, setReps] = useState<number | null>(null)
  const [rpe, setRpe] = useState<number | null>(null)
  const [isWarmup, setIsWarmup] = useState(false)

  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg'

  function openEditor() {
    setWeight(displayWeight(set.weight_kg, unitSystem))
    setReps(set.reps)
    setRpe(set.rpe)
    setIsWarmup(set.is_warmup)
    setExpanded(true)
  }

  function save() {
    if (reps === null || reps < 1) {
      return
    }
    onPatch({
      weight_kg: displayToKg(weight, unitSystem),
      reps,
      rpe: normalizeRpe(rpe),
      is_warmup: isWarmup,
    })
    setExpanded(false)
  }

  if (!expanded) {
    return (
      <li className="flex items-center gap-2 border-t border-line py-2 first:border-t-0">
        <span className="w-6 shrink-0 text-center text-xs tabular-nums text-content-muted">
          {set.set_number}
        </span>
        <button
          type="button"
          onClick={openEditor}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate font-medium tabular-nums">
            {set.weight_kg === null ? 'Bodyweight' : formatWeight(set.weight_kg, unitSystem)} ×{' '}
            {set.reps}
          </span>
          {set.rpe !== null && <span className="text-xs text-content-muted">@{set.rpe}</span>}
          {set.is_warmup && (
            <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-content-muted">
              Warmup
            </span>
          )}
        </button>
      </li>
    )
  }

  return (
    <li className="border-t border-line py-3 first:border-t-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-content-muted">Set {set.set_number}</span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="min-h-9 rounded-lg px-2 text-xs font-medium text-content-muted transition-colors hover:text-content"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StepperField
          label={`Weight (${unitLabel})`}
          value={weight}
          onChange={setWeight}
          step={unitSystem === 'imperial' ? 5 : 2.5}
          inputMode="decimal"
          placeholder="BW"
          disabled={isBusy}
        />
        <StepperField
          label="Reps"
          value={reps}
          onChange={setReps}
          step={1}
          inputMode="numeric"
          disabled={isBusy}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-pressed={isWarmup}
          onClick={() => setIsWarmup((current) => !current)}
          className={[
            'min-h-11 rounded-lg border px-3 text-xs font-medium transition-colors',
            isWarmup
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-line text-content-muted hover:border-accent hover:text-accent',
          ].join(' ')}
        >
          Warmup
        </button>
        <label className="flex items-center gap-1.5 text-xs font-medium text-content-muted">
          RPE
          <span className="block w-16">
            <NumberField
              value={rpe}
              onChange={setRpe}
              inputMode="decimal"
              placeholder="—"
              disabled={isBusy}
              className="text-center"
            />
          </span>
        </label>
        <button
          type="button"
          onClick={save}
          disabled={isBusy || reps === null || reps < 1}
          className="ml-auto min-h-11 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          Save
        </button>
      </div>

      <button
        type="button"
        onClick={onDelete}
        disabled={isBusy}
        className="mt-2 min-h-9 text-xs font-medium text-red-400 transition-colors hover:text-red-300 disabled:opacity-50 light:text-red-600 light:hover:text-red-500"
      >
        Delete set
      </button>
    </li>
  )
}

export interface SetDraft {
  weight: number | null
  reps: number | null
  rpe: number | null
  isWarmup: boolean
}

export interface SetInputRowProps {
  nextNumber: number
  initialWeight: number | null
  initialReps: number | null
  unitSystem: UnitSystem
  isAdding: boolean
  onAdd: (draft: SetDraft) => void
}

export function SetInputRow({
  nextNumber,
  initialWeight,
  initialReps,
  unitSystem,
  isAdding,
  onAdd,
}: SetInputRowProps) {
  const [weight, setWeight] = useState<number | null>(initialWeight)
  const [reps, setReps] = useState<number | null>(initialReps)
  const [rpe, setRpe] = useState<number | null>(null)
  const [isWarmup, setIsWarmup] = useState(false)

  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg'
  const canAdd = reps !== null && reps >= 1 && !isAdding

  function submit() {
    if (!canAdd) {
      return
    }
    onAdd({ weight, reps, rpe: normalizeRpe(rpe), isWarmup })
    setRpe(null)
    setIsWarmup(false)
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="grid grid-cols-2 gap-2">
        <StepperField
          label={`Weight (${unitLabel})`}
          value={weight}
          onChange={setWeight}
          step={unitSystem === 'imperial' ? 5 : 2.5}
          inputMode="decimal"
          placeholder="BW"
          disabled={isAdding}
        />
        <StepperField
          label="Reps"
          value={reps}
          onChange={setReps}
          step={1}
          inputMode="numeric"
          disabled={isAdding}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-pressed={isWarmup}
          onClick={() => setIsWarmup((current) => !current)}
          disabled={isAdding}
          className={[
            'min-h-12 rounded-lg border px-3 text-xs font-medium transition-colors',
            isWarmup
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-line text-content-muted hover:border-accent hover:text-accent',
          ].join(' ')}
        >
          Warmup
        </button>
        <label className="flex items-center gap-1.5 text-xs font-medium text-content-muted">
          RPE
          <span className="block w-16">
            <NumberField
              value={rpe}
              onChange={setRpe}
              inputMode="decimal"
              placeholder="—"
              disabled={isAdding}
              className="text-center"
            />
          </span>
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={!canAdd}
          className="ml-auto min-h-12 flex-1 rounded-xl bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          {isAdding ? 'Adding…' : `+ Add set ${nextNumber}`}
        </button>
      </div>
    </div>
  )
}
