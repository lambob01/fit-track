from datetime import date
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Exercise(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "exercises"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    name_lower: Mapped[str] = mapped_column(Text, nullable=False)
    muscle_group: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="other", default="other"
    )
    category: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="other", default="other"
    )
    equipment: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="other", default="other"
    )
    is_compound: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0"), default=False
    )
    is_archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0"), default=False
    )
    goal_weight_kg: Mapped[float | None] = mapped_column(
        Float,
        CheckConstraint(
            "goal_weight_kg IS NULL OR goal_weight_kg > 0",
            name="ck_exercises_goal_weight_kg",
        ),
        nullable=True,
    )
    goal_reps: Mapped[int | None] = mapped_column(
        Integer,
        CheckConstraint(
            "goal_reps IS NULL OR goal_reps > 0", name="ck_exercises_goal_reps"
        ),
        nullable=True,
    )
    goal_target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    goal_reps_bodyweight: Mapped[int | None] = mapped_column(
        Integer,
        CheckConstraint(
            "goal_reps_bodyweight IS NULL OR goal_reps_bodyweight > 0",
            name="ck_exercises_goal_reps_bodyweight",
        ),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name_lower", name="uq_exercises_user_id_name_lower"),
        CheckConstraint(
            "category IN ('push', 'pull', 'legs', 'other')", name="ck_exercises_category"
        ),
        Index("ix_exercises_user_archived", "user_id", "is_archived"),
    )
