import type { ComponentType, SVGProps } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { InstallPrompt } from './InstallPrompt'
import { ThemeToggle } from './ThemeToggle'
import { DumbbellIcon, HomeIcon, RunIcon, ScaleIcon, SettingsIcon } from './icons'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  end?: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: HomeIcon, end: true },
  { to: '/weight', label: 'Weight', icon: ScaleIcon },
  { to: '/lifting', label: 'Lifting', icon: DumbbellIcon },
  { to: '/running', label: 'Running', icon: RunIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-content">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">Fitness Tracker</span>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-[calc(7rem_+_env(safe-area-inset-bottom))]">
        <InstallPrompt />
        <Outlet />
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex w-full max-w-2xl items-stretch">
          {navItems.map(({ to, label, icon: ItemIcon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors',
                    isActive ? 'text-accent' : 'text-content-muted hover:text-content',
                  ].join(' ')
                }
              >
                <ItemIcon className="h-5 w-5" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
