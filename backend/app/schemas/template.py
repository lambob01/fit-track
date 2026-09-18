from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.workout import WorkoutOut


def _clean_name(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("name cannot be blank")
    return stripped


def _unique_positions(items: list["TemplateExerciseIn"]) -> None:
    positions = [item.position for item in items]
    if len(positions) != len(set(positions)):
        raise ValueError("position must be unique per template")


class TemplateExerciseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exercise_id: UUID
    position: int = Field(ge=0)
    target_sets: int | None = Field(default=None, gt=0)
    target_reps: int | None = Field(default=None, gt=0)
    target_weight_kg: float | None = Field(default=None, gt=0)


class TemplateExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    exercise_id: UUID
    position: int
    target_sets: int | None
    target_reps: int | None
    target_weight_kg: float | None


class TemplateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    notes: str | None = None
    exercises: list[TemplateExerciseIn] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return _clean_name(value)

    @model_validator(mode="after")
    def unique_positions(self) -> "TemplateIn":
        _unique_positions(self.exercises)
        return self


class TemplatePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1)
    notes: str | None = None
    is_archived: bool | None = None
    exercises: list[TemplateExerciseIn] | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_name(value)

    @model_validator(mode="after")
    def required_fields_not_null(self) -> "TemplatePatch":
        for field in ("name", "is_archived", "exercises"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        if self.exercises is not None:
            _unique_positions(self.exercises)
        return self


class TemplateOut(BaseModel):
    id: UUID
    name: str
    notes: str | None
    is_archived: bool
    exercises: list[TemplateExerciseOut]


class PlannedOut(BaseModel):
    exercise_id: UUID
    position: int
    sets: int
    reps: int | None
    weight_kg: float | None


class StartFromTemplateOut(BaseModel):
    workout: WorkoutOut
    planned: list[PlannedOut]
