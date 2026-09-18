export function parseDecimalInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return null
  }

  const normalized = trimmed.replace(',', '.').replace(/^\+/, '')
  const value = Number(normalized)

  return Number.isFinite(value) ? value : null
}
