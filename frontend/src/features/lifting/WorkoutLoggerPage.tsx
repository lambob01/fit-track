import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError, exercisesApi, templatesApi, workoutsApi } from '../../api/client'
import type {
  Exercise,
  PlannedExercise,
  SetInput,
  SetPatch,
  UnitSystem,
  Workout,
  WorkoutExercise,
  WorkoutPatch,
  WorkoutSet,
} from '../../api/types'
import { useSettings } from '../../context/SettingsContext'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DeleteFlow } from '../../components/DeleteFlow'
import { formatLocal } from '../../lib/datetime'
import { randomId } from '../../lib/uuid'
import { formatWeight } from '../../lib/units'
import { DownloadBackupButton } from '../settings/BackupFirst'
import { ExercisePicker } from './ExercisePicker'
import type { PickedExercise } from './ExercisePicker'
import { QueryErrorNotice } from './QueryErrorNotice'
import { SetInputRow, SetRow } from './SetRow'
import type { SetDraft } from './SetRow'
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

function nextPosition(workout: Workout): number {
  return workout.exercises.reduce((max, item) => Math.max(max, item.position + 1), 0)
}

function nextSetNumber(item: WorkoutExercise): number {
  return item.sets.reduce((max, set) => Math.max(max, set.set_number), 0) + 1
}

interface RollbackContext {
  previous: Workout | undefined
}

function optimisticUpdate(
  queryClient: QueryClient,
  workoutId: string,
  updater: (workout: Workout) => Workout,
): RollbackContext {
  const previous = queryClient.getQueryData<Workout>(['workouts', workoutId])
  if (previous !== undefined) {
    queryClient.setQueryData<Workout>(['workouts', workoutId], updater(previous))
  }
  return { previous }
}

function handleRollback(
  queryClient: QueryClient,
  workoutId: string,
  context: RollbackContext | undefined,
) {
  if (context !== undefined && context.previous !== undefined) {
    queryClient.setQueryData(['workouts', workoutId], context.previous)
  }
}

function optimisticSet(item: WorkoutExercise, input: SetInput): WorkoutSet {
  return {
    id: input.id ?? randomId(),
    set_number: input.set_number ?? nextSetNumber(item),
    weight_kg: input.weight_kg ?? null,
    reps: input.reps,
    rpe: input.rpe ?? null,
    is_warmup: input.is_warmup ?? false,
    is_drop_set: input.is_drop_set ?? false,
    notes: input.notes ?? null,
  }
}

function reorderSets(sets: WorkoutSet[], setIds: string[]): WorkoutSet[] {
  if (setIds.length !== sets.length) {
    return sets
  }
  const byId = new Map(sets.map((set) => [set.id, set]))
  const ordered: WorkoutSet[] = []
  for (const [index, setId] of setIds.entries()) {
    const set = byId.get(setId)
    if (set === undefined) {
      return sets
    }
    ordered.push({ ...set, set_number: index + 1 })
  }
  return ordered
}

interface ExerciseGroupProps {
  item: WorkoutExercise
  exercise: Exercise | undefined
  planned: PlannedExercise | undefined
  unitSystem: UnitSystem
  timezone: string
  isAddingSet: boolean
  isRemoving: boolean
  isReordering: boolean
  removeError: string | null
  pendingSetId: string | null
  onAddSet: (draft: SetDraft) => void
  onPatchSet: (setId: string, patch: SetPatch) => Promise<unknown>
  onDeleteSet: (set: WorkoutSet) => void
  onReorderSets: (orderedIds: string[]) => void
  onRemove: () => void
}

