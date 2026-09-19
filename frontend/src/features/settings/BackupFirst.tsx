import { useMutation } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { useSettings } from '../../context/SettingsContext'
import { downloadJsonBackup } from './backup'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

export function DownloadBackupButton() {
  const { timezone } = useSettings()

  const exportMutation = useMutation({
    mutationFn: () => downloadJsonBackup(timezone),
  })

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => exportMutation.mutate()}
        disabled={exportMutation.isPending}
        className="min-h-11 w-full rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {exportMutation.isPending ? 'Preparing…' : 'Download backup first'}
      </button>
      {exportMutation.isError && (
        <p role="alert" className="text-sm text-red-400 light:text-red-600">
          {errorDetail(exportMutation.error)}
        </p>
      )}
    </div>
  )
}

export function BackupUnavailableNote({ reason }: { reason: string }) {
  return (
    <p className="rounded-lg border border-line bg-surface p-3 text-xs text-content-muted">
      {reason}
    </p>
  )
}
