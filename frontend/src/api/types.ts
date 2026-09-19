export type UnitSystem = 'metric' | 'imperial'

export interface Profile {
  id: string
  username: string
  is_active: boolean
  is_login_account: boolean
  has_data: boolean
  created_at: string
}

export interface DemoSeedCounts {
  exercises: number
  workouts: number
  cardio_activities: number
  weight_entries: number
}

export type MonthlyGoalMode = 'target' | 'rate'
export type OnTrackStatus = 'on_pace' | 'ahead' | 'behind' | 'expired'

export interface User {
  id: string
  username: string
  unit_system: UnitSystem
  timezone: string
  goal_weight_kg: number | null
  goal_rate_kg_per_week: number | null
  goal_monthly_mode: MonthlyGoalMode | null
  goal_monthly_target_kg: number | null
  goal_monthly_rate_kg: number | null
  goal_weight_target_date: string | null
  goal_weight_target_kg: number | null
  height_cm: number | null
  weekly_run_goal_m: number | null
  max_hr: number | null
}

export type Settings = User

export interface SettingsPatch {
  unit_system?: UnitSystem
  timezone?: string
  goal_weight_kg?: number | null
  goal_rate_kg_per_week?: number | null
  goal_monthly_mode?: MonthlyGoalMode | null
  goal_monthly_target_kg?: number | null
  goal_monthly_rate_kg?: number | null
  goal_weight_target_date?: string | null
  goal_weight_target_kg?: number | null
  height_cm?: number | null
  weekly_run_goal_m?: number | null
  max_hr?: number | null
}

export interface LoginRequest {
  username: string
  password: string
}

export type ExportEntity =
  | 'exercises'
  | 'workout_templates'
  | 'template_exercises'
  | 'workouts'
  | 'workout_exercises'
  | 'sets'
  | 'weight_entries'
  | 'cardio_activities'
  | 'body_measurements'
  | 'progress_photos'
  | 'tags'
  | 'workout_tags'
  | 'shoes'

export interface ImportCounts {
  created: Record<string, number>
  updated: Record<string, number>
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

export interface WeightGoalProgress {
  status: OnTrackStatus
  trend_slope_kg_per_week: number
  rate_goal_kg_per_week: number | null
  required_rate_kg_per_week: number | null
}

export interface Dashboard {
  latest_weight: LatestWeight | null
  weight_goal: WeightGoal | null
  weight_goal_progress: WeightGoalProgress | null
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

export interface ReorderSetsInput {
  set_ids: string[]
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

export interface WeightMonthlyGoal {
  mode: MonthlyGoalMode | null
  target_kg: number | null
  rate_kg_per_month: number | null
}

export interface WeightSeriesGoals {
  final_weight_kg: number | null
  rate_kg_per_week: number | null
  monthly: WeightMonthlyGoal
}

export interface RequiredRatePoint {
  date: string
  weight_kg: number
}

export interface WeightSeries {
  bucket: WeightBucket
  from: string
  to: string
  points: WeightSeriesPoint[]
  moving_average: MovingAveragePoint[]
  trend: WeightTrend | null
  goal_weight_kg: number | null
  goals: WeightSeriesGoals
  required_rate_line: RequiredRatePoint[] | null
  on_track: OnTrackStatus | null
}

export interface PlanSlot {
  id: string
  day_of_week: number
  template_id: string | null
  template_name: string | null
}

export interface PlanSlotInput {
  day_of_week: number
  template_id: string | null
}

export interface Plan {
  id: string
  name: string
  is_active: boolean
  slots: PlanSlot[]
}

export interface PlanInput {
  name: string
  is_active?: boolean
  slots: PlanSlotInput[]
}

export interface PlanPatch {
  name?: string
  slots?: PlanSlotInput[]
}

export interface CalendarDay {
  date: string
  day_of_week: number
  template_id: string | null
  template_name: string | null
  completed: boolean
  workout_ids: string[]
}

export interface CalendarAdherence {
  planned_days: number
  completed_days: number
}

export interface CalendarPlanRef {
  id: string
  name: string
}

export interface CalendarWeek {
  week_start: string
  week_end: string
  plan: CalendarPlanRef | null
  days: CalendarDay[]
  adherence: CalendarAdherence
}
