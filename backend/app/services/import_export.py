import csv
import io
import logging
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, Uuid, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    BodyMeasurement,
    CardioActivity,
    Exercise,
    ProgressPhoto,
    SetEntry,
    Shoe,
    Tag,
    TemplateExercise,
    User,
    WeightEntry,
    Workout,
    WorkoutExercise,
    WorkoutTag,
    WorkoutTemplate,
)

logger = logging.getLogger(__name__)

ENTITY_MODELS: dict[str, type] = {
    "exercises": Exercise,
    "workout_templates": WorkoutTemplate,
    "template_exercises": TemplateExercise,
    "workouts": Workout,
    "workout_exercises": WorkoutExercise,
    "sets": SetEntry,
    "weight_entries": WeightEntry,
    "cardio_activities": CardioActivity,
    "body_measurements": BodyMeasurement,
    "progress_photos": ProgressPhoto,
    "tags": Tag,
    "workout_tags": WorkoutTag,
    "shoes": Shoe,
}

# Parents before children so every FK target already exists in the open transaction.
IMPORT_ENTITY_ORDER: tuple[str, ...] = (
    "exercises",
    "workout_templates",
    "template_exercises",
    "workouts",
    "workout_exercises",
    "sets",
    "weight_entries",
    "tags",
    "shoes",
    "cardio_activities",
    "body_measurements",
    "progress_photos",
    "workout_tags",
)

_TABLE_MODELS: dict[str, type] = {model.__tablename__: model for model in ENTITY_MODELS.values()}
_USER_OWNED_TABLES: frozenset[str] = frozenset(
    {
        "exercises",
        "workout_templates",
        "workouts",
        "weight_entries",
        "tags",
        "shoes",
        "cardio_activities",
        "body_measurements",
        "progress_photos",
    }
)


class ImportValidationError(Exception):
    pass


def _serialize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        moment = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
        return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    return value


def serialize_row(obj: Any) -> dict[str, Any]:
    return {
        column.key: _serialize_value(getattr(obj, column.key))
        for column in obj.__table__.columns
    }


def _parse_value(column: Any, value: Any) -> Any:
    if value is None:
        return None
    column_type = column.type
    if isinstance(column_type, Uuid):
        return value if isinstance(value, UUID) else UUID(str(value))
    if isinstance(column_type, DateTime):
        moment = value if isinstance(value, datetime) else datetime.fromisoformat(
            str(value).replace("Z", "+00:00")
        )
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        return moment.astimezone(UTC).replace(tzinfo=None)
    if isinstance(column_type, Date):
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        return date.fromisoformat(str(value))
    if isinstance(column_type, Boolean):
        return bool(value)
    if isinstance(column_type, Integer):
        return int(value)
    if isinstance(column_type, Float):
        return float(value)
    return value


def _owned_statement(entity: str, user: User):
    model = ENTITY_MODELS[entity]
    statement = select(model)
    if "user_id" in model.__table__.columns:
        statement = statement.where(model.user_id == user.id)
    elif entity == "template_exercises":
        statement = statement.join(
            WorkoutTemplate, TemplateExercise.template_id == WorkoutTemplate.id
        ).where(WorkoutTemplate.user_id == user.id)
    elif entity == "workout_exercises":
        statement = statement.join(
            Workout, WorkoutExercise.workout_id == Workout.id
        ).where(Workout.user_id == user.id)
    elif entity == "sets":
        statement = (
            statement.join(WorkoutExercise, SetEntry.workout_exercise_id == WorkoutExercise.id)
            .join(Workout, WorkoutExercise.workout_id == Workout.id)
            .where(Workout.user_id == user.id)
        )
    elif entity == "workout_tags":
        statement = statement.join(Workout, WorkoutTag.workout_id == Workout.id).where(
            Workout.user_id == user.id
        )
    return statement.order_by(*model.__table__.primary_key.columns)


def owned_rows(db: Session, entity: str, user: User) -> list[Any]:
    return list(db.scalars(_owned_statement(entity, user)))


def export_envelope(db: Session, user: User) -> dict[str, Any]:
    return {
        "format": "tracker-export",
        "version": 1,
        "exported_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "settings": {
            "unit_system": user.unit_system,
            "timezone": user.timezone,
            "goal_weight_kg": user.goal_weight_kg,
            "goal_rate_kg_per_week": user.goal_rate_kg_per_week,
            "goal_monthly_mode": user.goal_monthly_mode,
            "goal_monthly_target_kg": user.goal_monthly_target_kg,
            "goal_monthly_rate_kg": user.goal_monthly_rate_kg,
            "goal_weight_target_date": _serialize_value(user.goal_weight_target_date),
            "goal_weight_target_kg": user.goal_weight_target_kg,
            "height_cm": user.height_cm,
            "weekly_run_goal_m": user.weekly_run_goal_m,
            "max_hr": user.max_hr,
        },
        "data": {
            entity: [serialize_row(row) for row in owned_rows(db, entity, user)]
            for entity in ENTITY_MODELS
        },
    }


def export_csv(entity: str, rows: list[Any]) -> str:
    model = ENTITY_MODELS[entity]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=[column.key for column in model.__table__.columns])
    writer.writeheader()
    for row in rows:
        writer.writerow(serialize_row(row))
    return buffer.getvalue()


