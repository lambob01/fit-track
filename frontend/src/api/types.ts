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

export interface LatestWeight {
  measured_at: string
  weight_kg: number
  body_fat_pct: number | null
}

export interface WeightGoal {
  goal_weight_kg: number
  latest_weight_kg: number | null
}

export interface WorkoutSummary {
  id: string
  performed_at: string
  name: string | null
  template_id: string | null
  exercise_count: number
  set_count: number
  volume_kg: number
}

export interface CardioWeek {
  week_start: string
  week_end: string
  total_distance_m: number
  total_duration_s: number
  activity_count: number
  avg_pace_s_per_km: number | null
  weekly_goal_m: number | null
  goal_progress_pct: number | null
}

export interface Dashboard {
  latest_weight: LatestWeight | null
  weight_goal: WeightGoal | null
  last_workout: WorkoutSummary | null
  week_cardio: CardioWeek
}
