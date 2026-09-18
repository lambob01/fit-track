import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useCurrentUser } from '../lib/auth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending, isError } = useCurrentUser()
  const location = useLocation()

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface text-sm text-content-muted">
        Loading…
      </div>
    )
  }

  if (isError || !data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
