export type UnitSystem = 'metric' | 'imperial'

export interface User {
  id: string
  username: string
  unit_system: UnitSystem
  timezone: string
  goal_weight_kg: number | null
  weekly_run_goal_m: number | null
  max_hr: number | null
}

export type Settings = User

export interface SettingsPatch {
  unit_system?: UnitSystem
  timezone?: string
  goal_weight_kg?: number | null
  weekly_run_goal_m?: number | null
  max_hr?: number | null
}

export interface LoginRequest {
  username: string
  password: string
}
