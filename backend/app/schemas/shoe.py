from datetime import UTC, date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _clean_name(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("name cannot be blank")
    return stripped


def stored_utc(value: datetime) -> datetime:
    """Treat naive DB values as UTC; normalize aware ones to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class ShoeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    purchased_at: date | None = None
    initial_distance_m: float = Field(default=0, ge=0)
    retired_at: date | None = None
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return _clean_name(value)


class ShoePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1)
    purchased_at: date | None = None
    initial_distance_m: float | None = Field(default=None, ge=0)
    retired_at: date | None = None
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_name(value)

    @model_validator(mode="after")
    def required_fields_not_null(self) -> "ShoePatch":
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        if "initial_distance_m" in self.model_fields_set and self.initial_distance_m is None:
            raise ValueError("initial_distance_m cannot be null")
        return self


class ShoeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    purchased_at: date | None
    initial_distance_m: float
    retired_at: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    mileage_m: float

    @field_validator("created_at", "updated_at")
    @classmethod
    def utc_timestamps(cls, value: datetime) -> datetime:
        return stored_utc(value)
