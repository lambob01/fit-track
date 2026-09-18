from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
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

    __table_args__ = (
        UniqueConstraint("user_id", "name_lower", name="uq_exercises_user_id_name_lower"),
        CheckConstraint(
            "category IN ('push', 'pull', 'legs', 'other')", name="ck_exercises_category"
        ),
        Index("ix_exercises_user_archived", "user_id", "is_archived"),
    )
