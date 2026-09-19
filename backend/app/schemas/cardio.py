from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.services.analytics import pace_s_per_km

CardioType = Literal["run", "cycle", "swim", "row", "other"]
SplitSource = Literal["stored", "derived"]


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


class CardioSplitIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    split_number: int | None = Field(default=None, ge=1)
    distance_m: float = Field(gt=0)
    duration_s: int = Field(gt=0)


def _validate_splits(
    splits: list[CardioSplitIn] | None,
) -> list[CardioSplitIn] | None:
    if splits is None:
        return None
    numbers = [
        split.split_number if split.split_number is not None else index + 1
        for index, split in enumerate(splits)
    ]
    if len(set(numbers)) != len(numbers):
        raise ValueError("split_number values must be unique")
    return splits


class CardioActivityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    performed_at: datetime
    type: CardioType = "run"
    distance_m: float | None = Field(default=None, ge=0)
    duration_s: int = Field(gt=0)
    avg_hr: int | None = Field(default=None, ge=30, le=250)
    route_name: str | None = None
    notes: str | None = None
    shoe_id: UUID | None = None
    splits: list[CardioSplitIn] | None = None

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return as_utc(value)

    @field_validator("splits")
    @classmethod
    def unique_split_numbers(
        cls, value: list[CardioSplitIn] | None
    ) -> list[CardioSplitIn] | None:
        return _validate_splits(value)


class CardioActivityPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    performed_at: datetime | None = None
    type: CardioType | None = None
    distance_m: float | None = Field(default=None, ge=0)
    duration_s: int | None = Field(default=None, gt=0)
    avg_hr: int | None = Field(default=None, ge=30, le=250)
    route_name: str | None = None
    notes: str | None = None
    shoe_id: UUID | None = None
    splits: list[CardioSplitIn] | None = None

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime | None) -> datetime | None:
        return None if value is None else as_utc(value)

    @field_validator("splits")
    @classmethod
    def unique_split_numbers(
        cls, value: list[CardioSplitIn] | None
    ) -> list[CardioSplitIn] | None:
        return _validate_splits(value)


class CardioSplitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    split_number: int
    distance_m: float
    duration_s: int


class CardioSplitsOut(BaseModel):
    source: SplitSource
    splits: list[CardioSplitOut]


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
    shoe_id: UUID | None
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


class CardioPrValue(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    cardio_activity_id: UUID
    performed_at: datetime
    value: float

    @field_validator("performed_at")
    @classmethod
    def utc_performed_at(cls, value: datetime) -> datetime:
        return stored_utc(value)


class CardioPrsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    fastest_1k: CardioPrValue | None
    fastest_5k: CardioPrValue | None
    fastest_10k: CardioPrValue | None
    longest_distance: CardioPrValue | None
    longest_duration: CardioPrValue | None


class CardioZoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    zone: str
    label: str
    seconds: int


class CardioZonesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    max_hr: int
    zones: list[CardioZoneOut]


class CardioWeeklyCountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    week_start: date
    count: int
    distance_m: float


class CardioStreaksOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    current_weeks: int
    longest_weeks: int
    weekly_counts: list[CardioWeeklyCountOut]


class CardioComparisonTotalsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_distance_m: float
    total_duration_s: float
    activity_count: float
    avg_pace_s_per_km: float | None


class CardioComparisonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    this_week: CardioComparisonTotalsOut
    last_week: CardioComparisonTotalsOut
    four_week_average: CardioComparisonTotalsOut
