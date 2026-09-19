from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


def as_utc(value: datetime, field_name: str = "timestamp") -> datetime:
    """Reject naive datetimes and normalize aware ones to UTC."""
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must include a timezone offset")
    return value.astimezone(UTC)


def stored_utc(value: datetime) -> datetime:
    """Treat naive DB values as UTC; normalize aware ones to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class BodyMeasurementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    measured_at: datetime | None = None
    site: str | None = None
    value_cm: float | None = Field(default=None, gt=0)
    notes: str | None = None

    @field_validator("measured_at")
    @classmethod
    def utc_measured_at(cls, value: datetime | None) -> datetime | None:
        return None if value is None else as_utc(value, "measured_at")


class BodyMeasurementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    measured_at: datetime
    site: str
    value_cm: float
    notes: str | None
    created_at: datetime
    updated_at: datetime

    @field_validator("measured_at", "created_at", "updated_at")
    @classmethod
    def utc_timestamps(cls, value: datetime) -> datetime:
        return stored_utc(value)


class ProgressPhotoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    taken_at: datetime | None = None
    file_path: str | None = None
    notes: str | None = None

    @field_validator("taken_at")
    @classmethod
    def utc_taken_at(cls, value: datetime | None) -> datetime | None:
        return None if value is None else as_utc(value, "taken_at")


class ProgressPhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    taken_at: datetime
    file_path: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    @field_validator("taken_at", "created_at", "updated_at")
    @classmethod
    def utc_timestamps(cls, value: datetime) -> datetime:
        return stored_utc(value)


class TagCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None


class TagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def utc_timestamps(cls, value: datetime) -> datetime:
        return stored_utc(value)
