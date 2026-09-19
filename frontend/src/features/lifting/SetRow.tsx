import { useState } from 'react'
import type { SetPatch, UnitSystem, WorkoutSet } from '../../api/types'
import { NumberField } from '../../components/NumberField'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  TrashIcon,
} from '../../components/icons'
import { formatWeight, weightStep } from '../../lib/units'
import { displayToKg, displayWeight } from './liftingUnits'

function normalizeRpe(value: number | null): number | null {
  if (value === null) {
    return null
  }
  const clamped = Math.min(10, Math.max(0, value))
  return Math.round(clamped * 2) / 2
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
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-content-muted">{label}</span>
      <NumberField
        value={value}
        onChange={onChange}
        step={step}
        stepperLabel={label}
        inputMode={inputMode}
        placeholder={placeholder}
        disabled={disabled}
        className="h-12 text-center"
      />
    </div>
  )
}

export interface SetRowProps {
  set: WorkoutSet
  unitSystem: UnitSystem
  isBusy: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onPatch: (patch: SetPatch) => Promise<unknown>
  onDelete: () => void
  onMove: (direction: 'up' | 'down') => void
}

const iconButtonClass =
  'grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-content-muted transition-colors hover:text-content disabled:opacity-30'

export function SetRow({
  set,
  unitSystem,
  isBusy,
  canMoveUp,
  canMoveDown,
  onPatch,
  onDelete,
  onMove,
}: SetRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [weight, setWeight] = useState<number | null>(null)
  const [reps, setReps] = useState<number | null>(null)
  const [rpe, setRpe] = useState<number | null>(null)
  const [isWarmup, setIsWarmup] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg'

  function openEditor() {
    setWeight(displayWeight(set.weight_kg, unitSystem))
    setReps(set.reps)
    setRpe(set.rpe)
    setIsWarmup(set.is_warmup)
    setExpanded(true)
  }

  async function save() {
    if (reps === null || reps < 1 || isBusy || isSaving) {
      return
    }
    setIsSaving(true)
    try {
      await onPatch({
        weight_kg: displayToKg(weight, unitSystem),
        reps,
        rpe: normalizeRpe(rpe),
        is_warmup: isWarmup,
      })
      setExpanded(false)
    } catch {
      // The parent rolls the optimistic update back and shows the error.
    } finally {
      setIsSaving(false)
    }
  }

  const reorderButtons = (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        aria-label={`Move set ${set.set_number} up`}
        onClick={() => onMove('up')}
        disabled={!canMoveUp || isBusy}
        className={iconButtonClass}
      >
        <ChevronUpIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={`Move set ${set.set_number} down`}
        onClick={() => onMove('down')}
        disabled={!canMoveDown || isBusy}
        className={iconButtonClass}
      >
        <ChevronDownIcon className="h-4 w-4" />
      </button>
    </div>
  )

  const deleteButton = (
    <button
      type="button"
      aria-label={`Delete set ${set.set_number}`}
      onClick={onDelete}
      disabled={isBusy || isSaving}
      className={`${iconButtonClass} hover:text-content`}
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  )

  if (!expanded) {
    return (
      <li className="flex items-center gap-0.5 border-t border-line py-0.5 first:border-t-0">
        {reorderButtons}
        <span className="w-5 shrink-0 text-center text-xs tabular-nums text-content-muted">
          {set.set_number}
        </span>
        <button
          type="button"
          onClick={openEditor}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
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
        <button
          type="button"
          aria-label={`Edit set ${set.set_number}`}
          onClick={openEditor}
          disabled={isBusy}
          className={iconButtonClass}
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        {deleteButton}
      </li>
    )
  }

  const busy = isBusy || isSaving

  return (
    <li className="border-t border-line py-1 first:border-t-0">
      <div className="flex items-center gap-0.5">
        {reorderButtons}
        <span className="text-xs font-medium text-content-muted">Set {set.set_number}</span>
        <div className="ml-auto flex shrink-0 items-center">
          <button
            type="button"
            aria-label={`Editing set ${set.set_number}`}
            disabled
            className={`${iconButtonClass} text-accent`}
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          {deleteButton}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            disabled={busy}
            className="min-h-11 rounded-lg px-2 text-xs font-medium text-content-muted transition-colors hover:text-content disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StepperField
          label={`Weight (${unitLabel})`}
          value={weight}
          onChange={setWeight}
          step={weightStep(unitSystem)}
          inputMode="decimal"
          placeholder="BW"
          disabled={busy}
        />
        <StepperField
          label="Reps"
          value={reps}
          onChange={setReps}
          step={1}
          inputMode="numeric"
          disabled={busy}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-pressed={isWarmup}
          onClick={() => setIsWarmup((current) => !current)}
          disabled={busy}
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
              disabled={busy}
              className="text-center"
            />
          </span>
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || reps === null || reps < 1}
          className="ml-auto min-h-11 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
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
          step={weightStep(unitSystem)}
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
