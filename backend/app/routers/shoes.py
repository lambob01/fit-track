from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import CardioActivity, Shoe, User
from app.schemas.shoe import ShoeCreate, ShoeOut, ShoePatch

router = APIRouter(
    prefix="/api/shoes",
    tags=["shoes"],
    dependencies=[Depends(get_current_user)],
)


def _get_owned(db: Session, user: User, shoe_id: UUID) -> Shoe:
    shoe = db.get(Shoe, shoe_id)
    if shoe is None or shoe.user_id != user.id:
        raise HTTPException(status_code=404, detail="Shoe not found")
    return shoe


def require_owned_shoe(db: Session, user: User, shoe_id: UUID | None) -> None:
    """404 unless `shoe_id` is null or names a shoe owned by the user."""
    if shoe_id is None:
        return
    shoe = db.get(Shoe, shoe_id)
    if shoe is None or shoe.user_id != user.id:
        raise HTTPException(status_code=404, detail="Shoe not found")


def _mileage_by_shoe(db: Session, user: User, shoe_ids: list[UUID]) -> dict[UUID, float]:
    if not shoe_ids:
        return {}
    rows = db.execute(
        select(
            CardioActivity.shoe_id,
            func.coalesce(func.sum(CardioActivity.distance_m), 0.0),
        )
        .where(
            CardioActivity.user_id == user.id,
            CardioActivity.shoe_id.in_(shoe_ids),
        )
        .group_by(CardioActivity.shoe_id)
    )
    return {shoe_id: float(total) for shoe_id, total in rows}


def _shoe_out(shoe: Shoe, activity_distance_m: float) -> ShoeOut:
    return ShoeOut(
        id=shoe.id,
        name=shoe.name,
        purchased_at=shoe.purchased_at,
        initial_distance_m=shoe.initial_distance_m,
        retired_at=shoe.retired_at,
        notes=shoe.notes,
        created_at=shoe.created_at,
        updated_at=shoe.updated_at,
        mileage_m=shoe.initial_distance_m + activity_distance_m,
    )


def _single_out(db: Session, user: User, shoe: Shoe) -> ShoeOut:
    return _shoe_out(shoe, _mileage_by_shoe(db, user, [shoe.id]).get(shoe.id, 0.0))


@router.get("", response_model=list[ShoeOut])
def list_shoes(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ShoeOut]:
    shoes = list(
        db.scalars(
            select(Shoe)
            .where(Shoe.user_id == user.id)
            .order_by(Shoe.created_at, Shoe.id)
            .limit(limit)
            .offset(offset)
        )
    )
    mileage = _mileage_by_shoe(db, user, [shoe.id for shoe in shoes])
    return [_shoe_out(shoe, mileage.get(shoe.id, 0.0)) for shoe in shoes]


@router.post("", response_model=ShoeOut, status_code=201)
def create_shoe(
    payload: ShoeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ShoeOut:
    shoe = Shoe(
        user_id=user.id,
        name=payload.name,
        purchased_at=payload.purchased_at,
        initial_distance_m=payload.initial_distance_m,
        retired_at=payload.retired_at,
        notes=payload.notes,
    )
    db.add(shoe)
    db.commit()
    db.refresh(shoe)
    return _single_out(db, user, shoe)


@router.get("/{shoe_id}", response_model=ShoeOut)
def get_shoe(
    shoe_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ShoeOut:
    return _single_out(db, user, _get_owned(db, user, shoe_id))


@router.patch("/{shoe_id}", response_model=ShoeOut)
def patch_shoe(
    shoe_id: UUID,
    payload: ShoePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ShoeOut:
    shoe = _get_owned(db, user, shoe_id)
    for field in payload.model_fields_set:
        setattr(shoe, field, getattr(payload, field))
    db.commit()
    db.refresh(shoe)
    return _single_out(db, user, shoe)


@router.delete("/{shoe_id}", status_code=204)
def delete_shoe(
    shoe_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    shoe = _get_owned(db, user, shoe_id)
    db.execute(
        update(CardioActivity)
        .where(CardioActivity.shoe_id == shoe.id)
        .values(shoe_id=None)
    )
    db.delete(shoe)
    db.commit()
    return Response(status_code=204)