def _primary_key_columns(model: type) -> list[Any]:
    return list(model.__table__.primary_key.columns)


def _row_belongs_to_user(db: Session, model: type, pk_value: Any, user: User) -> bool:
    obj = db.get(model, pk_value)
    if obj is None:
        return False
    if model is User:
        return obj.id == user.id
    if model.__tablename__ in _USER_OWNED_TABLES:
        return obj.user_id == user.id
    for column in model.__table__.columns:
        foreign_keys = list(column.foreign_keys)
        if not foreign_keys:
            continue
        value = getattr(obj, column.key)
        if value is None:
            continue
        for foreign_key in foreign_keys:
            target_table = foreign_key.column.table.name
            if target_table == "users":
                continue
            target_model = _TABLE_MODELS[target_table]
            if not _row_belongs_to_user(db, target_model, value, user):
                return False
    return True


def _coerce_row(entity: str, model: type, row: dict[str, Any]) -> dict[str, Any]:
    columns = {column.key: column for column in model.__table__.columns}
    coerced: dict[str, Any] = {}
    for key, value in row.items():
        column = columns.get(key)
        if column is None:
            continue
        try:
            coerced[key] = _parse_value(column, value)
        except (TypeError, ValueError) as exc:
            raise ImportValidationError(f"Invalid value for {entity}.{key}") from exc
    return coerced


def _validate_parent_references(
    db: Session, entity: str, model: type, coerced: dict[str, Any], user: User
) -> None:
    db.flush()
    label = ", ".join(str(coerced[column.key]) for column in _primary_key_columns(model))
    for column in model.__table__.columns:
        foreign_keys = list(column.foreign_keys)
        if not foreign_keys or column.key not in coerced:
            continue
        value = coerced[column.key]
        if value is None:
            continue
        for foreign_key in foreign_keys:
            target_table = foreign_key.column.table.name
            if target_table == "users":
                continue
            target_model = _TABLE_MODELS[target_table]
            if not _row_belongs_to_user(db, target_model, value, user):
                raise ImportValidationError(
                    f"Missing parent reference for {entity} ({label}): {column.key}={value}"
                )


def _upsert_row(
    db: Session, entity: str, user: User, row: dict[str, Any]
) -> tuple[bool, bool, bool]:
    """Returns (created, updated, reassigned)."""
    model = ENTITY_MODELS[entity]
    pk_columns = _primary_key_columns(model)
    pk_values_list: list[Any] = []
    for column in pk_columns:
        raw = row.get(column.key)
        if raw is None:
            raise ImportValidationError(f"{entity} row is missing {column.key}")
        try:
            pk_values_list.append(_parse_value(column, raw))
        except (TypeError, ValueError) as exc:
            raise ImportValidationError(
                f"Invalid value for {entity}.{column.key}: {raw!r}"
            ) from exc
    pk_values = tuple(pk_values_list)
    pk_lookup = pk_values[0] if len(pk_values) == 1 else pk_values
    existing = db.get(model, pk_lookup)

    if existing is not None and model.__tablename__ not in _USER_OWNED_TABLES:
        if not _row_belongs_to_user(db, model, pk_lookup, user):
            label = ", ".join(str(value) for value in pk_values)
            raise ImportValidationError(f"Missing parent reference for {entity} ({label})")

    coerced = _coerce_row(entity, model, row)
    _validate_parent_references(db, entity, model, coerced, user)

    owns_user_column = "user_id" in model.__table__.columns
    reassigned = False
    if owns_user_column:
        if existing is not None and existing.user_id != user.id:
            reassigned = True
        elif existing is None:
            supplied = coerced.get("user_id")
            reassigned = supplied is not None and supplied != user.id
        coerced["user_id"] = user.id

    if existing is None:
        db.add(model(**coerced))
        return True, False, reassigned

    pk_keys = {column.key for column in pk_columns}
    changed = False
    for key, value in coerced.items():
        if key in pk_keys:
            continue
        if getattr(existing, key) != value:
            setattr(existing, key, value)
            changed = True
    return False, changed, reassigned


def import_envelope(
    db: Session, user: User, payload: dict[str, Any]
) -> tuple[dict[str, int], dict[str, int]]:
    data = payload.get("data")
    if not isinstance(data, dict):
        raise ImportValidationError("data must be an object")

    created: dict[str, int] = {}
    updated: dict[str, int] = {}
    try:
        for entity in IMPORT_ENTITY_ORDER:
            rows = data.get(entity, [])
            if not isinstance(rows, list):
                raise ImportValidationError(f"data.{entity} must be a list")
            entity_created = entity_updated = entity_reassigned = 0
            for row in rows:
                if not isinstance(row, dict):
                    raise ImportValidationError(f"{entity} rows must be objects")
                was_created, was_updated, reassigned = _upsert_row(db, entity, user, row)
                entity_created += int(was_created)
                entity_updated += int(was_updated)
                entity_reassigned += int(reassigned)
            db.flush()
            if entity_reassigned:
                logger.info(
                    "import: reassigned %d %s to user %s", entity_reassigned, entity, user.id
                )
            if entity_created:
                created[entity] = entity_created
            if entity_updated:
                updated[entity] = entity_updated
        db.commit()
    except ImportValidationError:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        logger.warning("import failed: %s", exc)
        raise ImportValidationError("Import violates database constraints") from exc
    return created, updated
