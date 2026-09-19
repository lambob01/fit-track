import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, exercisesApi } from '../../api/client'
import type { Exercise, ExerciseGoalMode, ExercisePatch } from '../../api/types'
import { BottomSheet } from '../../components/BottomSheet'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../context/SettingsContext'
import { weightStep } from '../../lib/units'
import { displayWeight } from './liftingUnits'
import {
  clearedGoalPatch,
  goalDraftError,
  goalDraftToPatch,
  initialGoalMode,
} from './progressSeries'
import type { GoalDraft } from './progressSeries'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

function hasGoal(exercise: Exercise): boolean {
  return (
    exercise.goal_weight_kg !== null ||
    exercise.goal_reps_bodyweight !== null ||
    exercise.goal_target_date !== null
  )
}

export interface ExerciseGoalFormProps {
  exercise: Exercise
  hasWeightedSets: boolean
  onClose: () => void
}

export function ExerciseGoalForm({
  exercise,
  hasWeightedSets,
  onClose,
}: ExerciseGoalFormProps) {
  const { unitSystem } = useSettings()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<ExerciseGoalMode>(() =>
    initialGoalMode(exercise, hasWeightedSets),
  )
  const [weight, setWeight] = useState<number | null>(() =>
    displayWeight(exercise.goal_weight_kg, unitSystem),
  )
  const [reps, setReps] = useState<number | null>(exercise.goal_reps)
  const [bodyweightReps, setBodyweightReps] = useState<number | null>(
    exercise.goal_reps_bodyweight,
  )
  const [targetDate, setTargetDate] = useState<string>(exercise.goal_target_date ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (patch: ExercisePatch) => exercisesApi.update(exercise.id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exercises'] })
      void queryClient.invalidateQueries({ queryKey: ['exercise-progress', exercise.id] })
      onClose()
    },
  })

  const editingGoal = hasGoal(exercise)
  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg'

  function draft(): GoalDraft {
    return {
      mode,
      weight,
      reps,
      bodyweightReps,
      targetDate: targetDate === '' ? null : targetDate,
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const error = goalDraftError(draft())
    if (error !== null) {
      setValidationError(error)
      return
    }
    setValidationError(null)
    mutation.mutate(goalDraftToPatch(draft(), unitSystem))
  }

  function handleRemove() {
    setValidationError(null)
    mutation.mutate(clearedGoalPatch())
  }

  const displayError =
    validationError ?? (mutation.isError ? errorDetail(mutation.error) : null)

  return (
    <BottomSheet
      open
      title={editingGoal ? 'Edit goal' : 'Set goal'}
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div role="group" aria-label="Goal type" className="flex gap-1.5">
          {(
            [
              { key: 'weight', label: 'Weighted' },
              { key: 'bodyweight', label: 'Bodyweight' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className={[
                'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors',
                mode === key
                  ? 'border-accent bg-accent text-surface'
                  : 'border-line bg-surface text-content-muted hover:border-content-muted hover:text-content',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'weight' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-content-muted">
                Target weight ({unitLabel})
              </span>
              <NumberField
                value={weight}
                onChange={setWeight}
                inputMode="decimal"
                step={weightStep(unitSystem)}
                stepperLabel="target weight"
                placeholder={unitSystem === 'imperial' ? 'e.g. 225' : 'e.g. 100'}
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-content-muted">
                Target reps (optional)
              </span>
              <NumberField
                value={reps}
                onChange={setReps}
                inputMode="numeric"
                placeholder="e.g. 5"
              />
            </label>
          </div>
        ) : (
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-content-muted">Target reps</span>
            <NumberField
              value={bodyweightReps}
              onChange={setBodyweightReps}
              inputMode="numeric"
              placeholder="e.g. 15"
            />
          </label>
        )}

        <label className="block space-y-1">
          <span className="block text-xs font-medium text-content-muted">
            Target date (optional)
          </span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <span className="block text-xs text-content-muted">
            Without a date the goal shows as a flat target line.
          </span>
        </label>

        {displayError !== null && (
          <p role="alert" className="text-sm text-red-400 light:text-red-600">
            {displayError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="min-h-11 flex-1 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Save goal'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Cancel
          </button>
        </div>

        {editingGoal && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={mutation.isPending}
            className="min-h-11 w-full text-sm font-medium text-content-muted transition-colors hover:text-red-400 light:hover:text-red-600 disabled:opacity-50"
          >
            Remove goal
          </button>
        )}
      </form>
    </BottomSheet>
  )
}
