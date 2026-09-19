from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import CardioActivity, Exercise, User, WeightEntry, Workout
from app.schemas.profile import DemoSeedOut, ProfileCreate, ProfileDelete, ProfileOut
from app.security import verify_password
from app.seed.exercises import seed_exercises
from app.seed.fake_data import seed_fake_data
from app.services.users import create_profile

router = APIRouter(
    prefix="/api/profiles", tags=["profiles"], dependencies=[Depends(get_current_user)]
)
demo_router = APIRouter(
    prefix="/api/data", tags=["data"], dependencies=[Depends(get_current_user)]
)


def _has_data(db: Session, user_id: UUID) -> bool:
    for model in (Workout, WeightEntry, CardioActivity):
        exists = db.scalar(select(model.id).where(model.user_id == user_id).limit(1))
        if exists is not None:
            return True
    return False


def _has_exercises(db: Session, user_id: UUID) -> bool:
    exists = db.scalar(select(Exercise.id).where(Exercise.user_id == user_id).limit(1))
    return exists is not None


def _profile_out(db: Session, profile: User, active_id: UUID) -> ProfileOut:
    return ProfileOut(
        id=profile.id,
        username=profile.username,
        is_active=profile.id == active_id,
        is_login_account=profile.username == settings.app_username,
        has_data=_has_data(db, profile.id),
        created_at=profile.created_at,
    )


@router.get("", response_model=list[ProfileOut])
def list_profiles(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ProfileOut]:
    profiles = db.scalars(select(User).order_by(User.created_at, User.username))
    return [_profile_out(db, profile, user.id) for profile in profiles]


@router.post("", response_model=ProfileOut, status_code=201)
def create_profile_endpoint(
    payload: ProfileCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name cannot be blank")
    if db.scalar(select(User).where(User.username == name)) is not None:
        raise HTTPException(status_code=409, detail="Profile name already exists")
    profile = create_profile(db, name)
    return _profile_out(db, profile, user.id)


@router.post("/{profile_id}/switch", status_code=204)
def switch_profile(
    profile_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    profile = db.get(User, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    request.session["user_id"] = str(profile.id)
    return Response(status_code=204)


@router.delete("/{profile_id}", status_code=204)
def delete_profile(
    profile_id: UUID,
    payload: ProfileDelete,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    if not verify_password(payload.password, settings.app_password_hash):
        raise HTTPException(status_code=403, detail="Invalid password")
    if profile_id == user.id:
        raise HTTPException(status_code=409, detail="Cannot delete the active profile")
    profile = db.get(User, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if profile.username == settings.app_username:
        raise HTTPException(status_code=409, detail="Cannot delete the login profile")
    remaining = db.scalar(select(func.count()).select_from(User))
    if remaining is not None and remaining <= 1:
        raise HTTPException(status_code=409, detail="Cannot delete the last profile")
    db.delete(profile)
    db.commit()
    return Response(status_code=204)


@demo_router.post("/demo", response_model=DemoSeedOut)
def seed_demo(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> DemoSeedOut:
    exercises = 0
    if not _has_exercises(db, user.id):
        exercises = seed_exercises(db, user.id)

    workouts = 0
    cardio_activities = 0
    weight_entries = 0
    if not _has_data(db, user.id):
        generated = seed_fake_data(db, user.id)
        workouts = generated["workouts"]
        cardio_activities = generated["cardio_activities"]
        weight_entries = generated["weight_entries"]

    return DemoSeedOut(
        exercises=exercises,
        workouts=workouts,
        cardio_activities=cardio_activities,
        weight_entries=weight_entries,
    )
