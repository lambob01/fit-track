import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User

logger = logging.getLogger(__name__)


def ensure_default_user(db: Session) -> User | None:
    if db.scalar(select(User).limit(1)) is not None:
        return None
    if not settings.app_username or not settings.app_password_hash:
        logger.warning(
            "No user exists and APP_USERNAME/APP_PASSWORD_HASH are unset; login impossible"
        )
        return None
    user = User(
        username=settings.app_username,
        password_hash=settings.app_password_hash,
        unit_system="metric",
        timezone="UTC",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Created default user %s from environment", user.username)
    return user
