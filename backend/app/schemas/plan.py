from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _clean_name(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("name cannot be blank")
    return stripped


def _unique_days(slots: list["PlanSlotIn"]) -> None:
    days = [slot.day_of_week for slot in slots]
    if len(days) != len(set(days)):
        raise ValueError("day_of_week must be unique per plan")


class PlanSlotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day_of_week: int = Field(ge=0, le=6)
    template_id: UUID | None = None


class PlanIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    is_active: bool = False
    slots: list[PlanSlotIn] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return _clean_name(value)

    @model_validator(mode="after")
    def unique_days(self) -> "PlanIn":
        _unique_days(self.slots)
        return self


class PlanPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1)
    slots: list[PlanSlotIn] | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_name(value)

    @model_validator(mode="after")
    def required_fields_not_null(self) -> "PlanPatch":
        for field in ("name", "slots"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        if self.slots is not None:
            _unique_days(self.slots)
        return self


class PlanSlotOut(BaseModel):
    id: UUID
    day_of_week: int
    template_id: UUID | None
    template_name: str | None


class PlanOut(BaseModel):
    id: UUID
    name: str
    is_active: bool
    slots: list[PlanSlotOut]


class CalendarPlanOut(BaseModel):
    id: UUID
    name: str


class CalendarDayOut(BaseModel):
    date: date
    day_of_week: int
    template_id: UUID | None
    template_name: str | None
    completed: bool
    workout_ids: list[UUID]


class CalendarAdherenceOut(BaseModel):
    planned_days: int
    completed_days: int


class CalendarOut(BaseModel):
    week_start: datetime
    week_end: datetime
    plan: CalendarPlanOut | None
    days: list[CalendarDayOut]
    adherence: CalendarAdherenceOut
