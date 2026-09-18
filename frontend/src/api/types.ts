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

export type CardioType = 'run' | 'cycle' | 'swim' | 'row' | 'other'

export interface CardioActivity {
  id: string
  performed_at: string
  type: CardioType
  distance_m: number | null
  duration_s: number
  avg_hr: number | null
  route_name: string | null
  notes: string | null
  source: string
  pace_s_per_km: number | null
}

export interface CardioActivityInput {
  performed_at: string
  type?: CardioType
  distance_m?: number | null
  duration_s: number
  avg_hr?: number | null
  route_name?: string | null
  notes?: string | null
}

export interface CardioSummary {
  total_distance_m: number
  total_duration_s: number
  activity_count: number
  avg_pace_s_per_km: number | null
}

export interface CardioWeek extends CardioSummary {
  week_start: string
  week_end: string
  weekly_goal_m: number | null
  goal_progress_pct: number | null
}

export interface Dashboard {
  latest_weight: LatestWeight | null
  weight_goal: WeightGoal | null
  last_workout: WorkoutSummary | null
  week_cardio: CardioWeek
}

export interface WeightEntry {
  id: string
  measured_at: string
  weight_kg: number
  body_fat_pct: number | null
  notes: string | null
  source: string
}

export interface WeightEntryInput {
  measured_at: string
  weight_kg: number
  body_fat_pct: number | null
  notes: string | null
}

export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'other'

export interface Exercise {
  id: string
  name: string
  muscle_group: string
  category: ExerciseCategory
  equipment: string
  is_compound: boolean
  is_archived: boolean
}

export interface ExerciseInput {
  name: string
  muscle_group?: string
  category?: ExerciseCategory
  equipment?: string
  is_compound?: boolean
}

export interface ExercisePatch {
  name?: string
  muscle_group?: string
  category?: ExerciseCategory
  equipment?: string
  is_compound?: boolean
  is_archived?: boolean
}

export interface ExerciseResolveResult {
  id: string
  name: string
  is_archived: boolean
  created: boolean
}

export interface WorkoutSet {
  id: string
  set_number: number
  weight_kg: number | null
  reps: number
  rpe: number | null
  is_warmup: boolean
  is_drop_set: boolean
  notes: string | null
}

export interface SetInput {
  id?: string
  set_number?: number
  weight_kg?: number | null
  reps: number
  rpe?: number | null
  is_warmup?: boolean
  is_drop_set?: boolean
  notes?: string | null
}

export interface SetPatch {
  set_number?: number
  weight_kg?: number | null
  reps?: number
  rpe?: number | null
  is_warmup?: boolean
}

export interface WorkoutExercise {
  id: string
  exercise_id: string
  position: number
  notes: string | null
  superset_group: number | null
  sets: WorkoutSet[]
}

export interface WorkoutExerciseInput {
  id?: string
  exercise_id: string
  position: number
  notes?: string | null
  superset_group?: number | null
  sets?: SetInput[]
}

export interface Workout {
  id: string
  performed_at: string
  name: string | null
  template_id: string | null
  notes: string | null
  exercises: WorkoutExercise[]
}

export interface WorkoutInput {
  id?: string
  performed_at: string
  name?: string | null
  template_id?: string | null
  notes?: string | null
  exercises?: WorkoutExerciseInput[]
}

export interface WorkoutPatch {
  performed_at?: string
  name?: string | null
  template_id?: string | null
  notes?: string | null
}

export interface LastPerformance {
  workout_id: string
  workout_exercise_id: string
  performed_at: string
  sets: WorkoutSet[]
}

export interface ProgressSession {
  workout_id: string
  performed_at: string
  top_set_kg: number | null
  e1rm_kg: number | null
  volume_kg: number
  reps_volume: number
}

export interface ExerciseProgress {
  sessions: ProgressSession[]
}

export interface WeightPr {
  weight_kg: number
  reps: number
  set_id: string
  workout_id: string
  performed_at: string
}

export interface E1rmPr {
  e1rm_kg: number
  weight_kg: number
  reps: number
  set_id: string
  workout_id: string
  performed_at: string
}

export interface RepsPr {
  reps: number
  weight_kg: number | null
  set_id: string
  workout_id: string
  performed_at: string
}

export interface SessionVolumePr {
  volume_kg: number
  workout_id: string
  performed_at: string
}

export interface ExercisePrs {
  heaviest_weight: WeightPr | null
  best_e1rm: E1rmPr | null
  best_reps: RepsPr | null
  best_session_volume: SessionVolumePr | null
}

export interface TemplateExercise {
  id: string
  exercise_id: string
  position: number
  target_sets: number | null
  target_reps: number | null
  target_weight_kg: number | null
}

export interface TemplateExerciseInput {
  exercise_id: string
  position: number
  target_sets?: number | null
  target_reps?: number | null
  target_weight_kg?: number | null
}

export interface Template {
  id: string
  name: string
  notes: string | null
  is_archived: boolean
  exercises: TemplateExercise[]
}

export interface TemplateInput {
  name: string
  notes?: string | null
  exercises: TemplateExerciseInput[]
}

export interface TemplatePatch {
  name?: string
  notes?: string | null
  is_archived?: boolean
  exercises?: TemplateExerciseInput[]
}

export interface PlannedExercise {
  exercise_id: string
  position: number
  sets: number
  reps: number | null
  weight_kg: number | null
}

export interface StartFromTemplateResult {
  workout: Workout
  planned: PlannedExercise[]
}

export type WeightBucket = 'day' | 'week' | 'month' | 'year'

export interface WeightSeriesPoint {
  bucket_start: string
  measured_at: string
  weight_kg: number
}

export interface MovingAveragePoint {
  measured_at: string
  value: number
}

export interface WeightTrend {
  slope_per_day: number
  intercept: number
  from_value: number
  to_value: number
}

export interface WeightSeries {
  bucket: WeightBucket
  from: string
  to: string
  points: WeightSeriesPoint[]
  moving_average: MovingAveragePoint[]
  trend: WeightTrend | null
  goal_weight_kg: number | null
}
