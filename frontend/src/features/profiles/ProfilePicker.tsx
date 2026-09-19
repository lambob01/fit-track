import type { Profile } from '../../api/types'
import { deleteGuard } from './profileLogic'

export interface ProfilePickerProps {
  profiles: Profile[]
  switchingId: string | null
  onSwitch: (profile: Profile) => void
  onDelete: (profile: Profile) => void
}

const BADGE_CLASS =
  'rounded-full border px-2 py-0.5 text-[11px] font-medium'

export function ProfilePicker({ profiles, switchingId, onSwitch, onDelete }: ProfilePickerProps) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {profiles.map((profile) => {
        const guard = deleteGuard(profile, profiles)
        return (
          <li key={profile.id} className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{profile.username}</span>
                {profile.is_active && (
                  <span className={`${BADGE_CLASS} border-accent text-accent`}>Active</span>
                )}
                {profile.is_login_account && (
                  <span className={`${BADGE_CLASS} border-line text-content-muted`}>
                    Login account
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!profile.is_active && (
                  <button
                    type="button"
                    onClick={() => onSwitch(profile)}
                    disabled={switchingId !== null}
                    className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {switchingId === profile.id ? 'Switching…' : 'Switch'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(profile)}
                  disabled={!guard.allowed}
                  title={guard.reason ?? undefined}
                  aria-label={`Delete profile ${profile.username}`}
                  className="min-h-11 rounded-lg border border-line-strong px-3 text-sm font-medium text-content transition-colors hover:bg-content/10 disabled:cursor-not-allowed disabled:border-line disabled:text-content-muted disabled:opacity-60 disabled:hover:bg-transparent"
                >
                  Delete
                </button>
              </div>
            </div>
            {!guard.allowed && guard.reason !== null && (
              <p className="text-xs text-content-muted">{guard.reason}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
