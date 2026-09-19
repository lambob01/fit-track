import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, weightApi } from '../../api/client'
import type { WeightBucket, WeightEntry, WeightEntryInput } from '../../api/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useSettings } from '../../context/SettingsContext'
import { getPresetRange } from '../../lib/dateRange'
import type { DateRange } from '../../lib/dateRange'
import { BMI_CATEGORY_LABELS, BMI_DISCLAIMER, bmiCategory, calculateBmi } from '../../lib/bmi'
import { formatLocal } from '../../lib/datetime'
import { formatWeight } from '../../lib/units'
import { WeightChart } from './WeightChart'
import { WeightForm } from './WeightForm'

const BMI_SCALE_MIN = 15
const BMI_SCALE_MAX = 40

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

function BmiScale({ bmi }: { bmi: number }) {
  const position = Math.min(
    100,
    Math.max(0, ((bmi - BMI_SCALE_MIN) / (BMI_SCALE_MAX - BMI_SCALE_MIN)) * 100),
  )

  return (
    <div className="mt-3">
      <div className="relative">
        <div className="h-2 rounded-full bg-gradient-to-r from-line via-content-muted to-content" />
        <div
          aria-hidden="true"
          className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-content"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-content-muted">
        <span>Under 18.5</span>
        <span>30+</span>
      </div>
    </div>
  )
}

export function WeightPage() {
  const { unitSystem, timezone, heightCm } = useSettings()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [range, setRange] = useState<DateRange>(() => getPresetRange('90d', timezone))
  const [bucket, setBucket] = useState<WeightBucket>('day')
  const [formOpen, setFormOpen] = useState(() => searchParams.get('add') === '1')
  const [editing, setEditing] = useState<WeightEntry | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<WeightEntry | null>(null)
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
      setDeletingEntry(null)
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

  const latestEntry = entriesQuery.data?.[0] ?? null
  const bmi =
    latestEntry !== null && heightCm !== null
      ? calculateBmi(latestEntry.weight_kg, heightCm)
      : null

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

      {bmi !== null && (
        <section className="rounded-xl border border-line bg-surface-raised p-4">
          <h2 className="text-sm font-semibold tracking-tight">BMI</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{bmi.toFixed(1)}</span>
            <span className="text-sm text-content-muted">
              {BMI_CATEGORY_LABELS[bmiCategory(bmi)]}
            </span>
          </div>
          <BmiScale bmi={bmi} />
          <p className="mt-3 text-xs text-content-muted">{BMI_DISCLAIMER}</p>
        </section>
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
                      setDeletingEntry(entry)
                    }}
                    className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-red-500/60 hover:text-red-400 light:hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={deletingEntry !== null}
        title="Delete weight entry"
        message={
          deletingEntry === null
            ? undefined
            : `Delete the ${formatWeight(deletingEntry.weight_kg, unitSystem)} entry from ${formatLocal(
                deletingEntry.measured_at,
                timezone,
                'MMM d, yyyy',
              )}? This cannot be undone.`
        }
        confirmLabel="Delete"
        destructive
        isPending={deleteMutation.isPending}
        error={deleteMutation.isError ? errorDetail(deleteMutation.error) : null}
        onConfirm={() => {
          if (deletingEntry !== null) {
            deleteMutation.mutate(deletingEntry.id)
          }
        }}
        onClose={() => {
          deleteMutation.reset()
          setDeletingEntry(null)
        }}
      />
    </div>
  )
}
