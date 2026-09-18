import { describe, expect, it } from 'vitest'
import { parseDecimalInput } from './parseNumber'

describe('parseDecimalInput', () => {
  it('parses plain and padded numbers', () => {
    expect(parseDecimalInput('08')).toBe(8)
    expect(parseDecimalInput('82.5')).toBe(82.5)
  })

  it('accepts comma decimal separators', () => {
    expect(parseDecimalInput('82,5')).toBe(82.5)
  })

  it('returns null for empty input', () => {
    expect(parseDecimalInput('')).toBeNull()
    expect(parseDecimalInput('  ')).toBeNull()
  })

  it('returns null for garbage', () => {
    expect(parseDecimalInput('abc')).toBeNull()
  })
})
