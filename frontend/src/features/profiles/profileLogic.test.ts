import { describe, expect, it } from 'vitest'
import type { Profile } from '../../api/types'
import { deleteGuard, demoSeedRows, profileNameError } from './profileLogic'

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-1',
    username: 'alex',
    is_active: false,
    is_login_account: false,
    has_data: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('deleteGuard', () => {
  it('allows deleting an inactive, non-login profile when others remain', () => {
    const active = makeProfile({ id: 'profile-1', is_active: true })
    const target = makeProfile({ id: 'profile-2' })
    expect(deleteGuard(target, [active, target])).toEqual({ allowed: true, reason: null })
  })

  it('blocks deleting the login account', () => {
    const login = makeProfile({ id: 'profile-1', is_login_account: true })
    const target = makeProfile({ id: 'profile-2' })
    expect(deleteGuard(login, [login, target])).toEqual({
      allowed: false,
      reason: 'The login account cannot be deleted.',
    })
  })

  it('blocks deleting the active profile', () => {
    const active = makeProfile({ id: 'profile-1', is_active: true })
    const target = makeProfile({ id: 'profile-2' })
    expect(deleteGuard(active, [active, target])).toEqual({
      allowed: false,
      reason: 'Switch to another profile before deleting this one.',
    })
  })

  it('blocks deleting the last remaining profile', () => {
    const only = makeProfile({ id: 'profile-1' })
    expect(deleteGuard(only, [only])).toEqual({
      allowed: false,
      reason: 'At least one profile must remain.',
    })
  })

  it('reports the login guard first when the login account is also active', () => {
    const login = makeProfile({ id: 'profile-1', is_active: true, is_login_account: true })
    expect(deleteGuard(login, [login]).allowed).toBe(false)
    expect(deleteGuard(login, [login]).reason).toBe('The login account cannot be deleted.')
  })
})

describe('profileNameError', () => {
  it('rejects a blank name', () => {
    expect(profileNameError('')).toBe('Enter a profile name.')
    expect(profileNameError('   ')).toBe('Enter a profile name.')
  })

  it('accepts a non-blank name', () => {
    expect(profileNameError('Alex')).toBeNull()
  })
})

describe('demoSeedRows', () => {
  it('returns created counts in a stable order', () => {
    expect(
      demoSeedRows({
        exercises: 50,
        workouts: 30,
        cardio_activities: 12,
        weight_entries: 30,
      }),
    ).toEqual([
      { label: 'exercises', count: 50 },
      { label: 'workouts', count: 30 },
      { label: 'cardio activities', count: 12 },
      { label: 'weight entries', count: 30 },
    ])
  })

  it('omits categories that were not seeded', () => {
    expect(
      demoSeedRows({ exercises: 0, workouts: 30, cardio_activities: 0, weight_entries: 0 }),
    ).toEqual([{ label: 'workouts', count: 30 }])
  })

  it('returns no rows when nothing was created', () => {
    expect(
      demoSeedRows({ exercises: 0, workouts: 0, cardio_activities: 0, weight_entries: 0 }),
    ).toEqual([])
  })
})
