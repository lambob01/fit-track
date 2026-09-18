import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError, exercisesApi, templatesApi } from '../../api/client'
import type { Template, TemplateExerciseInput, TemplateInput, UnitSystem } from '../../api/types'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../context/SettingsContext'
import { randomId } from '../../lib/uuid'
import { ExercisePicker } from './ExercisePicker'
import type { PickedExercise } from './ExercisePicker'
import { QueryErrorNotice } from './QueryErrorNotice'
import { Toast } from './Toast'
import { displayToKg, displayWeight } from './liftingUnits'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

interface EditorRow {
  key: string
  exerciseId: string
  targetSets: number | null
  targetReps: number | null
  targetWeight: number | null
}

interface TemplateEditorFormProps {
  template: Template | null
  isNew: boolean
  exerciseNames: Map<string, string>
  unitSystem: UnitSystem
  isSaving: boolean
  saveError: string | null
  onSubmit: (input: TemplateInput) => void
  onExerciseCreated: (name: string) => void
  isArchiving: boolean
  onToggleArchive: () => void
  archiveError: string | null
  isDeleting: boolean
  deleteError: string | null
  onDelete: () => void
  exerciseNamesError: string | null
  onRetryExerciseNames: () => void
  toast: string | null
  onDismissToast: () => void
}

