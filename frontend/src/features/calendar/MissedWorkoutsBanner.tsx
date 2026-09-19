import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, calendarApi, workoutsApi } from '../../api/client'
import { BottomSheet } from '../../components/BottomSheet'
import { formatDateKey } from '../../lib/datetime'
import {
  isMissedDismissed,
  missedWorkouts,
  readMissedDismissal,
  writeMissedDismissal,
} from '../../lib/missed'

export interface MissedWorkoutsBannerProps {
  today: string
  timezone: string
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

export function MissedWorkoutsBanner({ today, timezone }: MissedWorkoutsBannerProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [dismissedDate, setDismissedDate] = useState<string | null>(() => readMissedDismissal())
  const [sheetOpen, setSheetOpen] = useState(false)

  const weekQuery = useQuery({
    queryKey: ['calendar', 'week', null, timezone],
    queryFn: () => calendarApi.week(),
  })

  const startMutation = useMutation({
    mutationFn: (templateId: string) => workoutsApi.startFromTemplate(templateId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['calendar'] })
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      navigate(`/lifting/workouts/${result.workout.id}`, { state: { planned: result.planned } })
    },
  })

  const missed = missedWorkouts(weekQuery.data?.days ?? [], today)

  if (weekQuery.isError || missed.length === 0 || isMissedDismissed(dismissedDate, today)) {
    return null
  }

  function dismiss() {
    writeMissedDismissal(today)
    setDismissedDate(today)
  }

  return (
    <>
      <section
        aria-label="Missed workouts"
        className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised p-3"
      >
        <div role="status" className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {missed.length} missed workout{missed.length === 1 ? '' : 's'} this week
          </p>
          <p className="text-xs text-content-muted">Start one now and it is logged today.</p>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="min-h-11 shrink-0 rounded-lg border border-accent/50 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
        >
          Review
        </button>
        <button
          type="button"
          aria-label="Dismiss missed workouts"
          onClick={dismiss}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg text-content-muted transition-colors hover:text-content"
        >
          ×
        </button>
      </section>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Missed workouts"
      >
        <p className="text-xs text-content-muted">
          Planned days from earlier this week. Starting logs the workout today; your plan and
          adherence stay as they are.
        </p>

        <ul className="mt-3 space-y-2">
          {missed.map((item) => {
            const isStarting =
              startMutation.isPending && startMutation.variables === item.template_id
            return (
              <li
                key={item.date}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.template_name ?? 'Workout'}
                  </p>
                  <p className="text-xs text-content-muted">
                    {formatDateKey(item.date, 'EEEE, MMM d')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={() => startMutation.mutate(item.template_id)}
                  className="min-h-11 shrink-0 rounded-lg border border-accent/50 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                >
                  {isStarting ? 'Starting…' : 'Start'}
                </button>
              </li>
            )
          })}
        </ul>

        {startMutation.isError && (
          <p role="alert" className="mt-3 text-sm font-medium text-content">
            {errorDetail(startMutation.error)}
          </p>
        )}
      </BottomSheet>
    </>
  )
}
