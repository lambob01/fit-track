import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.services.import_export import (
    ENTITY_MODELS,
    ImportValidationError,
    export_csv,
    export_envelope,
    import_envelope,
    owned_rows,
)

router = APIRouter(prefix="/api", tags=["data"], dependencies=[Depends(get_current_user)])


@router.get("/export/json")
def export_json(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    return export_envelope(db, user)


@router.get("/export/{entity}.csv")
def export_entity_csv(
    entity: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    if entity not in ENTITY_MODELS:
        raise HTTPException(status_code=404, detail="Unknown entity")
    content = export_csv(entity, owned_rows(db, entity, user))
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{entity}.csv"'},
    )


@router.post("/import/json")
async def import_json(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    max_bytes = settings.import_max_bytes
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared = int(content_length)
        except ValueError:
            declared = None
        if declared is not None and declared > max_bytes:
            raise HTTPException(status_code=413, detail="Payload too large")

    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail="Payload too large")
        chunks.append(chunk)

    try:
        payload = json.loads(b"".join(chunks))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid JSON body") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Export payload must be an object")
    if payload.get("format") != "tracker-export" or payload.get("version") != 1:
        raise HTTPException(status_code=422, detail="Unsupported export format or version")

    try:
        created, updated = import_envelope(db, user, payload)
    except ImportValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"created": created, "updated": updated}
