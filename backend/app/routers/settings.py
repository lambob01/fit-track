from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.settings import SettingsOut, SettingsPatch

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_settings(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("", response_model=SettingsOut)
def patch_settings(
    payload: SettingsPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    for field in payload.model_fields_set:
        value = getattr(payload, field)
        if value is None and field in {"unit_system", "timezone"}:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
        setattr(user, field, value)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
