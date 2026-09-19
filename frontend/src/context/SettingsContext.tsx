/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { settingsApi } from '../api/client'
import type { Settings, SettingsPatch, UnitSystem } from '../api/types'
import { useAuth } from './AuthContext'

export interface SettingsContextValue {
  settings: Settings | null
  isLoading: boolean
  unitSystem: UnitSystem
  timezone: string
  goalWeightKg: number | null
  heightCm: number | null
  weeklyRunGoalM: number | null
  maxHr: number | null
  updateSettings: (patch: SettingsPatch) => Promise<Settings>
  refreshSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

interface LoadedSettings {
  userId: string
  data: Settings
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [loaded, setLoaded] = useState<LoadedSettings | null>(null)
  const [settledUserId, setSettledUserId] = useState<string | null>(null)

  useEffect(() => {
    if (user === null) {
      return
    }

    let cancelled = false

    settingsApi
      .get()
      .then((data) => {
        if (!cancelled) setLoaded({ userId: user.id, data })
      })
      .catch(() => {
        if (!cancelled) setLoaded(null)
      })
      .finally(() => {
        if (!cancelled) setSettledUserId(user.id)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  const updateSettings = useCallback(
    async (patch: SettingsPatch): Promise<Settings> => {
      if (user === null) {
        throw new Error('Not authenticated')
      }
      const data = await settingsApi.update(patch)
      setLoaded({ userId: user.id, data })
      return data
    },
    [user],
  )

  const refreshSettings = useCallback(async () => {
    if (user === null) {
      return
    }
    setLoaded({ userId: user.id, data: await settingsApi.get() })
  }, [user])

  const fallbackTimezone = useMemo(() => detectTimezone(), [])

  const settings = loaded !== null && user !== null && loaded.userId === user.id ? loaded.data : null
  const isLoading = user !== null && settledUserId !== user.id

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      isLoading,
      unitSystem: settings?.unit_system ?? 'metric',
      timezone: settings?.timezone ?? fallbackTimezone,
      goalWeightKg: settings?.goal_weight_kg ?? null,
      heightCm: settings?.height_cm ?? null,
      weeklyRunGoalM: settings?.weekly_run_goal_m ?? null,
      maxHr: settings?.max_hr ?? null,
      updateSettings,
      refreshSettings,
    }),
    [settings, isLoading, fallbackTimezone, updateSettings, refreshSettings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)

  if (context === null) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }

  return context
}
