from fastapi import APIRouter, HTTPException

from app.schemas.phase2 import (
    BodyMeasurementCreate,
    BodyMeasurementOut,
    ProgressPhotoCreate,
    ProgressPhotoOut,
    ShoeCreate,
    ShoeOut,
    TagCreate,
    TagOut,
)

NOT_IMPLEMENTED = {501: {"description": "Not implemented in MVP"}}

measurements_router = APIRouter(prefix="/api/measurements", tags=["measurements"])
photos_router = APIRouter(prefix="/api/photos", tags=["photos"])
tags_router = APIRouter(prefix="/api/tags", tags=["tags"])
shoes_router = APIRouter(prefix="/api/shoes", tags=["shoes"])


@measurements_router.get("", response_model=list[BodyMeasurementOut], responses=NOT_IMPLEMENTED)
def list_body_measurements() -> None:
    raise HTTPException(status_code=501, detail="Not implemented in MVP")


@measurements_router.post(
    "", response_model=BodyMeasurementOut, status_code=201, responses=NOT_IMPLEMENTED
)
def create_body_measurement(payload: BodyMeasurementCreate | None = None) -> None:
    raise HTTPException(status_code=501, detail="Not implemented in MVP")


@photos_router.get("", response_model=list[ProgressPhotoOut], responses=NOT_IMPLEMENTED)
def list_progress_photos() -> None:
    raise HTTPException(status_code=501, detail="Not implemented in MVP")


@photos_router.post(
    "", response_model=ProgressPhotoOut, status_code=201, responses=NOT_IMPLEMENTED
)
def create_progress_photo(payload: ProgressPhotoCreate | None = None) -> None:
    raise HTTPException(status_code=501, detail="Not implemented in MVP")


@tags_router.get("", response_model=list[TagOut], responses=NOT_IMPLEMENTED)
def list_tags() -> None:
    raise HTTPException(status_code=501, detail="Not implemented in MVP")


@tags_router.post("", response_model=TagOut, status_code=201, responses=NOT_IMPLEMENTED)
def create_tag(payload: TagCreate | None = None) -> None:
    raise HTTPException(status_code=501, detail="Not implemented in MVP")


@shoes_router.get("", response_model=list[ShoeOut], responses=NOT_IMPLEMENTED)
def list_shoes() -> None:
    raise HTTPException(status_code=501, detail="Not implemented in MVP")


@shoes_router.post("", response_model=ShoeOut, status_code=201, responses=NOT_IMPLEMENTED)
def create_shoe(payload: ShoeCreate | None = None) -> None:
    raise HTTPException(status_code=501, detail="Not implemented in MVP")
