from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.services.analytics import pace_s_per_km

CardioType = Literal["run", "cycle", "swim", "row", "other"]


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


class CardioActivityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    performed_at: datetime
    type: CardioType = "run"
    distance_m: float | None = Field(default=None, ge=0)
    duration_s: int = Field(gt=0)
    avg_hr: int | None = Field(default=None, ge=30, le=250)
    route_name: str | None = None
    notes: str | None = None

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return as_utc(value)


class CardioActivityPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    performed_at: datetime | None = None
    type: CardioType | None = None
    distance_m: float | None = Field(default=None, ge=0)
    duration_s: int | None = Field(default=None, gt=0)
    avg_hr: int | None = Field(default=None, ge=30, le=250)
    route_name: str | None = None
    notes: str | None = None

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime | None) -> datetime | None:
        return None if value is None else as_utc(value)


class CardioActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    performed_at: datetime
    type: CardioType
    distance_m: float | None
    duration_s: int
    avg_hr: int | None
    route_name: str | None
    notes: str | None
    source: str

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)

    @computed_field
    @property
    def pace_s_per_km(self) -> float | None:
        return pace_s_per_km(self.distance_m, self.duration_s)


class CardioSummaryOut(BaseModel):
    total_distance_m: float
    total_duration_s: int
    activity_count: int
    avg_pace_s_per_km: float | None


class CardioWeekOut(CardioSummaryOut):
    week_start: datetime
    week_end: datetime
    weekly_goal_m: float | None
    goal_progress_pct: float | None

    @field_validator("week_start", "week_end")
    @classmethod
    def utc_timestamps(cls, value: datetime) -> datetime:
        return stored_utc(value)
