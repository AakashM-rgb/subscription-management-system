"""Single-use, expiring password-reset and invitation tokens (only SHA-256 hashes stored)."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import AuthToken, User

TTL = {"reset": timedelta(minutes=30), "invite": timedelta(hours=72)}


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def issue(db: Session, user: User, purpose: str) -> tuple[AuthToken, str]:
    """Create a token, invalidating any earlier unused token of the same purpose."""
    now = datetime.now(UTC)
    db.execute(
        update(AuthToken)
        .where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == purpose,
            AuthToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    raw = secrets.token_urlsafe(32)
    token = AuthToken(
        user_id=user.id, purpose=purpose, token_hash=_hash(raw), expires_at=now + TTL[purpose]
    )
    db.add(token)
    db.flush()
    return token, raw


def consume(db: Session, raw: str, purpose: str) -> User:
    token = db.scalar(
        select(AuthToken)
        .where(AuthToken.token_hash == _hash(raw), AuthToken.purpose == purpose)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    now = datetime.now(UTC)
    if token is None or token.used_at is not None or token.expires_at <= now:
        raise AppError(400, "INVALID_TOKEN", "This link is invalid or has expired")
    token.used_at = now
    return db.get(User, token.user_id)
