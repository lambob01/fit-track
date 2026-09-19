import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, dataApi, profilesApi } from '../../api/client'
import type { DemoSeedCounts } from '../../api/types'
import { BottomSheet } from '../../components/BottomSheet'
import { PROFILES_QUERY_KEY, demoSeedRows } from './profileLogic'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

export function FirstRunSheet() {
  const queryClient = useQueryClient()
  const profilesQuery = useQuery({ queryKey: PROFILES_QUERY_KEY, queryFn: profilesApi.list })
  const active = profilesQuery.data?.find((profile) => profile.is_active) ?? null

  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const [result, setResult] = useState<DemoSeedCounts | null>(null)

  if (active?.has_data === true && dismissedId !== null) {
    setDismissedId(null)
  }

  const seedMutation = useMutation({
    mutationFn: dataApi.seedDemo,
    onSuccess: (counts) => {
      setResult(counts)
      if (active !== null) {
        setDismissedId(active.id)
      }
      void queryClient.resetQueries()
    },
  })

  const shouldOffer =
    active !== null && !active.has_data && dismissedId !== active.id && result === null
  const open = result !== null || shouldOffer

  function handleClose() {
    seedMutation.reset()
    setResult(null)
    if (active !== null) {
      setDismissedId(active.id)
    }
  }

  function requestClose() {
    if (!seedMutation.isPending) {
      handleClose()
    }
  }

  const rows = result === null ? [] : demoSeedRows(result)

  return (
    <BottomSheet
      open={open}
      onClose={requestClose}
      title={result === null ? `Welcome, ${active?.username ?? ''}` : 'Demo data loaded'}
    >
      {result !== null ? (
        <div className="space-y-4 pb-2">
          <p className="text-sm">Created:</p>
          {rows.length === 0 ? (
            <p className="text-sm text-content-muted">
              This profile already had demo data — nothing new was created.
            </p>
          ) : (
            <ul className="space-y-1 text-sm text-content-muted">
              {rows.map((row) => (
                <li key={row.label}>
                  {row.count} {row.label}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="min-h-11 w-full rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <p className="text-sm text-content-muted">
            This profile has no workouts, weight entries, or cardio activities yet. Start fresh with
            an empty log book, or load demo data to explore the app.
          </p>
          {seedMutation.isError && (
            <p role="alert" className="text-sm text-red-400 light:text-red-600">
              {errorDetail(seedMutation.error)}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="min-h-11 w-full rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
            >
              {seedMutation.isPending ? 'Loading demo data…' : 'Load demo data'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={seedMutation.isPending}
              className="min-h-11 w-full rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
