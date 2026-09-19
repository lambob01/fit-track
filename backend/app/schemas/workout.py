from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def as_utc(value: datetime, field_name: str = "performed_at") -> datetime:
    """Reject naive datetimes and normalize aware ones to UTC."""
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must include a timezone offset")
    return value.astimezone(UTC)


def stored_utc(value: datetime) -> datetime:
    """Treat naive DB values as UTC; normalize aware ones to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class SetIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    set_number: int | None = Field(default=None, ge=1)
    weight_kg: float | None = Field(default=None, gt=0)
    reps: int = Field(ge=1)
    rpe: float | None = Field(default=None, ge=0, le=10)
    is_warmup: bool = False
    is_drop_set: bool = False
    notes: str | None = None

    @field_validator("rpe")
    @classmethod
    def half_step_rpe(cls, value: float | None) -> float | None:
        if value is not None and value * 2 != int(value * 2):
            raise ValueError("rpe must be in 0.5 steps")
        return value


class SetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    set_number: int
    weight_kg: float | None
    reps: int
    rpe: float | None
    is_warmup: bool
    is_drop_set: bool
    notes: str | None


class WorkoutExerciseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    exercise_id: UUID
    position: int = Field(ge=0)
    notes: str | None = None
    superset_group: int | None = None
    sets: list[SetIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_supplied_set_numbers(self) -> "WorkoutExerciseIn":
        supplied = [s.set_number for s in self.sets if s.set_number is not None]
        if len(supplied) != len(set(supplied)):
            raise ValueError("set_number must be unique per workout_exercise")
        return self


class WorkoutExerciseOut(BaseModel):
    id: UUID
    exercise_id: UUID
    position: int
    notes: str | None
    superset_group: int | None
    sets: list[SetOut]


class WorkoutIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    performed_at: datetime
    name: str | None = None
    template_id: UUID | None = None
    notes: str | None = None
    exercises: list[WorkoutExerciseIn] = Field(default_factory=list)

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return as_utc(value)

    @model_validator(mode="after")
    def unique_positions(self) -> "WorkoutIn":
        positions = [item.position for item in self.exercises]
        if len(positions) != len(set(positions)):
            raise ValueError("position must be unique per workout")
        return self


class WorkoutOut(BaseModel):
    id: UUID
    performed_at: datetime
    name: str | None
    template_id: UUID | None
    notes: str | None
    exercises: list[WorkoutExerciseOut]

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class WorkoutSummaryOut(BaseModel):
    id: UUID
    performed_at: datetime
    name: str | None
    template_id: UUID | None
    exercise_count: int
    set_count: int
    volume_kg: float

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class WorkoutPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    performed_at: datetime | None = None
    name: str | None = None
    template_id: UUID | None = None
    notes: str | None = None

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime | None) -> datetime | None:
        return None if value is None else as_utc(value)

    @model_validator(mode="after")
    def performed_at_not_null(self) -> "WorkoutPatch":
        if "performed_at" in self.model_fields_set and self.performed_at is None:
            raise ValueError("performed_at cannot be null")
        return self


class WorkoutExercisePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exercise_id: UUID | None = None
    position: int | None = Field(default=None, ge=0)
    notes: str | None = None
    superset_group: int | None = None

    @model_validator(mode="after")
    def required_fields_not_null(self) -> "WorkoutExercisePatch":
        for field in ("exercise_id", "position"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class SetPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    set_number: int | None = Field(default=None, ge=1)
    weight_kg: float | None = Field(default=None, gt=0)
    reps: int | None = Field(default=None, ge=1)
    rpe: float | None = Field(default=None, ge=0, le=10)
    is_warmup: bool | None = None
    is_drop_set: bool | None = None
    notes: str | None = None

    @field_validator("rpe")
    @classmethod
    def half_step_rpe(cls, value: float | None) -> float | None:
        if value is not None and value * 2 != int(value * 2):
            raise ValueError("rpe must be in 0.5 steps")
        return value

    @model_validator(mode="after")
    def required_fields_not_null(self) -> "SetPatch":
        for field in ("set_number", "reps", "is_warmup", "is_drop_set"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ReorderSetsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    set_ids: list[UUID]


class ProgressSessionOut(BaseModel):
    workout_id: UUID
    performed_at: datetime
    top_set_kg: float | None
    e1rm_kg: float | None
    volume_kg: float
    reps_volume: int

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class SetsPerWeekOut(BaseModel):
    week_start: datetime
    sets: int

    @field_validator("week_start")
    @classmethod
    def utc_week_start(cls, value: datetime) -> datetime:
        return stored_utc(value)


class AvgRpeOut(BaseModel):
    performed_at: datetime
    avg_rpe: float

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class EstimatedWeightOut(BaseModel):
    performed_at: datetime
    weight_kg: float

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class GoalRatePointOut(BaseModel):
    date: date
    weight_kg: float | None = None
    reps: float | None = None


class ExerciseGoalOut(BaseModel):
    mode: Literal["weight", "bodyweight"]
    weight_kg: float | None
    reps: int | None
    target_date: date | None
    required_rate_line: list[GoalRatePointOut] | None
    on_track: Literal["on_pace", "ahead", "behind", "expired"] | None
    estimate_date: date | None


class ProgressOut(BaseModel):
    sessions: list[ProgressSessionOut]
    sets_per_week: list[SetsPerWeekOut]
    avg_rpe: list[AvgRpeOut]
    estimated_weight_at_reps: list[EstimatedWeightOut] | None
    goal: ExerciseGoalOut | None


class WeightPrOut(BaseModel):
    weight_kg: float
    reps: int
    set_id: UUID
    workout_id: UUID
    performed_at: datetime

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class E1rmPrOut(BaseModel):
    e1rm_kg: float
    weight_kg: float
    reps: int
    set_id: UUID
    workout_id: UUID
    performed_at: datetime

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class RepsPrOut(BaseModel):
    reps: int
    weight_kg: float | None
    set_id: UUID
    workout_id: UUID
    performed_at: datetime

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class SessionVolumePrOut(BaseModel):
    volume_kg: float
    workout_id: UUID
    performed_at: datetime

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class PrsOut(BaseModel):
    heaviest_weight: WeightPrOut | None
    best_e1rm: E1rmPrOut | None
    best_reps: RepsPrOut | None
    best_session_volume: SessionVolumePrOut | None


class LastPerformanceOut(BaseModel):
    workout_id: UUID
    workout_exercise_id: UUID
    performed_at: datetime
    sets: list[SetOut]

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)
