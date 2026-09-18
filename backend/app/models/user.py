from sqlalchemy import CheckConstraint, Float, Integer, Text, UniqueConstraint
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
    weekly_run_goal_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        CheckConstraint("unit_system IN ('metric', 'imperial')", name="ck_users_unit_system"),
        CheckConstraint(
            "max_hr IS NULL OR (max_hr >= 100 AND max_hr <= 250)", name="ck_users_max_hr"
        ),
    )
