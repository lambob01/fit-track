import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, profilesApi } from '../../api/client'
import type { Profile } from '../../api/types'
import { DeleteFlow } from '../../components/DeleteFlow'
import { useAuth } from '../../context/AuthContext'
import { BackupUnavailableNote } from '../settings/BackupFirst'
import { ProfilePicker } from './ProfilePicker'
import { PROFILES_QUERY_KEY, profileNameError } from './profileLogic'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

const INPUT_CLASS =
  'w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30'

export function ProfileManager() {
  const queryClient = useQueryClient()
  const { refreshUser } = useAuth()
  const profilesQuery = useQuery({ queryKey: PROFILES_QUERY_KEY, queryFn: profilesApi.list })
  const profiles = profilesQuery.data ?? []

  const [name, setName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)

  const createMutation = useMutation({
    mutationFn: profilesApi.create,
    onSuccess: (profile) => {
      setName('')
      setCreateError(null)
      setStatus(`Profile “${profile.username}” created.`)
      void queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY })
    },
    onError: (error) => {
      setStatus(null)
      setCreateError(errorDetail(error))
    },
  })

  const switchMutation = useMutation({
    mutationFn: profilesApi.switch,
    onSuccess: (_data, profileId) => {
      const target = profiles.find((profile) => profile.id === profileId)
      setStatus(target === undefined ? 'Profile switched.' : `Switched to ${target.username}.`)
      void queryClient.resetQueries()
      void refreshUser().catch(() => undefined)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ profileId, password }: { profileId: string; password: string }) =>
      profilesApi.remove(profileId, password),
    onSuccess: (_data, variables) => {
      const target = profiles.find((profile) => profile.id === variables.profileId)
      setDeleteTarget(null)
      setStatus(target === undefined ? 'Profile deleted.' : `Profile “${target.username}” deleted.`)
      void queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY })
    },
  })

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = profileNameError(name)
    if (validationError !== null) {
      setCreateError(validationError)
      setStatus(null)
      return
    }
    setCreateError(null)
    setStatus(null)
    createMutation.mutate(name.trim())
  }

  function startDelete(profile: Profile) {
    deleteMutation.reset()
    setDeleteTarget(profile)
  }

  function cancelDelete() {
    if (!deleteMutation.isPending) {
      deleteMutation.reset()
      setDeleteTarget(null)
    }
  }

  const switchError = switchMutation.isError ? errorDetail(switchMutation.error) : null

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface-raised p-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Profiles</h2>
        <p className="mt-1 text-sm text-content-muted">
          Switch profiles without logging out. Each profile keeps its own workouts, weight, and
          cardio data.
        </p>
      </div>

      {profilesQuery.isPending ? (
        <p className="text-sm text-content-muted">Loading profiles…</p>
      ) : profilesQuery.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="font-medium">Could not load profiles.</p>
          <p className="text-content-muted">{errorDetail(profilesQuery.error)}</p>
          <button
            type="button"
            onClick={() => void profilesQuery.refetch()}
            className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Retry
          </button>
        </div>
      ) : (
        <ProfilePicker
          profiles={profiles}
          switchingId={switchMutation.isPending ? (switchMutation.variables ?? null) : null}
          onSwitch={(profile) => {
            setStatus(null)
            switchMutation.mutate(profile.id)
          }}
          onDelete={startDelete}
        />
      )}

      {switchError !== null && (
        <p role="alert" className="text-sm text-red-400 light:text-red-600">
          {switchError}
        </p>
      )}

      <form onSubmit={handleCreate} className="space-y-2 border-t border-line pt-4" noValidate>
        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">New profile name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setCreateError(null)
            }}
            placeholder="e.g. Home"
            className={INPUT_CLASS}
          />
        </label>
        {createError !== null && (
          <p role="alert" className="text-sm text-red-400 light:text-red-600">
            {createError}
          </p>
        )}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="min-h-11 w-full rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating…' : 'Create profile'}
        </button>
      </form>

      {status !== null && (
        <p role="status" className="text-sm text-content-muted">
          {status}
        </p>
      )}

      {deleteTarget !== null && (
        <DeleteFlow
          open
          title={`Delete profile ${deleteTarget.username}?`}
          message="This permanently deletes the profile and all of its workouts, weight entries, and cardio activities. This cannot be undone."
          confirmLabel="Delete profile"
          typeToConfirm
          requirePassword
          passwordMessage={`Enter the login account password to permanently delete the profile “${deleteTarget.username}”.`}
          backup={
            <BackupUnavailableNote
              reason={
                deleteTarget.has_data
                  ? 'Backup unavailable — the JSON export covers only the active profile. To keep a copy, switch to this profile, download the export from Settings → Data, then switch back and delete it.'
                  : 'This profile has no data to back up.'
              }
            />
          }
          isPending={deleteMutation.isPending}
          error={deleteMutation.isError ? errorDetail(deleteMutation.error) : null}
          onConfirm={(password) =>
            deleteMutation.mutate({ profileId: deleteTarget.id, password: password ?? '' })
          }
          onClose={cancelDelete}
        />
      )}
    </section>
  )
}
