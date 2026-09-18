from pathlib import Path

from fastapi import Depends, FastAPI, Response
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.routers import (
    auth,
    cardio,
    dashboard,
    data,
    exercises,
    phase2,
    templates,
    weight,
    workouts,
)
from app.routers import settings as settings_router

app = FastAPI(title="Fitness Tracker", version="0.1.0")
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    same_site="lax",
    https_only=settings.cookie_secure,
    max_age=settings.session_max_age_s,
)


@app.get("/api/health")
def health(db: Session = Depends(get_db)) -> Response:
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "error"})
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(cardio.router)
app.include_router(dashboard.router)
app.include_router(data.router)
app.include_router(exercises.router)
app.include_router(settings_router.router)
app.include_router(weight.router)
app.include_router(workouts.router)
app.include_router(templates.router)

app.include_router(phase2.measurements_router, dependencies=[Depends(get_current_user)])
app.include_router(phase2.photos_router, dependencies=[Depends(get_current_user)])
app.include_router(phase2.tags_router, dependencies=[Depends(get_current_user)])
app.include_router(phase2.shoes_router, dependencies=[Depends(get_current_user)])
# Later phases: routers with dependencies=[Depends(get_current_user)] or per-route Depends


_static_dir = Path(__file__).parent / "static"
_spa_index = _static_dir / "index.html"

if _spa_index.is_file():

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> Response:
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        base_dir = _static_dir.resolve()
        candidate = (base_dir / full_path).resolve()
        if not candidate.is_relative_to(base_dir):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_spa_index)
