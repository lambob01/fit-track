import type { ComponentType, SVGProps } from 'react'
import { Link } from 'react-router-dom'
import { DumbbellIcon, RunIcon, ScaleIcon } from './icons'

interface QuickAddAction {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const ACTIONS: QuickAddAction[] = [
  { to: '/weight?add=1', label: 'Weight', icon: ScaleIcon },
  { to: '/lifting?add=1', label: 'Workout', icon: DumbbellIcon },
  { to: '/running?add=1', label: 'Run', icon: RunIcon },
]

export interface QuickAddBarProps {
  className?: string
}

export function QuickAddBar({ className }: QuickAddBarProps) {
  return (
    <nav
      aria-label="Quick add"
      className={['grid grid-cols-3 gap-2', className].filter(Boolean).join(' ')}
    >
      {ACTIONS.map(({ to, label, icon: ActionIcon }) => (
        <Link
          key={to}
          to={to}
          className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-line bg-surface-raised px-2 py-2 text-xs font-medium text-content transition-colors hover:border-accent hover:text-accent"
        >
          <ActionIcon className="h-5 w-5" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
