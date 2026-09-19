import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, exercisesApi } from '../../api/client'
import type { Exercise } from '../../api/types'

export interface PickedExercise {
  id: string
  name: string
  is_archived: boolean
  created: boolean
}

export interface ExercisePickerProps {
  onSelect: (exercise: PickedExercise) => void
  onCancel: () => void
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

export function ExercisePicker({ onSelect, onCancel }: ExercisePickerProps) {
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const exercisesQuery = useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: () => exercisesApi.list({ include_archived: true, limit: 500 }),
    staleTime: 5 * 60 * 1000,
  })

  const trimmed = query.trim()
  const normalized = trimmed.toLowerCase()

  const { matches, hasExactMatch } = useMemo(() => {
    const all = exercisesQuery.data ?? []
    const matches = all
      .filter((exercise) => showArchived || !exercise.is_archived)
      .filter((exercise) => normalized === '' || exercise.name.toLowerCase().includes(normalized))
      .slice(0, 50)
    const hasExactMatch = matches.some(
      (exercise) => exercise.name.trim().toLowerCase() === normalized,
    )
    return { matches, hasExactMatch }
  }, [exercisesQuery.data, normalized, showArchived])

  const resolveMutation = useMutation({
    mutationFn: (name: string) => exercisesApi.resolve(name),
    onSuccess: (result) => {
      onSelect({
        id: result.id,
        name: result.name,
        is_archived: result.is_archived,
        created: result.created,
      })
    },
  })

  function handleCreate() {
    if (trimmed === '' || resolveMutation.isPending) {
      return
    }
    resolveMutation.mutate(trimmed)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!hasExactMatch) {
      handleCreate()
    }
  }

  function handleExisting(exercise: Exercise) {
    onSelect({
      id: exercise.id,
      name: exercise.name,
      is_archived: exercise.is_archived,
      created: false,
    })
  }

  const showCreate = trimmed !== '' && !hasExactMatch
  const showEmpty = trimmed === '' && matches.length === 0 && exercisesQuery.isSuccess

  return (
    <section className="rounded-xl border border-accent/40 bg-surface-raised p-3">
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or create an exercise…"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Close
        </button>
      </form>

      <label className="mt-2 flex items-center gap-2 text-xs text-content-muted">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        Include archived exercises
      </label>

      {exercisesQuery.isError && (
        <div role="alert" className="mt-2 text-sm">
          <p className="text-content-muted">{errorDetail(exercisesQuery.error)}</p>
          <button
            type="button"
            onClick={() => void exercisesQuery.refetch()}
            className="mt-2 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Retry
          </button>
        </div>
      )}

      {resolveMutation.isError && (
        <p role="alert" className="mt-2 text-sm text-red-400 light:text-red-600">
          {errorDetail(resolveMutation.error)}
        </p>
      )}

      <ul className="mt-2 max-h-64 overflow-y-auto">
        {showCreate && (
          <li>
            <button
              type="button"
              onClick={handleCreate}
              disabled={resolveMutation.isPending}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              <span className="text-lg leading-none">+</span>
              <span className="truncate">
                {resolveMutation.isPending ? 'Creating…' : `Create “${trimmed}”`}
              </span>
            </button>
          </li>
        )}

        {matches.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => handleExisting(exercise)}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm transition-colors hover:bg-accent/10"
            >
              <span className="truncate">{exercise.name}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-content-muted">
                {exercise.is_archived && (
                  <span className="rounded-full border border-line px-2 py-0.5">Archived</span>
                )}
                {exercise.muscle_group !== 'other' && <span>{exercise.muscle_group}</span>}
              </span>
            </button>
          </li>
        ))}

        {matches.length === 0 && !showCreate && !exercisesQuery.isPending && (
          <li className="px-3 py-2 text-sm text-content-muted">
            {showEmpty
              ? 'No exercises yet. Type a name to create one.'
              : 'No matching exercises.'}
          </li>
        )}
      </ul>
    </section>
  )
}
