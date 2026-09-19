import { describe, expect, it } from 'vitest'
import { nextDeleteStage, shouldSubmit } from './deleteStages'

describe('nextDeleteStage', () => {
  it('runs a single confirmation straight to done', () => {
    expect(
      nextDeleteStage('confirm', { typeToConfirm: false, requirePassword: false }),
    ).toBe('done')
  })

  it('advances a double confirmation from confirm to type', () => {
    expect(
      nextDeleteStage('confirm', { typeToConfirm: true, requirePassword: false }),
    ).toBe('type')
  })

  it('finishes a double confirmation after typing', () => {
    expect(
      nextDeleteStage('type', { typeToConfirm: true, requirePassword: false }),
    ).toBe('done')
  })

  it('runs the triple friction in order: confirm, type, password', () => {
    const friction = { typeToConfirm: true, requirePassword: true }
    expect(nextDeleteStage('confirm', friction)).toBe('type')
    expect(nextDeleteStage('type', friction)).toBe('password')
    expect(nextDeleteStage('password', friction)).toBe('done')
  })

  it('falls back to the password step when type-to-confirm is skipped', () => {
    expect(
      nextDeleteStage('confirm', { typeToConfirm: false, requirePassword: true }),
    ).toBe('password')
  })

  it('keeps a completed flow terminal', () => {
    expect(
      nextDeleteStage('done', { typeToConfirm: true, requirePassword: true }),
    ).toBe('done')
  })
})

describe('shouldSubmit', () => {
  it('submits immediately for a single confirmation', () => {
    expect(shouldSubmit('confirm', { typeToConfirm: false, requirePassword: false })).toBe(
      true,
    )
  })

  it('waits at the confirm step when more friction follows', () => {
    expect(shouldSubmit('confirm', { typeToConfirm: true, requirePassword: false })).toBe(
      false,
    )
    expect(shouldSubmit('confirm', { typeToConfirm: false, requirePassword: true })).toBe(
      false,
    )
  })

  it('submits after typing for a double confirmation', () => {
    expect(shouldSubmit('type', { typeToConfirm: true, requirePassword: false })).toBe(true)
  })

  it('waits at the type step when a password follows', () => {
    expect(shouldSubmit('type', { typeToConfirm: true, requirePassword: true })).toBe(false)
  })

  it('submits from the password step', () => {
    expect(shouldSubmit('password', { typeToConfirm: true, requirePassword: true })).toBe(
      true,
    )
  })
})
