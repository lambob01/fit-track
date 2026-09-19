from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.settings import SettingsOut, SettingsPatch

router = APIRouter(prefix="/api/settings", tags=["settings"])

MONTHLY_MODE_VALUES = {"target": "goal_monthly_target_kg", "rate": "goal_monthly_rate_kg"}
MONTHLY_FIELDS = frozenset({"goal_monthly_mode", *MONTHLY_MODE_VALUES.values()})


def _requested_or_stored(payload: SettingsPatch, user: User, field: str):
    if field in payload.model_fields_set:
        return getattr(payload, field)
    return getattr(user, field)


@router.get("", response_model=SettingsOut)
def get_settings(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("", response_model=SettingsOut)
def patch_settings(
    payload: SettingsPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    fields_set = payload.model_fields_set

    if "goal_monthly_mode" in fields_set and payload.goal_monthly_mode is None:
        monthly_mode = None
    else:
        monthly_mode = _requested_or_stored(payload, user, "goal_monthly_mode")
    if monthly_mode is not None:
        value_field = MONTHLY_MODE_VALUES[monthly_mode]
        if _requested_or_stored(payload, user, value_field) is None:
            raise HTTPException(
                status_code=422,
                detail=f"goal_monthly_mode={monthly_mode} requires {value_field}",
            )

    if payload.goal_weight_target_date is not None:
        if _requested_or_stored(payload, user, "goal_weight_target_kg") is None:
            raise HTTPException(
                status_code=422,
                detail="goal_weight_target_date requires goal_weight_target_kg",
            )
    if payload.goal_weight_target_kg is not None:
        if _requested_or_stored(payload, user, "goal_weight_target_date") is None:
            raise HTTPException(
                status_code=422,
                detail="goal_weight_target_kg requires goal_weight_target_date",
            )

    for field in fields_set:
        value = getattr(payload, field)
        if value is None and field in {"unit_system", "timezone"}:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
        setattr(user, field, value)

    if "goal_monthly_mode" in fields_set and payload.goal_monthly_mode is None:
        user.goal_monthly_target_kg = None
        user.goal_monthly_rate_kg = None

    db.add(user)
    db.commit()
    db.refresh(user)
    return user
