import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, exercisesApi, templatesApi, workoutsApi } from '../../api/client'
import { QueryErrorNotice } from './QueryErrorNotice'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

export function TemplateListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [includeArchived, setIncludeArchived] = useState(false)

  const templatesQuery = useQuery({
    queryKey: ['templates', includeArchived],
    queryFn: () => templatesApi.list(includeArchived),
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

  const startMutation = useMutation({
    mutationFn: (templateId: string) => workoutsApi.startFromTemplate(templateId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      navigate(`/lifting/workouts/${result.workout.id}`, { state: { planned: result.planned } })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      templatesApi.update(id, { is_archived: isArchived }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const startError = startMutation.isError ? errorDetail(startMutation.error) : null

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
          <h1 className="text-lg font-semibold tracking-tight">Templates</h1>
        </div>
        <Link
          to="/lifting/templates/new"
          className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          New template
        </Link>
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm text-content-muted">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(event) => setIncludeArchived(event.target.checked)}
        />
        Include archived
      </label>

      {startError !== null && (
        <div role="alert" className="rounded-xl border border-line bg-surface-raised p-4 text-sm">
          <p className="font-medium">Could not start the workout.</p>
          <p className="mt-1 text-content-muted">{startError}</p>
        </div>
      )}

      {exercisesQuery.isError && (
        <QueryErrorNotice
          message="Exercise names could not be loaded; previews are incomplete."
          detail={errorDetail(exercisesQuery.error)}
          onRetry={() => void exercisesQuery.refetch()}
        />
      )}

      {templatesQuery.isPending ? (
        <p className="text-sm text-content-muted">Loading templates…</p>
      ) : templatesQuery.isError ? (
        <div role="alert" className="rounded-xl border border-line bg-surface-raised p-4 text-sm">
          <p className="font-medium">Could not load templates.</p>
          <p className="mt-1 text-content-muted">{errorDetail(templatesQuery.error)}</p>
          <button
            type="button"
            onClick={() => void templatesQuery.refetch()}
            className="mt-3 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Retry
          </button>
        </div>
      ) : templatesQuery.data.length === 0 ? (
        <p className="text-sm text-content-muted">
          {includeArchived ? 'No templates yet.' : 'No active templates.'}
        </p>
      ) : (
        <ul className="rounded-xl border border-line bg-surface-raised px-4">
          {templatesQuery.data.map((template) => (
            <li
              key={template.id}
              className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/lifting/templates/${template.id}`}
                    className="truncate font-medium hover:text-accent"
                  >
                    {template.name}
                  </Link>
                  {template.is_archived && (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-content-muted">
                      Archived
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-content-muted">
                  {template.exercises.length === 0
                    ? 'No exercises'
                    : template.exercises
                        .map((item) => {
                          const name = exerciseNames.get(item.exercise_id) ?? 'Exercise'
                          const targets =
                            item.target_sets !== null || item.target_reps !== null
                              ? ` ${item.target_sets ?? '—'}×${item.target_reps ?? '—'}`
                              : ''
                          return `${name}${targets}`
                        })
                        .join(' · ')}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={startMutation.isPending && startMutation.variables === template.id}
                  onClick={() => startMutation.mutate(template.id)}
                  className="min-h-11 rounded-lg border border-accent/50 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                >
                  {startMutation.isPending && startMutation.variables === template.id
                    ? 'Starting…'
                    : 'Start'}
                </button>
                <button
                  type="button"
                  disabled={
                    archiveMutation.isPending && archiveMutation.variables?.id === template.id
                  }
                  onClick={() =>
                    archiveMutation.mutate({
                      id: template.id,
                      isArchived: !template.is_archived,
                    })
                  }
                  className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {template.is_archived ? 'Restore' : 'Archive'}
                </button>
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
