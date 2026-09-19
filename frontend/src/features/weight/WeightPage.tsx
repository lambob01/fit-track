import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, weightApi } from '../../api/client'
import type { WeightBucket, WeightEntry, WeightEntryInput } from '../../api/types'
import { useSettings } from '../../context/SettingsContext'
import { getPresetRange } from '../../lib/dateRange'
import type { DateRange } from '../../lib/dateRange'
import { formatLocal } from '../../lib/datetime'
import { formatWeight } from '../../lib/units'
import { WeightChart } from './WeightChart'
import { WeightForm } from './WeightForm'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

export function WeightPage() {
  const { unitSystem, timezone } = useSettings()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [range, setRange] = useState<DateRange>(() => getPresetRange('90d', timezone))
  const [bucket, setBucket] = useState<WeightBucket>('day')
  const [formOpen, setFormOpen] = useState(() => searchParams.get('add') === '1')
  const [editing, setEditing] = useState<WeightEntry | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const entriesQuery = useQuery({
    queryKey: ['weight', 'entries'],
    queryFn: weightApi.listEntries,
  })

  const seriesQuery = useQuery({
    queryKey: ['weight', 'series', range.from, range.to, bucket],
    queryFn: () => weightApi.series({ from: range.from, to: range.to, bucket }),
  })

  function invalidateWeightData() {
    void queryClient.invalidateQueries({ queryKey: ['weight'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const createMutation = useMutation({
    mutationFn: weightApi.createEntry,
    onSuccess: () => {
      invalidateWeightData()
      setEditing(null)
      setFormOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WeightEntryInput }) =>
      weightApi.updateEntry(id, patch),
    onSuccess: () => {
      invalidateWeightData()
      setEditing(null)
      setFormOpen(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: weightApi.deleteEntry,
    onSuccess: () => {
      invalidateWeightData()
      setPendingDeleteId(null)
    },
  })

  const formVisible = formOpen || editing !== null
  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.isError
    ? errorDetail(createMutation.error)
    : updateMutation.isError
      ? errorDetail(updateMutation.error)
      : null

  useEffect(() => {
    if (formVisible) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [formVisible, editing])

  function resetSaveMutations() {
    createMutation.reset()
    updateMutation.reset()
  }

  function openAddForm() {
    resetSaveMutations()
    setEditing(null)
    setFormOpen(true)
  }

  function openEditForm(entry: WeightEntry) {
    resetSaveMutations()
    setEditing(entry)
    setFormOpen(true)
  }

  function closeForm() {
    resetSaveMutations()
    setEditing(null)
    setFormOpen(false)
  }

  function handleSubmit(input: WeightEntryInput) {
    if (editing !== null) {
      updateMutation.mutate({ id: editing.id, patch: input })
    } else {
      createMutation.mutate(input)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Weight</h1>
        {!formVisible && (
          <button
            type="button"
            onClick={openAddForm}
            className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Add entry
          </button>
        )}
      </div>

      {formVisible && (
        <div ref={formRef}>
          <WeightForm
            key={editing?.id ?? 'new'}
            entry={editing}
            isSaving={isSaving}
            error={saveError}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </div>
      )}

      {seriesQuery.isError ? (
        <section
          role="alert"
          className="rounded-xl border border-line bg-surface-raised p-4 text-sm"
        >
          <p className="font-medium">Could not load the weight chart.</p>
          <p className="mt-1 text-content-muted">{errorDetail(seriesQuery.error)}</p>
          <button
            type="button"
            onClick={() => void seriesQuery.refetch()}
            className="mt-3 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Retry
          </button>
        </section>
      ) : (
        <WeightChart
          series={seriesQuery.data}
          isPending={seriesQuery.isPending}
          range={range}
          onRangeChange={setRange}
          bucket={bucket}
          onBucketChange={setBucket}
        />
      )}

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="text-sm font-semibold tracking-tight">History</h2>

        {entriesQuery.isPending ? (
          <p className="mt-3 text-sm text-content-muted">Loading entries…</p>
        ) : entriesQuery.isError ? (
          <div role="alert" className="mt-3 text-sm">
            <p className="font-medium">Could not load your entries.</p>
            <p className="mt-1 text-content-muted">{errorDetail(entriesQuery.error)}</p>
            <button
              type="button"
              onClick={() => void entriesQuery.refetch()}
              className="mt-3 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Retry
            </button>
          </div>
        ) : entriesQuery.data.length === 0 ? (
          <p className="mt-3 text-sm text-content-muted">No weight entries yet.</p>
        ) : (
          <ul className="mt-1">
            {entriesQuery.data.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="font-medium tabular-nums">
                    {formatWeight(entry.weight_kg, unitSystem)}
                  </p>
                  <p className="mt-0.5 text-xs text-content-muted">
                    {formatLocal(entry.measured_at, timezone, 'MMM d, yyyy · h:mm a')}
                  </p>
                  {entry.body_fat_pct !== null && (
                    <p className="mt-0.5 text-xs text-content-muted">
                      {entry.body_fat_pct}% body fat
                    </p>
                  )}
                  {entry.notes !== null && entry.notes !== '' && (
                    <p className="mt-1 text-sm break-words">{entry.notes}</p>
                  )}
                </div>

                {pendingDeleteId === entry.id ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(entry.id)}
                      className="min-h-11 rounded-lg border border-red-500/60 px-3 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50 light:text-red-600"
                    >
                      {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditForm(entry)}
                      className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteMutation.reset()
                        setPendingDeleteId(entry.id)
                      }}
                      className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-red-500/60 hover:text-red-400 light:hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {deleteMutation.isError && (
          <p role="alert" className="mt-3 text-sm text-red-400 light:text-red-600">
            {errorDetail(deleteMutation.error)}
          </p>
        )}
      </section>
    </div>
  )
}
