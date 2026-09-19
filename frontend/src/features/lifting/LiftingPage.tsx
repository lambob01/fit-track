import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, templatesApi, workoutsApi } from '../../api/client'
import { useSettings } from '../../context/SettingsContext'
import { formatLocal } from '../../lib/datetime'
import { randomId } from '../../lib/uuid'
import { formatWeight } from '../../lib/units'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

export function LiftingPage() {
  const { unitSystem, timezone } = useSettings()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const autoStarted = useRef(false)

  const workoutsQuery = useQuery({
    queryKey: ['workouts'],
    queryFn: () => workoutsApi.list(30),
  })

  const templatesQuery = useQuery({
    queryKey: ['templates', false],
    queryFn: () => templatesApi.list(false),
  })

  const startBlankMutation = useMutation({
    mutationFn: () =>
      workoutsApi.save({
        id: randomId(),
        performed_at: new Date().toISOString(),
        exercises: [],
      }),
    onSuccess: (workout) => {
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      navigate(`/lifting/workouts/${workout.id}`)
    },
  })

  const startTemplateMutation = useMutation({
    mutationFn: (templateId: string) => workoutsApi.startFromTemplate(templateId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      navigate(`/lifting/workouts/${result.workout.id}`, { state: { planned: result.planned } })
    },
  })

  useEffect(() => {
    if (searchParams.get('add') !== '1' || autoStarted.current) {
      return
    }
    autoStarted.current = true
    navigate('/lifting', { replace: true })
    startBlankMutation.mutate()
  }, [searchParams, startBlankMutation, navigate])

  const startError = startBlankMutation.isError
    ? errorDetail(startBlankMutation.error)
    : startTemplateMutation.isError
      ? errorDetail(startTemplateMutation.error)
      : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Lifting</h1>
        <div className="flex items-center gap-1">
          <Link
            to="/lifting/exercises"
            className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Exercises
          </Link>
          <Link
            to="/lifting/templates"
            className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Templates
          </Link>
        </div>
      </div>

      <button
        type="button"
        onClick={() => startBlankMutation.mutate()}
        disabled={startBlankMutation.isPending}
        className="min-h-14 w-full rounded-xl bg-accent-strong px-4 text-base font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
      >
        {startBlankMutation.isPending ? 'Starting…' : '+ Start empty workout'}
      </button>

      {startError !== null && (
        <div role="alert" className="rounded-xl border border-line bg-surface-raised p-4 text-sm">
          <p className="font-medium">Could not start the workout.</p>
          <p className="mt-1 text-content-muted">{startError}</p>
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Templates</h2>
          <Link to="/lifting/templates" className="text-xs font-medium text-content-muted hover:text-accent">
            Manage
          </Link>
        </div>

        {templatesQuery.isPending ? (
          <p className="mt-2 text-sm text-content-muted">Loading templates…</p>
        ) : templatesQuery.isError ? (
          <p className="mt-2 text-sm text-content-muted">{errorDetail(templatesQuery.error)}</p>
        ) : templatesQuery.data.length === 0 ? (
          <p className="mt-2 text-sm text-content-muted">
            No templates yet. Create one to start workouts in a tap.
          </p>
        ) : (
          <ul className="mt-1">
            {templatesQuery.data.map((template) => (
              <li
                key={template.id}
                className="flex items-center justify-between gap-3 border-t border-line py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <Link to={`/lifting/templates/${template.id}`} className="truncate font-medium hover:text-accent">
                    {template.name}
                  </Link>
                  <p className="text-xs text-content-muted">
                    {template.exercises.length}{' '}
                    {template.exercises.length === 1 ? 'exercise' : 'exercises'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    startTemplateMutation.isPending &&
                    startTemplateMutation.variables === template.id
                  }
                  onClick={() => startTemplateMutation.mutate(template.id)}
                  className="min-h-11 shrink-0 rounded-lg border border-accent/50 px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                >
                  {startTemplateMutation.isPending &&
                  startTemplateMutation.variables === template.id
                    ? 'Starting…'
                    : 'Start'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="text-sm font-semibold tracking-tight">Recent workouts</h2>

        {workoutsQuery.isPending ? (
          <p className="mt-2 text-sm text-content-muted">Loading workouts…</p>
        ) : workoutsQuery.isError ? (
          <div role="alert" className="mt-2 text-sm">
            <p className="text-content-muted">{errorDetail(workoutsQuery.error)}</p>
            <button
              type="button"
              onClick={() => void workoutsQuery.refetch()}
              className="mt-2 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Retry
            </button>
          </div>
        ) : workoutsQuery.data.length === 0 ? (
          <p className="mt-2 text-sm text-content-muted">No workouts logged yet.</p>
        ) : (
          <ul className="mt-1">
            {workoutsQuery.data.map((workout) => (
              <li key={workout.id} className="border-t border-line first:border-t-0">
                <Link
                  to={`/lifting/workouts/${workout.id}`}
                  className="block min-h-14 py-3 transition-colors hover:text-accent"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{workout.name ?? 'Workout'}</span>
                    <span className="shrink-0 text-xs text-content-muted">
                      {formatLocal(workout.performed_at, timezone, 'MMM d')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-content-muted">
                    {workout.exercise_count}{' '}
                    {workout.exercise_count === 1 ? 'exercise' : 'exercises'} ·{' '}
                    {workout.set_count} {workout.set_count === 1 ? 'set' : 'sets'}
                    {workout.volume_kg > 0 ? ` · ${formatWeight(workout.volume_kg, unitSystem)}` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
