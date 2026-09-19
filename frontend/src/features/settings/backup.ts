import { dataApi } from '../../api/client'
import { localDateKey } from '../../lib/datetime'

export function backupFilename(dateKey: string): string {
  return `tracker-export-${dateKey}.json`
}

export function download(content: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function downloadJsonBackup(
  timezone: string,
  now: Date = new Date(),
): Promise<void> {
  const envelope = await dataApi.exportJson()
  download(
    JSON.stringify(envelope, null, 2),
    'application/json',
    backupFilename(localDateKey(now.toISOString(), timezone)),
  )
}
