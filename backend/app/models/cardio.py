from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.phase2 import Shoe


class CardioActivity(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cardio_activities"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    performed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    type: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="run", default="run"
    )
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_s: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    route_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    shoe_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("shoes.id", ondelete="SET NULL"), nullable=True
    )
    source: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="manual", default="manual"
    )

    shoe: Mapped["Shoe | None"] = relationship("Shoe")

    __table_args__ = (
        CheckConstraint(
            "type IN ('run', 'cycle', 'swim', 'row', 'other')",
            name="ck_cardio_activities_type",
        ),
        CheckConstraint(
            "distance_m IS NULL OR distance_m >= 0", name="ck_cardio_activities_distance_m"
        ),
        CheckConstraint("duration_s > 0", name="ck_cardio_activities_duration_s"),
        CheckConstraint(
            "avg_hr IS NULL OR (avg_hr >= 30 AND avg_hr <= 250)",
            name="ck_cardio_activities_avg_hr",
        ),
        Index("ix_cardio_activities_user_id_performed_at", "user_id", "performed_at"),
    )
