import { describe, expect, it } from 'vitest'
import { randomId } from './uuid'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('randomId', () => {
  it('returns a canonical v4 uuid', () => {
    expect(randomId()).toMatch(UUID_V4)
  })

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => randomId()))
    expect(ids.size).toBe(100)
  })
})
