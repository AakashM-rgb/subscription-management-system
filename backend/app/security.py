import re
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import get_settings

_hasher = PasswordHash.recommended()  # argon2id

# Official rule: more than eight characters, an uppercase letter, a lowercase letter and a
# special character. Max length guards the hasher against oversized input.
PASSWORD_RULES = (
    (lambda p: len(p) > 8, "must be more than 8 characters"),
    (lambda p: len(p) <= 128, "must be at most 128 characters"),
    (lambda p: re.search(r"[A-Z]", p) is not None, "must contain an uppercase letter"),
    (lambda p: re.search(r"[a-z]", p) is not None, "must contain a lowercase letter"),
    (lambda p: re.search(r"[^A-Za-z0-9]", p) is not None, "must contain a special character"),
)


def password_problems(password: str) -> list[str]:
    return [message for rule, message in PASSWORD_RULES if not rule(password)]


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _hasher.verify(password, password_hash)


def create_session_token(user_id: int, role: str, token_version: int) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "tv": token_version,
        "iat": now,
        "exp": now + timedelta(hours=settings.session_ttl_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_session_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
