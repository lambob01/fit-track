from fastapi import Depends, FastAPI, Response
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.database import get_db
from app.routers import auth, cardio, exercises, templates, weight, workouts
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
app.include_router(exercises.router)
app.include_router(settings_router.router)
app.include_router(weight.router)
app.include_router(workouts.router)
app.include_router(templates.router)
# Later phases: routers with dependencies=[Depends(get_current_user)] or per-route Depends