function ExerciseGroup({
  item,
  exercise,
  planned,
  unitSystem,
  timezone,
  isAddingSet,
  isRemoving,
  isReordering,
  removeError,
  pendingSetId,
  onAddSet,
  onPatchSet,
  onDeleteSet,
  onReorderSets,
  onRemove,
}: ExerciseGroupProps) {
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)

  function moveSet(setId: string, direction: 'up' | 'down') {
    const ids = item.sets.map((entry) => entry.id)
    const index = ids.indexOf(setId)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= ids.length) {
      return
    }
    const next = ids.slice()
    const moved = next[index]
    next[index] = next[target]
    next[target] = moved
    onReorderSets(next)
  }

  const perfQuery = useQuery({
    queryKey: ['last-performance', item.exercise_id],
    queryFn: () => exercisesApi.lastPerformance(item.exercise_id),
    enabled: item.sets.length === 0,
    staleTime: 5 * 60 * 1000,
  })

  const lastSet = item.sets.length > 0 ? item.sets[item.sets.length - 1] : null
  const perfSet = useMemo(() => {
    const sets = perfQuery.data?.sets ?? []
    const working = sets.filter((set) => !set.is_warmup)
    if (working.length > 0) {
      return working[working.length - 1]
    }
    return sets.length > 0 ? sets[sets.length - 1] : null
  }, [perfQuery.data])

  const fallbackWeightKg =
    lastSet !== null ? lastSet.weight_kg : (planned?.weight_kg ?? perfSet?.weight_kg ?? null)
  const fallbackReps =
    lastSet !== null ? lastSet.reps : (planned?.reps ?? perfSet?.reps ?? null)
  const prefillKey = perfQuery.isFetched ? 'perf' : 'pending'

  return (
    <section
      id={`exercise-group-${item.id}`}
      className="rounded-xl border border-line bg-surface-raised p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/lifting/exercises/${item.exercise_id}`}
              className="truncate font-semibold tracking-tight hover:text-accent"
            >
              {exercise?.name ?? 'Exercise'}
            </Link>
            {exercise?.is_archived && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-content-muted">
                Archived
              </span>
            )}
          </div>
          {item.sets.length === 0 && perfQuery.data !== null && perfQuery.data !== undefined && (
            <p className="mt-0.5 text-xs text-content-muted">
              Last:{' '}
              {perfSet === null
                ? 'no sets'
                : `${perfSet.weight_kg === null ? 'BW' : formatWeight(perfSet.weight_kg, unitSystem)} × ${perfSet.reps}`}{' '}
              · {formatLocal(perfQuery.data.performed_at, timezone, 'MMM d')}
            </p>
          )}
          {planned !== undefined && planned.sets > 0 && (
            <p className="mt-0.5 text-xs text-content-muted">
              Planned: {planned.sets}
              {planned.reps !== null ? ` × ${planned.reps}` : ''}
              {planned.weight_kg !== null
                ? ` @ ${formatWeight(planned.weight_kg, unitSystem)}`
                : ''}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setConfirmRemoveOpen(true)}
          className="min-h-11 shrink-0 rounded-lg border border-line px-3 text-xs font-medium text-content-muted transition-colors hover:border-red-500/60 hover:text-red-400 light:hover:text-red-600"
        >
          Remove
        </button>
      </div>

      <ConfirmDialog
        open={confirmRemoveOpen}
        title="Remove exercise?"
        message={
          item.sets.length === 0
            ? `Remove ${exercise?.name ?? 'this exercise'} from this workout?`
            : `Remove ${exercise?.name ?? 'this exercise'} and its ${item.sets.length} ${
                item.sets.length === 1 ? 'set' : 'sets'
              } from this workout?`
        }
        confirmLabel="Remove"
        destructive
        isPending={isRemoving}
        error={removeError}
        onConfirm={onRemove}
        onClose={() => setConfirmRemoveOpen(false)}
      />

      {item.sets.length === 0 && perfQuery.isError && (
        <QueryErrorNotice
          className="mt-2"
          message="Could not load last performance."
          detail={errorDetail(perfQuery.error)}
          onRetry={() => void perfQuery.refetch()}
        />
      )}

      {item.sets.length > 0 && (
        <ul className="mt-2">
          {item.sets.map((set, index) => (
            <SetRow
              key={set.id}
              set={set}
              unitSystem={unitSystem}
              isBusy={pendingSetId === set.id || isReordering}
              canMoveUp={index > 0}
              canMoveDown={index < item.sets.length - 1}
              onPatch={(patch) => onPatchSet(set.id, patch)}
              onDelete={() => onDeleteSet(set)}
              onMove={(direction) => moveSet(set.id, direction)}
            />
          ))}
        </ul>
      )}

      <SetInputRow
        key={`${item.id}:${item.sets.length}:${prefillKey}`}
        nextNumber={nextSetNumber(item)}
        initialWeight={displayWeight(fallbackWeightKg, unitSystem)}
        initialReps={fallbackReps}
        unitSystem={unitSystem}
        isAdding={isAddingSet}
        onAdd={onAddSet}
      />
    </section>
  )
}

