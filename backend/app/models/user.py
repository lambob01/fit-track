from datetime import date

from sqlalchemy import CheckConstraint, Date, Float, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(Text, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    unit_system: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="metric", default="metric"
    )
    timezone: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="UTC", default="UTC"
    )
    goal_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    goal_rate_kg_per_week: Mapped[float | None] = mapped_column(
        Float,
        CheckConstraint(
            "goal_rate_kg_per_week IS NULL OR goal_rate_kg_per_week != 0",
            name="ck_users_goal_rate_kg_per_week",
        ),
        nullable=True,
    )
    goal_monthly_mode: Mapped[str | None] = mapped_column(
        Text,
        CheckConstraint(
            "goal_monthly_mode IS NULL OR goal_monthly_mode IN ('target', 'rate')",
            name="ck_users_goal_monthly_mode",
        ),
        nullable=True,
    )
    goal_monthly_target_kg: Mapped[float | None] = mapped_column(
        Float,
        CheckConstraint(
            "goal_monthly_target_kg IS NULL OR goal_monthly_target_kg > 0",
            name="ck_users_goal_monthly_target_kg",
        ),
        nullable=True,
    )
    goal_monthly_rate_kg: Mapped[float | None] = mapped_column(
        Float,
        CheckConstraint(
            "goal_monthly_rate_kg IS NULL OR goal_monthly_rate_kg != 0",
            name="ck_users_goal_monthly_rate_kg",
        ),
        nullable=True,
    )
    height_cm: Mapped[float | None] = mapped_column(
        Float,
        CheckConstraint(
            "height_cm IS NULL OR height_cm > 0", name="ck_users_height_cm"
        ),
        nullable=True,
    )
    goal_weight_target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    goal_weight_target_kg: Mapped[float | None] = mapped_column(
        Float,
        CheckConstraint(
            "goal_weight_target_kg IS NULL OR goal_weight_target_kg > 0",
            name="ck_users_goal_weight_target_kg",
        ),
        nullable=True,
    )
    weekly_run_goal_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        CheckConstraint("unit_system IN ('metric', 'imperial')", name="ck_users_unit_system"),
        CheckConstraint(
            "max_hr IS NULL OR (max_hr >= 100 AND max_hr <= 250)", name="ck_users_max_hr"
        ),
    )
