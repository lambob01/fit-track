from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
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


class WorkoutTemplate(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "workout_templates"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    name_lower: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0"), default=False
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "name_lower", name="uq_workout_templates_user_id_name_lower"
        ),
        Index("ix_workout_templates_user_archived", "user_id", "is_archived"),
    )


class TemplateExercise(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "template_exercises"

    template_id: Mapped[UUID] = mapped_column(
        ForeignKey("workout_templates.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="RESTRICT"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    target_sets: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "template_id", "position", name="uq_template_exercises_template_position"
        ),
        CheckConstraint("position >= 0", name="ck_template_exercises_position"),
        CheckConstraint(
            "target_sets IS NULL OR target_sets > 0", name="ck_template_exercises_target_sets"
        ),
        CheckConstraint(
            "target_reps IS NULL OR target_reps > 0", name="ck_template_exercises_target_reps"
        ),
        CheckConstraint(
            "target_weight_kg IS NULL OR target_weight_kg > 0",
            name="ck_template_exercises_target_weight_kg",
        ),
    )


class Workout(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "workouts"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    performed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    template_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("workout_templates.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_workouts_user_id_performed_at", "user_id", "performed_at"),)


class WorkoutExercise(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "workout_exercises"

    workout_id: Mapped[UUID] = mapped_column(
        ForeignKey("workouts.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="RESTRICT"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    superset_group: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "workout_id", "position", name="uq_workout_exercises_workout_position"
        ),
        CheckConstraint("position >= 0", name="ck_workout_exercises_position"),
    )


class SetEntry(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sets"

    workout_exercise_id: Mapped[UUID] = mapped_column(
        ForeignKey("workout_exercises.id", ondelete="CASCADE"), nullable=False
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    reps: Mapped[int] = mapped_column(Integer, nullable=False)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_warmup: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0"), default=False
    )
    is_drop_set: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0"), default=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "workout_exercise_id", "set_number", name="uq_sets_workout_exercise_set_number"
        ),
        CheckConstraint("set_number >= 1", name="ck_sets_set_number"),
        CheckConstraint("weight_kg > 0 OR weight_kg IS NULL", name="ck_sets_weight_kg"),
        CheckConstraint("reps >= 1", name="ck_sets_reps"),
        CheckConstraint("rpe IS NULL OR (rpe >= 0 AND rpe <= 10)", name="ck_sets_rpe"),
    )
