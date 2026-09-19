import type { DemoSeedCounts, Profile } from '../../api/types'

export const PROFILES_QUERY_KEY = ['profiles'] as const

export interface DeleteGuard {
  allowed: boolean
  reason: string | null
}

export function deleteGuard(profile: Profile, profiles: Profile[]): DeleteGuard {
  if (profile.is_login_account) {
    return { allowed: false, reason: 'The login account cannot be deleted.' }
  }
  if (profile.is_active) {
    return { allowed: false, reason: 'Switch to another profile before deleting this one.' }
  }
  if (profiles.length <= 1) {
    return { allowed: false, reason: 'At least one profile must remain.' }
  }
  return { allowed: true, reason: null }
}

export function profileNameError(name: string): string | null {
  if (name.trim() === '') {
    return 'Enter a profile name.'
  }
  return null
}

export interface DemoSeedRow {
  label: string
  count: number
}

export function demoSeedRows(counts: DemoSeedCounts): DemoSeedRow[] {
  const rows: DemoSeedRow[] = [
    { label: 'exercises', count: counts.exercises },
    { label: 'workouts', count: counts.workouts },
    { label: 'cardio activities', count: counts.cardio_activities },
    { label: 'weight entries', count: counts.weight_entries },
  ]
  return rows.filter((row) => row.count > 0)
}