function TemplateEditorForm({
  template,
  isNew,
  exerciseNames,
  unitSystem,
  isSaving,
  saveError,
  onSubmit,
  onExerciseCreated,
  isArchiving,
  onToggleArchive,
  archiveError,
  isDeleting,
  deleteError,
  onDelete,
  exerciseNamesError,
  onRetryExerciseNames,
  toast,
  onDismissToast,
}: TemplateEditorFormProps) {
  const [name, setName] = useState(template?.name ?? '')
  const [notes, setNotes] = useState(template?.notes ?? '')
  const [rows, setRows] = useState<EditorRow[]>(() =>
    (template?.exercises ?? []).map((item) => ({
      key: item.id,
      exerciseId: item.exercise_id,
      targetSets: item.target_sets,
      targetReps: item.target_reps,
      targetWeight: displayWeight(item.target_weight_kg, unitSystem),
    })),
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const archived = template?.is_archived ?? false
  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg'

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
      onExerciseCreated(exercise.name)
    }
    setRows((current) => [
      ...current,
      {
        key: randomId(),
        exerciseId: exercise.id,
        targetSets: null,
        targetReps: null,
        targetWeight: null,
      },
    ])
  }

  function buildExercises(): TemplateExerciseInput[] {
    return rows.map((row, index) => ({
      exercise_id: row.exerciseId,
      position: index,
      target_sets:
        row.targetSets !== null && row.targetSets > 0 ? Math.round(row.targetSets) : null,
      target_reps:
        row.targetReps !== null && row.targetReps > 0 ? Math.round(row.targetReps) : null,
      target_weight_kg:
        row.targetWeight !== null && row.targetWeight > 0
          ? displayToKg(row.targetWeight, unitSystem)
          : null,
    }))
  }

  function handleSubmit() {
    if (name.trim() === '') {
      setValidationError('Template name is required.')
      return
    }
    setValidationError(null)
    onSubmit({
      name: name.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
      exercises: buildExercises(),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            to="/lifting/templates"
            className="text-sm font-medium text-content-muted transition-colors hover:text-content"
          >
            ← Templates
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">
            {isNew ? 'New template' : 'Edit template'}
          </h1>
        </div>
        {!isNew && (
          <button
            type="button"
            disabled={isArchiving}
            onClick={onToggleArchive}
            className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {archived ? 'Restore' : 'Archive'}
          </button>
        )}
      </div>

      {archived && (
        <p className="rounded-xl border border-line bg-surface-raised p-3 text-xs text-content-muted">
          This template is archived. It stays usable from history and can be restored at any time.
        </p>
      )}

      {archiveError !== null && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/40 bg-surface-raised p-3 text-xs font-medium text-red-400 light:text-red-600"
        >
          {archiveError}
        </p>
      )}

      {exerciseNamesError !== null && (
        <QueryErrorNotice
          message="Exercise names could not be loaded."
          detail={exerciseNamesError}
          onRetry={onRetryExerciseNames}
        />
      )}

      <section className="space-y-3 rounded-xl border border-line bg-surface-raised p-4">
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-content-muted">Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Push Day A"
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs font-medium text-content-muted">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
      </section>

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="text-sm font-semibold tracking-tight">Exercises</h2>
        <p className="mt-0.5 text-xs text-content-muted">
          Targets are optional. Leave blank to start the exercise without a plan.
        </p>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-content-muted">No exercises added yet.</p>
        ) : (
          <ul className="mt-1">
            {rows.map((row, index) => (
              <li key={row.key} className="border-t border-line py-3 first:border-t-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {exerciseNames.get(row.exerciseId) ?? 'Exercise'}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => moveRow(index, -1)}
                      className="min-h-9 min-w-9 rounded-lg border border-line text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={index === rows.length - 1}
                      onClick={() => moveRow(index, 1)}
                      className="min-h-9 min-w-9 rounded-lg border border-line text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label="Remove exercise"
                      onClick={() => removeRow(row.key)}
                      className="min-h-9 min-w-9 rounded-lg border border-line text-sm font-medium text-content-muted transition-colors hover:border-red-500/60 hover:text-red-400 light:hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-content-muted">Sets</span>
                    <NumberField
                      value={row.targetSets}
                      onChange={(value) => updateRow(row.key, { targetSets: value })}
                      inputMode="numeric"
                      placeholder="—"
                      className="text-center"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-content-muted">Reps</span>
                    <NumberField
                      value={row.targetReps}
                      onChange={(value) => updateRow(row.key, { targetReps: value })}
                      inputMode="numeric"
                      placeholder="—"
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
                      className="text-center"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}

        {pickerOpen ? (
          <div className="mt-3">
            <ExercisePicker onSelect={handlePickExercise} onCancel={() => setPickerOpen(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-line px-4 text-sm font-semibold text-content-muted transition-colors hover:border-accent hover:text-accent"
          >
            + Add exercise
          </button>
        )}
      </section>

      {(validationError !== null || saveError !== null) && (
        <p role="alert" className="text-sm text-red-400 light:text-red-600">
          {validationError ?? saveError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving}
          className="min-h-12 flex-1 rounded-xl bg-accent-strong px-4 text-base font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : isNew ? 'Create template' : 'Save template'}
        </button>
        <Link
          to="/lifting/templates"
          className="flex min-h-12 items-center rounded-xl border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Cancel
        </Link>
      </div>

      {!isNew && (
        <section className="rounded-xl border border-line bg-surface-raised p-4">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">Delete this template? Past workouts are kept.</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="min-h-10 rounded-lg border border-red-500/60 px-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50 light:text-red-600"
                >
                  {isDeleting ? 'Deleting…' : 'Delete template'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-10 text-sm font-medium text-content-muted transition-colors hover:text-red-400 light:hover:text-red-600"
            >
              Delete template
            </button>
          )}
          {deleteError !== null && (
            <p role="alert" className="mt-2 text-sm text-red-400 light:text-red-600">
              {deleteError}
            </p>
          )}
        </section>
      )}

      <Toast message={toast} onDismiss={onDismissToast} />
    </div>
  )
}

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === undefined || id === 'new'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { unitSystem } = useSettings()
  const [toast, setToast] = useState<string | null>(null)

  const dismissToast = useCallback(() => setToast(null), [])

  const templateQuery = useQuery({
    queryKey: ['templates', id],
    queryFn: () => templatesApi.get(id!),
    enabled: !isNew,
  })

  const exercisesQuery = useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: () => exercisesApi.list({ include_archived: true, limit: 500 }),
    staleTime: 5 * 60 * 1000,
  })

  const exerciseNames = useMemo(
    () => new Map((exercisesQuery.data ?? []).map((exercise) => [exercise.id, exercise.name])),
    [exercisesQuery.data],
  )

  function invalidateTemplates() {
    void queryClient.invalidateQueries({ queryKey: ['templates'] })
  }

  const createMutation = useMutation({
    mutationFn: (input: TemplateInput) => templatesApi.create(input),
    onSuccess: () => {
      invalidateTemplates()
      navigate('/lifting/templates')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: TemplateInput) => templatesApi.update(id!, input),
    onSuccess: () => {
      invalidateTemplates()
      navigate('/lifting/templates')
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (isArchived: boolean) => templatesApi.update(id!, { is_archived: isArchived }),
    onSuccess: (data) => {
      queryClient.setQueryData(['templates', id], data)
      invalidateTemplates()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => templatesApi.remove(id!),
    onSuccess: () => {
      invalidateTemplates()
      navigate('/lifting/templates')
    },
  })

  if (!isNew && templateQuery.isPending) {
    return <p className="text-sm text-content-muted">Loading template…</p>
  }

  if (!isNew && (templateQuery.isError || templateQuery.data === undefined)) {
    return (
      <div role="alert" className="rounded-xl border border-line bg-surface-raised p-4 text-sm">
        <p className="font-medium">Could not load this template.</p>
        <p className="mt-1 text-content-muted">{errorDetail(templateQuery.error)}</p>
        <Link
          to="/lifting/templates"
          className="mt-3 inline-block min-h-9 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Back to templates
        </Link>
      </div>
    )
  }

  const saveError = createMutation.isError
    ? errorDetail(createMutation.error)
    : updateMutation.isError
      ? errorDetail(updateMutation.error)
      : null

  return (
    <TemplateEditorForm
      key={templateQuery.data?.id ?? 'new'}
      template={templateQuery.data ?? null}
      isNew={isNew}
      exerciseNames={exerciseNames}
      unitSystem={unitSystem}
      isSaving={createMutation.isPending || updateMutation.isPending}
      saveError={saveError}
      onSubmit={(input) => {
        if (isNew) {
          createMutation.mutate(input)
        } else {
          updateMutation.mutate(input)
        }
      }}
      onExerciseCreated={(newName) => {
        setToast(`New exercise created: ${newName}`)
        void queryClient.invalidateQueries({ queryKey: ['exercises'] })
      }}
      isArchiving={archiveMutation.isPending}
      onToggleArchive={() => archiveMutation.mutate(!(templateQuery.data?.is_archived ?? false))}
      archiveError={archiveMutation.isError ? errorDetail(archiveMutation.error) : null}
      isDeleting={deleteMutation.isPending}
      deleteError={deleteMutation.isError ? errorDetail(deleteMutation.error) : null}
      onDelete={() => deleteMutation.mutate()}
      exerciseNamesError={exercisesQuery.isError ? errorDetail(exercisesQuery.error) : null}
      onRetryExerciseNames={() => void exercisesQuery.refetch()}
      toast={toast}
      onDismissToast={dismissToast}
    />
  )
}
