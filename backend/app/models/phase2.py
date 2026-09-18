from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class BodyMeasurement(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "body_measurements"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    measured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    site: Mapped[str] = mapped_column(Text, nullable=False)
    value_cm: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (CheckConstraint("value_cm > 0", name="ck_body_measurements_value_cm"),)


class ProgressPhoto(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "progress_photos"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    taken_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Tag(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "tags"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_tags_user_id_name"),)


class WorkoutTag(Base):
    __tablename__ = "workout_tags"

    workout_id: Mapped[UUID] = mapped_column(
        ForeignKey("workouts.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )


workout_tags = WorkoutTag.__table__


class Shoe(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "shoes"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    purchased_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    initial_distance_m: Mapped[float] = mapped_column(
        Float, nullable=False, server_default=text("0"), default=0
    )
    retired_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
