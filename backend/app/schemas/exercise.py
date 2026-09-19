from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

ExerciseCategory = Literal["push", "pull", "legs", "other"]


def _clean_name(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("name cannot be blank")
    return stripped


class ExerciseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    muscle_group: str = "other"
    category: ExerciseCategory = "other"
    equipment: str = "other"
    is_compound: bool = False

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return _clean_name(value)


class ExercisePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1)
    muscle_group: str | None = None
    category: ExerciseCategory | None = None
    equipment: str | None = None
    is_compound: bool | None = None
    is_archived: bool | None = None
    goal_weight_kg: float | None = Field(default=None, gt=0)
    goal_reps: int | None = Field(default=None, ge=1)
    goal_target_date: date | None = None
    goal_reps_bodyweight: int | None = Field(default=None, ge=1)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_name(value)


class ExerciseResolveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return _clean_name(value)


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    muscle_group: str
    category: str
    equipment: str
    is_compound: bool
    is_archived: bool
    goal_weight_kg: float | None = None
    goal_reps: int | None = None
    goal_target_date: date | None = None
    goal_reps_bodyweight: int | None = None


class ExerciseResolveOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    is_archived: bool
    created: bool
