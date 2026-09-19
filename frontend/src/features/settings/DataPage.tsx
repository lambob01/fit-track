import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { ApiError, dataApi } from '../../api/client'
import type { ExportEntity, ImportCounts } from '../../api/types'
import { useSettings } from '../../context/SettingsContext'
import { download, downloadJsonBackup } from './backup'

const IMPORT_MAX_BYTES = 25 * 1024 * 1024

interface EntityOption {
  entity: ExportEntity
  label: string
}

const ENTITY_OPTIONS: EntityOption[] = [
  { entity: 'exercises', label: 'Exercises' },
  { entity: 'workout_templates', label: 'Workout templates' },
  { entity: 'template_exercises', label: 'Template exercises' },
  { entity: 'workouts', label: 'Workouts' },
  { entity: 'workout_exercises', label: 'Workout exercises' },
  { entity: 'sets', label: 'Sets' },
  { entity: 'weight_entries', label: 'Weight entries' },
  { entity: 'cardio_activities', label: 'Cardio activities' },
  { entity: 'body_measurements', label: 'Body measurements' },
  { entity: 'progress_photos', label: 'Progress photos' },
  { entity: 'tags', label: 'Tags' },
  { entity: 'workout_tags', label: 'Workout tags' },
  { entity: 'shoes', label: 'Shoes' },
]

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

function importErrorDetail(error: unknown): string {
  if (error instanceof ApiError && error.status === 413) {
    return 'Import failed: the file is larger than the 25 MB limit.'
  }
  return `Import failed: ${errorDetail(error)}`
}

function ImportSummary({ counts }: { counts: ImportCounts }) {
  const labels = new Map<string, string>(
    ENTITY_OPTIONS.map(({ entity, label }) => [entity, label]),
  )
  const entities = Array.from(
    new Set([
      ...ENTITY_OPTIONS.map(({ entity }) => entity),
      ...Object.keys(counts.created),
      ...Object.keys(counts.updated),
    ]),
  )
  const rows = entities
    .map((entity) => ({
      label: labels.get(entity) ?? entity,
      created: counts.created[entity] ?? 0,
      updated: counts.updated[entity] ?? 0,
    }))
    .filter((row) => row.created > 0 || row.updated > 0)
  const totalCreated = Object.values(counts.created).reduce((total, count) => total + count, 0)
  const totalUpdated = Object.values(counts.updated).reduce((total, count) => total + count, 0)

  return (
    <div role="status" className="rounded-lg border border-accent/40 bg-surface p-3 text-sm">
      <p className="font-medium">
        Import complete: {totalCreated} created, {totalUpdated} updated.
      </p>
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-content-muted">
          Nothing changed — this file was already imported.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-content-muted">
          {rows.map((row) => (
            <li key={row.label}>
              {row.label}: {row.created} created
              {row.updated > 0 ? `, ${row.updated} updated` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DataPage() {
  const { timezone } = useSettings()
  const queryClient = useQueryClient()
  const [sizeError, setSizeError] = useState<string | null>(null)

  const exportJsonMutation = useMutation({
    mutationFn: () => downloadJsonBackup(timezone),
  })

  const exportCsvMutation = useMutation({
    mutationFn: async ({ entity }: EntityOption) => {
      download(await dataApi.exportCsv(entity), 'text/csv', `${entity}.csv`)
    },
  })

  const importMutation = useMutation({
    mutationFn: async (file: File) => dataApi.importJson(await file.text()),
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    setSizeError(null)
    importMutation.reset()

    if (file === null) {
      return
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setSizeError('That file is larger than the 25 MB import limit.')
      return
    }

    importMutation.mutate(file)
  }

  const exportError = exportJsonMutation.isError
    ? errorDetail(exportJsonMutation.error)
    : exportCsvMutation.isError
      ? errorDetail(exportCsvMutation.error)
      : null
  const importError =
    sizeError ??
    (importMutation.isError ? importErrorDetail(importMutation.error) : null)

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-line bg-surface-raised p-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Export</h2>
          <p className="mt-1 text-sm text-content-muted">
            Download a JSON backup of everything, or individual tables as CSV.
          </p>
        </div>

        <button
          type="button"
          onClick={() => exportJsonMutation.mutate()}
          disabled={exportJsonMutation.isPending}
          className="min-h-11 w-full rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          {exportJsonMutation.isPending ? 'Preparing…' : 'Download JSON export'}
        </button>

        <div>
          <h3 className="text-xs font-medium text-content-muted">CSV downloads</h3>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ENTITY_OPTIONS.map((option) => {
              const isPending =
                exportCsvMutation.isPending &&
                exportCsvMutation.variables?.entity === option.entity
              return (
                <li key={option.entity}>
                  <button
                    type="button"
                    onClick={() => exportCsvMutation.mutate(option)}
                    disabled={exportCsvMutation.isPending}
                    className="min-h-11 w-full rounded-lg border border-line px-2 text-xs font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {isPending ? 'Preparing…' : option.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {exportError !== null && (
          <p role="alert" className="text-sm font-medium text-content">
            {exportError}
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-line bg-surface-raised p-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Import</h2>
          <p className="mt-1 text-sm text-content-muted">
            Restore from a JSON export. Rows are matched by ID, so importing the same file twice is
            safe and never duplicates data.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">Export file (.json, max 25 MB)</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            disabled={importMutation.isPending}
            className="block w-full text-sm text-content-muted file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:text-sm file:font-medium file:text-content hover:file:border-accent hover:file:text-accent disabled:opacity-50"
          />
        </label>

        {importMutation.isPending && (
          <p className="text-sm text-content-muted">
            Importing {importMutation.variables?.name ?? 'file'}…
          </p>
        )}

        {importMutation.isSuccess && <ImportSummary counts={importMutation.data} />}

        {importError !== null && (
          <p role="alert" className="text-sm font-medium text-content">
            {importError}
          </p>
        )}
      </section>
    </div>
  )
}
