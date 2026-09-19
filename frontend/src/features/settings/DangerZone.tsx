import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, dataApi } from '../../api/client'
import type { DataEntity } from '../../api/types'
import { DeleteFlow } from '../../components/DeleteFlow'
import { DownloadBackupButton } from './BackupFirst'
import { DANGER_ZONE_CATEGORIES, formatDeletedCounts } from './dangerZoneLogic'
import type { DangerZoneCategory } from './dangerZoneLogic'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

type DeleteTarget = { kind: 'all' } | { kind: 'category'; category: DangerZoneCategory }

export function DangerZone() {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<DeleteTarget | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  function invalidateAllData() {
    void queryClient.invalidateQueries()
  }

  const deleteAllMutation = useMutation({
    mutationFn: (password: string) => dataApi.deleteAll(password),
    onSuccess: (data) => {
      setTarget(null)
      setStatus(formatDeletedCounts(data.deleted))
      invalidateAllData()
    },
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: (entity: DataEntity) => dataApi.deleteEntity(entity),
    onSuccess: (data) => {
      setTarget(null)
      setStatus(formatDeletedCounts(data.deleted))
      invalidateAllData()
    },
  })

  function openTarget(next: DeleteTarget) {
    deleteAllMutation.reset()
    deleteCategoryMutation.reset()
    setStatus(null)
    setTarget(next)
  }

  function closeTarget() {
    setTarget(null)
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface-raised p-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Danger zone</h2>
        <p className="mt-1 text-sm text-content-muted">
          Bulk deletions require typing DELETE; deleting everything also requires the login
          password. Download a backup first if you might want the data back.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-line p-3">
        <h3 className="text-sm font-medium">Delete all data</h3>
        <p className="text-xs text-content-muted">
          Deletes every workout, set, cardio activity, weight entry, plan, and measurement in the
          active profile. The profile itself is kept.
        </p>
        <button
          type="button"
          onClick={() => openTarget({ kind: 'all' })}
          className="min-h-11 w-full rounded-lg border border-line-strong px-4 text-sm font-medium text-content transition-colors hover:bg-content/10"
        >
          Delete all data…
        </button>
      </div>

      <div>
        <h3 className="text-sm font-medium">Delete one category</h3>
        <ul className="mt-2 space-y-2">
          {DANGER_ZONE_CATEGORIES.map((category) => (
            <li
              key={category.entity}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{category.label}</p>
                <p className="mt-0.5 text-xs text-content-muted">{category.description}</p>
              </div>
              <button
                type="button"
                onClick={() => openTarget({ kind: 'category', category })}
                className="min-h-11 shrink-0 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-content-muted hover:text-content"
              >
                Delete all
              </button>
            </li>
          ))}
        </ul>
      </div>

      {status !== null && (
        <p role="status" className="text-sm text-content-muted">
          {status}
        </p>
      )}

      {target !== null && target.kind === 'all' && (
        <DeleteFlow
          open
          title="Delete all data?"
          message="This deletes every row in the active profile. This cannot be undone."
          confirmLabel="Delete all data"
          typeToConfirm
          requirePassword
          passwordMessage="Enter the login account password to delete all data in the active profile."
          backup={<DownloadBackupButton />}
          isPending={deleteAllMutation.isPending}
          error={deleteAllMutation.isError ? errorDetail(deleteAllMutation.error) : null}
          onConfirm={(password) => {
            if (password !== null) {
              deleteAllMutation.mutate(password)
            }
          }}
          onClose={closeTarget}
        />
      )}

      {target !== null && target.kind === 'category' && (
        <DeleteFlow
          key={target.category.entity}
          open
          title={`Delete all ${target.category.label.toLowerCase()}?`}
          message={`This deletes ${target.category.description.toLowerCase()} This cannot be undone.`}
          confirmLabel="Delete all"
          typeToConfirm
          backup={<DownloadBackupButton />}
          isPending={deleteCategoryMutation.isPending}
          error={
            deleteCategoryMutation.isError
              ? errorDetail(deleteCategoryMutation.error)
              : null
          }
          onConfirm={() => deleteCategoryMutation.mutate(target.category.entity)}
          onClose={closeTarget}
        />
      )}
    </section>
  )
}
