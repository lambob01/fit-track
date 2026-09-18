export function parseDurationInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return null
  }

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':')
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) {
      return null
    }

    const values = parts.map(Number)

    if (parts.length === 2) {
      const [minutes, seconds] = values
      if (seconds > 59) {
        return null
      }
      const total = minutes * 60 + seconds
      return total > 0 ? total : null
    }

    const [hours, minutes, seconds] = values
    if (minutes > 59 || seconds > 59) {
      return null
    }
    const total = hours * 3600 + minutes * 60 + seconds
    return total > 0 ? total : null
  }

  if (!/^\d+(?:[.,]\d+)?$/.test(trimmed)) {
    return null
  }

  const minutes = Number(trimmed.replace(',', '.'))
  return minutes > 0 ? Math.round(minutes * 60) : null
}

export function formatDuration(totalSeconds: number): string {
  const rounded = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const seconds = rounded % 60
  const pad = (value: number) => String(value).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }

  return `${minutes}:${pad(seconds)}`
}
