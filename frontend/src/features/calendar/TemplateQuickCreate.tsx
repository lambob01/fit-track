import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, plansApi, templatesApi } from '../../api/client'
import type { TemplateInput } from '../../api/types'
import { BottomSheet } from '../../components/BottomSheet'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../context/SettingsContext'
import { randomId } from '../../lib/uuid'
import { ExercisePicker } from '../lifting/ExercisePicker'
import type { PickedExercise } from '../lifting/ExercisePicker'
import {
  assignmentSlots,
  buildTemplateInput,
  nextQuickCreateStep,
  quickTemplateError,
  type QuickTemplateRow,
  type TemplateAssignmentTarget,
} from './quickTemplate'

interface EditorRow extends QuickTemplateRow {
  key: string
  name: string
}

export interface TemplateQuickCreateProps {
  open: boolean
  assignment: TemplateAssignmentTarget | null
  onClose: () => void
}

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

export function TemplateQuickCreate({ open, assignment, onClose }: TemplateQuickCreateProps) {
  const queryClient = useQueryClient()
  const { unitSystem } = useSettings()
  const [name, setName] = useState('')
  const [rows, setRows] = useState<EditorRow[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [createdTemplateId, setCreatedTemplateId] = useState<string | null>(null)

  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg'
  const locked = createdTemplateId !== null

  function invalidateTemplates() {
    void queryClient.invalidateQueries({ queryKey: ['templates'] })
  }

  const assignMutation = useMutation({
    mutationFn: (templateId: string) => {
      if (assignment === null) {
        throw new Error('No day to assign')
      }
      return plansApi.update(assignment.plan.id, {
        slots: assignmentSlots(assignment.plan, assignment.dayOfWeek, templateId),
      })
    },
    onSuccess: () => {
      invalidateTemplates()
      void queryClient.invalidateQueries({ queryKey: ['plans'] })
      void queryClient.invalidateQueries({ queryKey: ['calendar'] })
      onClose()
    },
  })

  const createMutation = useMutation({
    mutationFn: (input: TemplateInput) => templatesApi.create(input),
    onSuccess: (template) => {
      invalidateTemplates()
      if (assignment === null) {
        onClose()
        return
      }
      setCreatedTemplateId(template.id)
      assignMutation.mutate(template.id)
    },
  })

  const busy = createMutation.isPending || assignMutation.isPending
  const flowError = assignMutation.isError
    ? errorDetail(assignMutation.error)
    : createMutation.isError
      ? errorDetail(createMutation.error)
      : null
  const shownError = validationError ?? flowError

  function updateRow(key: string, patch: Partial<EditorRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key))
  }

  function moveRow(index: number, delta: number) {
    setRows((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) {
        return current
      }
      const next = [...current]
      const [row] = next.splice(index, 1)
      next.splice(target, 0, row)
      return next
    })
  }

  function handlePickExercise(exercise: PickedExercise) {
    setPickerOpen(false)
    if (exercise.created) {
      void queryClient.invalidateQueries({ queryKey: ['exercises'] })
    }
    setRows((current) => [
      ...current,
      {
        key: randomId(),
        exerciseId: exercise.id,
        name: exercise.name,
        targetSets: null,
        targetReps: null,
        targetWeight: null,
      },
    ])
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) {
      return
    }
    const step = nextQuickCreateStep(createdTemplateId)
    if (step.kind === 'assign') {
      assignMutation.mutate(step.templateId)
      return
    }
    const draft = { name, rows }
    const error = quickTemplateError(draft)
    if (error !== null) {
      setValidationError(error)
      return
    }
    setValidationError(null)
    createMutation.mutate(buildTemplateInput(draft, unitSystem))
  }

  function handleClose() {
    if (!busy) {
      onClose()
    }
  }

  const submitLabel = busy
    ? 'Saving…'
    : locked
      ? 'Retry assignment'
      : assignment === null
        ? 'Create template'
        : 'Create & assign'

  return (
    <BottomSheet open={open} onClose={handleClose} title="New template">
      <form className="space-y-4 pb-2" onSubmit={handleSubmit}>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-content-muted">Name</span>
          <input
            type="text"
            value={name}
            disabled={locked}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Push Day A"
            className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
          />
        </label>

        <section className="rounded-xl border border-line bg-surface-raised p-3">
          <h3 className="text-sm font-semibold tracking-tight">Exercises</h3>
          <p className="mt-0.5 text-xs text-content-muted">
            Targets are optional. Leave blank to plan the exercise without numbers.
          </p>

          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-content-muted">No exercises added yet.</p>
          ) : (
            <ul className="mt-1">
              {rows.map((row, index) => (
                <li key={row.key} className="border-t border-line py-3 first:border-t-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{row.name}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={locked || index === 0}
                        onClick={() => moveRow(index, -1)}
                        className="min-h-11 min-w-11 rounded-lg border border-line text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={locked || index === rows.length - 1}
                        onClick={() => moveRow(index, 1)}
                        className="min-h-11 min-w-11 rounded-lg border border-line text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label="Remove exercise"
                        disabled={locked}
                        onClick={() => removeRow(row.key)}
                        className="min-h-11 min-w-11 rounded-lg border border-line text-sm font-medium text-content-muted transition-colors hover:border-content-muted hover:text-content disabled:opacity-40"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-content-muted">
                        Sets
                      </span>
                      <NumberField
                        value={row.targetSets}
                        onChange={(value) => updateRow(row.key, { targetSets: value })}
                        inputMode="numeric"
                        placeholder="—"
                        disabled={locked}
                        className="text-center"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-content-muted">
                        Reps
                      </span>
                      <NumberField
                        value={row.targetReps}
                        onChange={(value) => updateRow(row.key, { targetReps: value })}
                        inputMode="numeric"
                        placeholder="—"
                        disabled={locked}
                        className="text-center"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-content-muted">
                        {`Weight (${unitLabel})`}
                      </span>
                      <NumberField
                        value={row.targetWeight}
                        onChange={(value) => updateRow(row.key, { targetWeight: value })}
                        inputMode="decimal"
                        placeholder="—"
                        disabled={locked}
                        className="text-center"
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!locked &&
            (pickerOpen ? (
              <div className="mt-3">
                <ExercisePicker
                  onSelect={handlePickExercise}
                  onCancel={() => setPickerOpen(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-line px-4 text-sm font-semibold text-content-muted transition-colors hover:border-accent hover:text-accent"
              >
                + Add exercise
              </button>
            ))}
        </section>

        {assignment !== null && (
          <p className="text-xs text-content-muted">
            {locked
              ? 'Template created. Retry to assign it to the tapped day.'
              : 'The new template is assigned to the tapped day right away.'}
          </p>
        )}

        {shownError !== null && (
          <p role="alert" className="text-sm font-medium text-content">
            {shownError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 flex-1 rounded-xl bg-accent-strong px-4 text-base font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
          >
            {submitLabel}
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="min-h-12 rounded-xl border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </BottomSheet>
  )
}
