import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, exercisesApi } from '../../api/client'
import type { Exercise, ExerciseCategory, ExerciseInput } from '../../api/types'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

const CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs', 'other']

interface ExerciseFormProps {
  exercise: Exercise | null
  isSaving: boolean
  error: string | null
  onSubmit: (input: ExerciseInput) => void
  onCancel: () => void
}

function ExerciseForm({ exercise, isSaving, error, onSubmit, onCancel }: ExerciseFormProps) {
  const [name, setName] = useState(exercise?.name ?? '')
  const [muscleGroup, setMuscleGroup] = useState(exercise?.muscle_group ?? '')
  const [category, setCategory] = useState<ExerciseCategory>(exercise?.category ?? 'other')
  const [equipment, setEquipment] = useState(exercise?.equipment ?? '')
  const [isCompound, setIsCompound] = useState(exercise?.is_compound ?? false)
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (name.trim() === '') {
      setValidationError('Name is required.')
      return
    }
    setValidationError(null)
    onSubmit({
      name: name.trim(),
      muscle_group: muscleGroup.trim() === '' ? 'other' : muscleGroup.trim(),
      category,
      equipment: equipment.trim() === '' ? 'other' : equipment.trim(),
      is_compound: isCompound,
    })
  }

  const displayError = validationError ?? error

  return (
    <section className="rounded-xl border border-line bg-surface-raised p-4">
      <h2 className="text-sm font-semibold tracking-tight">
        {exercise === null ? 'New exercise' : 'Edit exercise'}
      </h2>
      <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-content-muted">Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Barbell Bench Press"
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-content-muted">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ExerciseCategory)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content focus:border-accent focus:outline-none"
            >
              {CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-content-muted">Muscle group</span>
            <input
              type="text"
              value={muscleGroup}
              onChange={(event) => setMuscleGroup(event.target.value)}
              placeholder="e.g. chest"
              className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="block text-xs font-medium text-content-muted">Equipment</span>
          <input
            type="text"
            value={equipment}
            onChange={(event) => setEquipment(event.target.value)}
            placeholder="e.g. barbell"
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isCompound}
            onChange={(event) => setIsCompound(event.target.checked)}
          />
          Compound movement
        </label>

        {displayError !== null && (
          <p role="alert" className="text-sm font-medium text-content">
            {displayError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSaving}
            className="min-h-11 flex-1 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : exercise === null ? 'Create exercise' : 'Save changes'}
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

export function ExerciseLibraryPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Exercise | null>(null)

  const exercisesQuery = useQuery({
    queryKey: ['exercises', { includeArchived }],
    queryFn: () => exercisesApi.list({ include_archived: includeArchived, limit: 500 }),
  })

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const items = exercisesQuery.data ?? []
    if (query === '') {
      return items
    }
    return items.filter((exercise) => exercise.name.toLowerCase().includes(query))
  }, [exercisesQuery.data, search])

  function invalidateExercises() {
    void queryClient.invalidateQueries({ queryKey: ['exercises'] })
  }

  const createMutation = useMutation({
    mutationFn: exercisesApi.create,
    onSuccess: () => {
      invalidateExercises()
      setCreating(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ExerciseInput }) =>
      exercisesApi.update(id, patch),
    onSuccess: () => {
      invalidateExercises()
      setEditing(null)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      exercisesApi.update(id, { is_archived: isArchived }),
    onSuccess: invalidateExercises,
  })

  const formOpen = creating || editing !== null

  function openCreate() {
    createMutation.reset()
    updateMutation.reset()
    setEditing(null)
    setCreating(true)
  }

  function openEdit(exercise: Exercise) {
    createMutation.reset()
    updateMutation.reset()
    setCreating(false)
    setEditing(exercise)
  }

  function closeForm() {
    createMutation.reset()
    updateMutation.reset()
    setCreating(false)
    setEditing(null)
  }

  function handleSubmit(input: ExerciseInput) {
    if (editing !== null) {
      updateMutation.mutate({ id: editing.id, patch: input })
    } else {
      createMutation.mutate(input)
    }
  }

  const saveError = createMutation.isError
    ? errorDetail(createMutation.error)
    : updateMutation.isError
      ? errorDetail(updateMutation.error)
      : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            to="/lifting"
            className="text-sm font-medium text-content-muted transition-colors hover:text-content"
          >
            ← Lifting
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Exercise library</h1>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={openCreate}
            className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            New exercise
          </button>
        )}
      </div>

      {formOpen && (
        <ExerciseForm
          key={editing?.id ?? 'new'}
          exercise={editing}
          isSaving={createMutation.isPending || updateMutation.isPending}
          error={saveError}
          onSubmit={handleSubmit}
          onCancel={closeForm}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search exercises…"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <label className="flex min-h-11 items-center gap-2 text-sm text-content-muted">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          Include archived
        </label>
      </div>

      {exercisesQuery.isPending ? (
        <p className="text-sm text-content-muted">Loading exercises…</p>
      ) : exercisesQuery.isError ? (
        <div role="alert" className="rounded-xl border border-line bg-surface-raised p-4 text-sm">
          <p className="font-medium">Could not load exercises.</p>
          <p className="mt-1 text-content-muted">{errorDetail(exercisesQuery.error)}</p>
          <button
            type="button"
            onClick={() => void exercisesQuery.refetch()}
            className="mt-3 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-content-muted">
          {search.trim() === '' ? 'No exercises yet.' : 'No matching exercises.'}
        </p>
      ) : (
        <ul className="rounded-xl border border-line bg-surface-raised px-4">
          {filtered.map((exercise) => (
            <li key={exercise.id} className="border-t border-line first:border-t-0">
              <div className="flex items-start justify-between gap-3 py-3">
                <Link
                  to={`/lifting/exercises/${exercise.id}`}
                  className="min-w-0 flex-1 rounded-lg transition-colors hover:text-accent"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{exercise.name}</span>
                    {exercise.is_archived && (
                      <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-content-muted">
                        Archived
                      </span>
                    )}
                    {exercise.is_compound && (
                      <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-medium text-accent">
                        Compound
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-content-muted">
                    {[
                      exercise.category,
                      exercise.muscle_group,
                      exercise.equipment !== 'other' ? exercise.equipment : null,
                    ]
                      .filter((value) => value !== null && value !== '' && value !== 'other')
                      .join(' · ') || 'other'}
                  </p>
                </Link>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(exercise)}
                    className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={
                      archiveMutation.isPending &&
                      archiveMutation.variables?.id === exercise.id
                    }
                    onClick={() =>
                      archiveMutation.mutate({
                        id: exercise.id,
                        isArchived: !exercise.is_archived,
                      })
                    }
                    className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {exercise.is_archived ? 'Restore' : 'Archive'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {archiveMutation.isError && (
        <p role="alert" className="text-sm font-medium text-content">
          {errorDetail(archiveMutation.error)}
        </p>
      )}
    </div>
  )
}
