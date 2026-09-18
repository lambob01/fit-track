from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

WeightBucket = Literal["day", "week", "month", "year"]


def as_utc(value: datetime) -> datetime:
    """Reject naive datetimes and normalize aware ones to UTC."""
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("measured_at must include a timezone offset")
    return value.astimezone(UTC)


def stored_utc(value: datetime) -> datetime:
    """Treat naive DB values as UTC; normalize aware ones to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class WeightEntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    measured_at: datetime
    weight_kg: float = Field(gt=0)
    body_fat_pct: float | None = Field(default=None, gt=0, lt=100)
    notes: str | None = None

    @field_validator("measured_at")
    @classmethod
    def utc_measured_at(cls, value: datetime) -> datetime:
        return as_utc(value)


class WeightEntryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    measured_at: datetime | None = None
    weight_kg: float | None = Field(default=None, gt=0)
    body_fat_pct: float | None = Field(default=None, gt=0, lt=100)
    notes: str | None = None

    @field_validator("measured_at")
    @classmethod
    def utc_measured_at(cls, value: datetime | None) -> datetime | None:
        return None if value is None else as_utc(value)


class WeightEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    measured_at: datetime
    weight_kg: float
    body_fat_pct: float | None
    notes: str | None
    source: str

    @field_validator("measured_at")
    @classmethod
    def utc_measured_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class WeightSeriesPoint(BaseModel):
    bucket_start: datetime
    measured_at: datetime
    weight_kg: float

    @field_validator("bucket_start", "measured_at")
    @classmethod
    def utc_timestamps(cls, value: datetime) -> datetime:
        return stored_utc(value)


class MovingAveragePoint(BaseModel):
    measured_at: datetime
    value: float

    @field_validator("measured_at")
    @classmethod
    def utc_measured_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class WeightTrendOut(BaseModel):
    slope_per_day: float
    intercept: float
    from_value: float
    to_value: float


class WeightSeriesOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    bucket: WeightBucket
    from_: datetime = Field(alias="from")
    to: datetime
    points: list[WeightSeriesPoint]
    moving_average: list[MovingAveragePoint]
    trend: WeightTrendOut | None
    goal_weight_kg: float | None

    @field_validator("from_", "to")
    @classmethod
    def utc_timestamps(cls, value: datetime) -> datetime:
        return stored_utc(value)
