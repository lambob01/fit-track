from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class WeightEntry(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "weight_entries"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    measured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    body_fat_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="manual", default="manual"
    )

    __table_args__ = (
        CheckConstraint("weight_kg > 0", name="ck_weight_entries_weight_kg"),
        CheckConstraint(
            "body_fat_pct IS NULL OR (body_fat_pct > 0 AND body_fat_pct < 100)",
            name="ck_weight_entries_body_fat_pct",
        ),
        Index("ix_weight_entries_user_id_measured_at", "user_id", "measured_at"),
    )
