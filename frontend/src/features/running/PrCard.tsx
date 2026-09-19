import { Link } from 'react-router-dom'
import { useSettings } from '../../context/SettingsContext'
import { formatLocal } from '../../lib/datetime'

export interface PrCardProps {
  label: string
  value: string | null
  performedAt: string | null
  activityId: string | null
}

export function PrCard({ label, value, performedAt, activityId }: PrCardProps) {
  const { timezone } = useSettings()

  return (
    <section className="rounded-xl border border-line bg-surface-raised p-3">
      <h3 className="text-xs font-medium text-content-muted">{label}</h3>
      {value === null || performedAt === null || activityId === null ? (
        <p className="mt-1 text-lg font-semibold text-content-muted">—</p>
      ) : (
        <Link to={`/running/${activityId}`} className="mt-1 block">
          <p className="text-lg font-semibold tabular-nums">{value}</p>
          <p className="mt-0.5 text-xs text-content-muted">
            {formatLocal(performedAt, timezone, 'MMM d, yyyy')}
          </p>
        </Link>
      )}
    </section>
  )
}
