from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, field_validator


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    unit_system: str
    timezone: str
    goal_weight_kg: float | None
    weekly_run_goal_m: float | None
    max_hr: int | None


class SettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    unit_system: str | None = None
    timezone: str | None = None
    goal_weight_kg: float | None = None
    weekly_run_goal_m: float | None = None
    max_hr: int | None = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            ZoneInfo(value)
        except (KeyError, ValueError) as exc:
            raise ValueError(f"Unknown timezone: {value}") from exc
        return value