export function WorkoutLoggerPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { unitSystem, timezone } = useSettings()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [undoDelete, setUndoDelete] = useState<{ itemId: string; set: WorkoutSet } | null>(null)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  const [focusGroupId, setFocusGroupId] = useState<string | null>(null)
  const focusedGroupRef = useRef<string | null>(null)
  const [deleteWorkoutOpen, setDeleteWorkoutOpen] = useState(false)

  const dismissToast = useCallback(() => {
    setToast(null)
    setUndoDelete(null)
  }, [])

  const workoutQuery = useQuery({
    queryKey: ['workouts', id],
    queryFn: () => workoutsApi.get(id!),
    enabled: id !== undefined,
  })

  const exercisesQuery = useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: () => exercisesApi.list({ include_archived: true, limit: 500 }),
    staleTime: 5 * 60 * 1000,
  })

  const workout = workoutQuery.data
  const templateId = workout?.template_id ?? null
  const statePlanned =
    (location.state as { planned?: PlannedExercise[] } | null)?.planned ?? null

  const templateQuery = useQuery({
    queryKey: ['templates', templateId],
    queryFn: () => templatesApi.get(templateId!),
    enabled: statePlanned === null && templateId !== null,
  })

  const exerciseMap = useMemo(
    () => new Map((exercisesQuery.data ?? []).map((exercise) => [exercise.id, exercise])),
    [exercisesQuery.data],
  )

  const plannedByPosition = useMemo(() => {
    const byPosition = new Map<number, PlannedExercise>()
    const source =
      statePlanned ??
      templateQuery.data?.exercises.map((item) => ({
        exercise_id: item.exercise_id,
        position: item.position,
        sets: item.target_sets ?? 0,
        reps: item.target_reps,
        weight_kg: item.target_weight_kg,
      })) ??
      null
    for (const planned of source ?? []) {
      byPosition.set(planned.position, planned)
    }
    return byPosition
  }, [statePlanned, templateQuery.data])

  const invalidateWorkoutData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['workouts'] })
    void queryClient.invalidateQueries({ queryKey: ['last-performance'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }, [queryClient])

  const addSetMutation = useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: SetInput }) =>
      workoutsApi.addSet(itemId, input),
    onMutate: async ({ itemId, input }) => {
      await queryClient.cancelQueries({ queryKey: ['workouts', id] })
      return optimisticUpdate(queryClient, id!, (current) => ({
        ...current,
        exercises: current.exercises.map((item) =>
          item.id === itemId ? { ...item, sets: [...item.sets, optimisticSet(item, input)] } : item,
        ),
      }))
    },
    onError: (_error, _vars, context) => handleRollback(queryClient, id!, context),
    onSettled: invalidateWorkoutData,
  })

  const patchSetMutation = useMutation({
    mutationFn: ({ setId, patch }: { setId: string; patch: SetPatch }) =>
      workoutsApi.patchSet(setId, patch),
    onMutate: async ({ setId, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['workouts', id] })
      return optimisticUpdate(queryClient, id!, (current) => ({
        ...current,
        exercises: current.exercises.map((item) => ({
          ...item,
          sets: item.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)),
        })),
      }))
    },
    onError: (_error, _vars, context) => handleRollback(queryClient, id!, context),
    onSettled: invalidateWorkoutData,
  })

  const deleteSetMutation = useMutation({
    mutationFn: ({ setId }: { setId: string; itemId: string; deletedSet: WorkoutSet }) =>
      workoutsApi.removeSet(setId),
    onMutate: async ({ setId }) => {
      await queryClient.cancelQueries({ queryKey: ['workouts', id] })
      return optimisticUpdate(queryClient, id!, (current) => ({
        ...current,
        exercises: current.exercises.map((item) => ({
          ...item,
          sets: item.sets.filter((set) => set.id !== setId),
        })),
      }))
    },
    onSuccess: (_data, { itemId, deletedSet }) => {
      setToast(null)
      setUndoDelete({ itemId, set: deletedSet })
    },
    onError: (_error, _vars, context) => handleRollback(queryClient, id!, context),
    onSettled: invalidateWorkoutData,
  })

  const reorderSetsMutation = useMutation({
    mutationFn: ({ itemId, setIds }: { itemId: string; setIds: string[] }) =>
      workoutsApi.reorderSets(itemId, setIds),
    onMutate: async ({ itemId, setIds }) => {
      await queryClient.cancelQueries({ queryKey: ['workouts', id] })
      return optimisticUpdate(queryClient, id!, (current) => ({
        ...current,
        exercises: current.exercises.map((item) =>
          item.id === itemId ? { ...item, sets: reorderSets(item.sets, setIds) } : item,
        ),
      }))
    },
    onError: (_error, _vars, context) => handleRollback(queryClient, id!, context),
    onSettled: invalidateWorkoutData,
  })

  const addExerciseMutation = useMutation({
    mutationFn: ({
      itemId,
      position,
      exercise,
    }: {
      itemId: string
      position: number
      exercise: PickedExercise
    }) =>
      workoutsApi.addExercise(id!, {
        id: itemId,
        exercise_id: exercise.id,
        position,
        sets: [],
      }),
    onMutate: async ({ itemId, position, exercise }) => {
      await queryClient.cancelQueries({ queryKey: ['workouts', id] })
      return optimisticUpdate(queryClient, id!, (current) => ({
        ...current,
        exercises: [
          ...current.exercises,
          {
            id: itemId,
            exercise_id: exercise.id,
            position,
            notes: null,
            superset_group: null,
            sets: [],
          },
        ],
      }))
    },
    onError: (_error, _vars, context) => handleRollback(queryClient, id!, context),
    onSettled: invalidateWorkoutData,
  })

  const removeExerciseMutation = useMutation({
    mutationFn: ({ itemId }: { itemId: string }) => workoutsApi.removeExercise(itemId),
    onMutate: async ({ itemId }) => {
      await queryClient.cancelQueries({ queryKey: ['workouts', id] })
      return optimisticUpdate(queryClient, id!, (current) => ({
        ...current,
        exercises: current.exercises.filter((item) => item.id !== itemId),
      }))
    },
    onError: (_error, _vars, context) => handleRollback(queryClient, id!, context),
    onSettled: invalidateWorkoutData,
  })

  const patchWorkoutMutation = useMutation({
    mutationFn: (patch: WorkoutPatch) => workoutsApi.patch(id!, patch),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(['workouts', id], data)
      if (variables.notes !== undefined) {
        setNotesDraft(null)
      }
      if (variables.name !== undefined) {
        setNameDraft(null)
      }
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
    },
  })

  const deleteWorkoutMutation = useMutation({
    mutationFn: () => workoutsApi.remove(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/lifting')
    },
  })

  useEffect(() => {
    if (focusGroupId === null || focusedGroupRef.current === focusGroupId) {
      return
    }
    const element = document.getElementById(`exercise-group-${focusGroupId}`)
    if (element !== null) {
      focusedGroupRef.current = focusGroupId
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [focusGroupId, workout])

  function handlePickExercise(exercise: PickedExercise) {
    setPickerOpen(false)
    if (workout === undefined) {
      return
    }
    if (exercise.created) {
      setToast(`New exercise created: ${exercise.name}`)
      void queryClient.invalidateQueries({ queryKey: ['exercises'] })
    }
    const existing = workout.exercises.find((item) => item.exercise_id === exercise.id)
    if (existing !== undefined) {
      setFocusGroupId(existing.id)
      return
    }
    const itemId = randomId()
    setFocusGroupId(itemId)
    addExerciseMutation.mutate({ itemId, position: nextPosition(workout), exercise })
  }

  function handleAddSet(item: WorkoutExercise, draft: SetDraft) {
    if (draft.reps === null) {
      return
    }
    addSetMutation.mutate({
      itemId: item.id,
      input: {
        id: randomId(),
        weight_kg: displayToKg(draft.weight, unitSystem),
        reps: Math.round(draft.reps),
        rpe: draft.rpe,
        is_warmup: draft.isWarmup,
      },
    })
  }

  function handleDeleteSet(item: WorkoutExercise, set: WorkoutSet) {
    deleteSetMutation.mutate({ setId: set.id, itemId: item.id, deletedSet: set })
  }

  function handleUndoDelete() {
    if (undoDelete === null) {
      return
    }
    const { itemId, set } = undoDelete
    setUndoDelete(null)
    addSetMutation.mutate({
      itemId,
      input: {
        weight_kg: set.weight_kg,
        reps: set.reps,
        rpe: set.rpe,
        is_warmup: set.is_warmup,
        is_drop_set: set.is_drop_set,
        notes: set.notes,
      },
    })
  }

  function handleNameBlur() {
    if (nameDraft === null || workout === undefined) {
      return
    }
    const trimmed = nameDraft.trim()
    if (trimmed === (workout.name ?? '')) {
      setNameDraft(null)
      return
    }
    patchWorkoutMutation.mutate({ name: trimmed === '' ? null : trimmed })
  }

  function saveNotes() {
    if (notesDraft === null) {
      return
    }
    const trimmed = notesDraft.trim()
    patchWorkoutMutation.mutate({ notes: trimmed === '' ? null : trimmed })
  }

  if (workoutQuery.isPending) {
    return <p className="text-sm text-content-muted">Loading workout…</p>
  }

  if (workoutQuery.isError || workout === undefined) {
    return (
      <div role="alert" className="rounded-xl border border-line bg-surface-raised p-4 text-sm">
        <p className="font-medium">Could not load this workout.</p>
        <p className="mt-1 text-content-muted">{errorDetail(workoutQuery.error)}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void workoutQuery.refetch()}
            className="min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Retry
          </button>
          <Link
            to="/lifting"
            className="min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Back to lifting
          </Link>
        </div>
      </div>
    )
  }

  const nameValue = nameDraft ?? workout.name ?? ''
  const notesValue = notesDraft ?? workout.notes ?? ''
  const notesDirty = notesDraft !== null && notesDraft !== (workout.notes ?? '')

  const pendingSetId =
    patchSetMutation.isPending && patchSetMutation.variables !== undefined
      ? patchSetMutation.variables.setId
      : deleteSetMutation.isPending && deleteSetMutation.variables !== undefined
        ? deleteSetMutation.variables.setId
        : null

  let setCount = 0
  let volumeKg = 0
  for (const item of workout.exercises) {
    for (const set of item.sets) {
      setCount += 1
      if (!set.is_warmup && set.weight_kg !== null) {
        volumeKg += set.weight_kg * set.reps
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/lifting"
          className="min-h-11 rounded-lg text-sm font-medium text-content-muted transition-colors hover:text-content"
        >
          ← Lifting
        </Link>
        <span className="text-xs text-content-muted">
          {formatLocal(workout.performed_at, timezone, 'EEE, MMM d · h:mm a')}
        </span>
      </div>

      <div>
        <input
          type="text"
          value={nameValue}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={handleNameBlur}
          placeholder="Workout name"
          aria-label="Workout name"
          className="w-full border-b border-transparent bg-transparent pb-1 text-lg font-semibold tracking-tight text-content placeholder:text-content-muted focus:border-line focus:outline-none"
        />
        <p className="mt-1 text-xs text-content-muted">
          {workout.exercises.length}{' '}
          {workout.exercises.length === 1 ? 'exercise' : 'exercises'} · {setCount}{' '}
          {setCount === 1 ? 'set' : 'sets'}
          {volumeKg > 0 ? ` · ${formatWeight(volumeKg, unitSystem)} volume` : ''}
        </p>
      </div>

      {exercisesQuery.isError && (
        <QueryErrorNotice
          message="Exercise names could not be loaded."
          detail={errorDetail(exercisesQuery.error)}
          onRetry={() => void exercisesQuery.refetch()}
        />
      )}

      {templateQuery.isError && (
        <QueryErrorNotice
          message="Could not load the template plan; targets are not pre-filled."
          detail={errorDetail(templateQuery.error)}
          onRetry={() => void templateQuery.refetch()}
        />
      )}

      {workout.exercises.length === 0 && !pickerOpen && (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-content-muted">
          No exercises yet. Add one to start logging sets.
        </p>
      )}

      {workout.exercises
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((item) => (
          <ExerciseGroup
            key={item.id}
            item={item}
            exercise={exerciseMap.get(item.exercise_id)}
            planned={plannedByPosition.get(item.position)}
            unitSystem={unitSystem}
            timezone={timezone}
            isAddingSet={addSetMutation.isPending && addSetMutation.variables?.itemId === item.id}
            isRemoving={
              removeExerciseMutation.isPending &&
              removeExerciseMutation.variables?.itemId === item.id
            }
            removeError={
              removeExerciseMutation.isError &&
              removeExerciseMutation.variables?.itemId === item.id
                ? errorDetail(removeExerciseMutation.error)
                : null
            }
            isReordering={reorderSetsMutation.isPending}
            pendingSetId={pendingSetId}
            onAddSet={(draft) => handleAddSet(item, draft)}
            onPatchSet={(setId, patch) => patchSetMutation.mutateAsync({ setId, patch })}
            onDeleteSet={(set) => handleDeleteSet(item, set)}
            onReorderSets={(orderedIds) =>
              reorderSetsMutation.mutate({ itemId: item.id, setIds: orderedIds })
            }
            onRemove={() => removeExerciseMutation.mutate({ itemId: item.id })}
          />
        ))}

      {pickerOpen ? (
        <ExercisePicker onSelect={handlePickExercise} onCancel={() => setPickerOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="min-h-12 w-full rounded-xl border border-dashed border-line px-4 text-sm font-semibold text-content-muted transition-colors hover:border-accent hover:text-accent"
        >
          + Add exercise
        </button>
      )}

      {(addSetMutation.isError ||
        addExerciseMutation.isError ||
        removeExerciseMutation.isError ||
        patchSetMutation.isError ||
        deleteSetMutation.isError ||
        reorderSetsMutation.isError) && (
        <p role="alert" className="text-sm text-red-400 light:text-red-600">
          {errorDetail(
            addSetMutation.error ??
              addExerciseMutation.error ??
              removeExerciseMutation.error ??
              patchSetMutation.error ??
              deleteSetMutation.error ??
              reorderSetsMutation.error,
          )}
        </p>
      )}

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="text-sm font-semibold tracking-tight">Session notes</h2>
        <textarea
          value={notesValue}
          onChange={(event) => setNotesDraft(event.target.value)}
          rows={3}
          placeholder="How did the session go?"
          className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          {patchWorkoutMutation.isError ? (
            <p role="alert" className="text-xs text-red-400 light:text-red-600">
              {errorDetail(patchWorkoutMutation.error)}
            </p>
          ) : (
            <span />
          )}
          {notesDirty && (
            <button
              type="button"
              onClick={saveNotes}
              disabled={patchWorkoutMutation.isPending}
              className="min-h-11 rounded-lg bg-accent-strong px-3 text-xs font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
            >
              {patchWorkoutMutation.isPending ? 'Saving…' : 'Save notes'}
            </button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <button
          type="button"
          onClick={() => {
            deleteWorkoutMutation.reset()
            setDeleteWorkoutOpen(true)
          }}
          className="min-h-11 text-sm font-medium text-content-muted transition-colors hover:text-red-400 light:hover:text-red-600"
        >
          Delete workout
        </button>
      </section>

      {deleteWorkoutOpen && (
        <DeleteFlow
          open
          title="Delete this workout?"
          message={`Delete ${
            workout.name === null || workout.name === ''
              ? 'this workout'
              : `“${workout.name}”`
          }, its ${workout.exercises.length} ${
            workout.exercises.length === 1 ? 'exercise' : 'exercises'
          }, and ${setCount} ${setCount === 1 ? 'set' : 'sets'}? This cannot be undone.`}
          confirmLabel="Delete workout"
          typeToConfirm
          backup={<DownloadBackupButton />}
          isPending={deleteWorkoutMutation.isPending}
          error={deleteWorkoutMutation.isError ? errorDetail(deleteWorkoutMutation.error) : null}
          onConfirm={() => deleteWorkoutMutation.mutate()}
          onClose={() => {
            deleteWorkoutMutation.reset()
            setDeleteWorkoutOpen(false)
          }}
        />
      )}

      <Toast
        key={undoDelete === null ? 'message' : `undo:${undoDelete.set.id}`}
        message={undoDelete === null ? toast : 'Set deleted'}
        onDismiss={dismissToast}
        durationMs={undoDelete === null ? undefined : 6000}
        action={undoDelete === null ? undefined : { label: 'Undo', onClick: handleUndoDelete }}
      />
    </div>
  )
}
