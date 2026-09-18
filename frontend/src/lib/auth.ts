import { useQuery } from '@tanstack/react-query'

export interface CurrentUser {
  id: string
  username: string
  unit_system: 'metric' | 'imperial'
  timezone: string
  goal_weight_kg: number | null
  weekly_run_goal_m: number | null
  max_hr: number | null
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Auth check failed with status ${response.status}`)
  }

  return (await response.json()) as CurrentUser
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 60_000,
  })
}
