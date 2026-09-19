from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)


class ProfileDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str


class ProfileOut(BaseModel):
    id: UUID
    username: str
    is_active: bool
    is_login_account: bool
    has_data: bool
    created_at: datetime


class DemoSeedOut(BaseModel):
    exercises: int
    workouts: int
    cardio_activities: int
    weight_entries: int
