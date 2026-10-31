from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select

from app.config import get_settings
from app.deps import DB, CurrentUser
from app.errors import AppError
from app.models import AuthToken, Customer, LoginAttempt, User
from app.schemas import (
    ChangePasswordIn,
    ForgotPasswordIn,
    LoginIn,
    MeOut,
    ResetPasswordIn,
    SignupIn,
)
from app.security import create_session_token, hash_password, verify_password
from app.services import audit, email, tokens

router = APIRouter(prefix="/auth", tags=["auth"])

# Verifying against a real hash for unknown emails keeps response timing uniform.
_DUMMY_HASH = hash_password("Dummy-password-1")
LOGIN_WINDOW = timedelta(minutes=15)
MAX_FAILED_LOGINS = 5
MAX_RESET_EMAILS_PER_HOUR = 3


def email_taken(db: DB, email_address: str) -> bool:
    return (
        db.scalar(select(User.id).where(func.lower(User.email) == email_address.lower()))
        is not None
    )


def me_payload(user: User) -> MeOut:
    out = MeOut.model_validate(user)
    out.customer_id = user.customer.id if user.customer else None
    return out


def set_session_cookie(response: Response, user: User) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.cookie_name,
        create_session_token(user.id, user.role, user.token_version),
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/signup", response_model=MeOut, status_code=201)
def signup(body: SignupIn, response: Response, db: DB) -> MeOut:
    """Self-registration always creates a customer account with its own customer record."""
    if email_taken(db, body.email):
        raise AppError(409, "DUPLICATE", "An account with this email already exists")
    user = User(
        email=body.email.lower(),
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        role="customer",
    )
    user.customer = Customer(name=body.full_name, email=body.email.lower())
    db.add(user)
    db.commit()
    db.refresh(user)
    set_session_cookie(response, user)
    return me_payload(user)


@router.post("/login", response_model=MeOut)
def login(body: LoginIn, request: Request, response: Response, db: DB) -> MeOut:
    email_lower = body.email.lower()
    since = datetime.now(UTC) - LOGIN_WINDOW
    failures = db.scalar(
        select(func.count())
        .select_from(LoginAttempt)
        .where(
            LoginAttempt.email == email_lower,
            LoginAttempt.succeeded.is_(False),
            LoginAttempt.created_at >= since,
        )
    )
    if failures >= MAX_FAILED_LOGINS:
        raise AppError(429, "RATE_LIMITED", "Too many failed sign-in attempts; try again later")

    user = db.scalar(select(User).where(func.lower(User.email) == email_lower))
    valid = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    ok = bool(user and valid and user.is_active)
    db.add(LoginAttempt(email=email_lower, ip_address=_client_ip(request), succeeded=ok))
    db.commit()
    if not ok:
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")
    set_session_cookie(response, user)
    return me_payload(user)


@router.post("/logout", status_code=204)
def logout(response: Response) -> Response:
    response.delete_cookie(get_settings().cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser) -> MeOut:
    return me_payload(user)


@router.post("/password/forgot", status_code=202)
def forgot_password(body: ForgotPasswordIn, db: DB) -> dict:
    """Always 202 so the response never reveals whether an account exists."""
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if user is None or not user.is_active:
        return {"status": "accepted"}
    recent = db.scalar(
        select(func.count())
        .select_from(AuthToken)
        .where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == "reset",
            AuthToken.created_at >= datetime.now(UTC) - timedelta(hours=1),
        )
    )
    if recent >= MAX_RESET_EMAILS_PER_HOUR:
        return {"status": "accepted"}  # throttled silently; the last link stays valid
    token, raw = tokens.issue(db, user, "reset")
    settings = get_settings()
    email.enqueue(
        db,
        key=f"password_reset:{token.id}",
        to=user.email,
        subject=f"Reset your {settings.company_name} password",
        template="password_reset",
        context={"url": f"{settings.app_base_url}/reset-password?token={raw}"},
    )
    db.commit()
    return {"status": "accepted"}


def _set_password(db: DB, user: User, password: str, action: str) -> None:
    user.password_hash = hash_password(password)
    user.token_version += 1  # sign out every existing session
    audit.record(db, action=action, entity_type="user", entity_id=user.id, actor=user)


@router.post("/password/reset", status_code=204)
def reset_password(body: ResetPasswordIn, db: DB) -> Response:
    user = tokens.consume(db, body.token, "reset")
    _set_password(db, user, body.password, "user.password_reset")
    db.commit()
    return Response(status_code=204)


@router.post("/invite/accept", response_model=MeOut)
def accept_invite(body: ResetPasswordIn, response: Response, db: DB) -> MeOut:
    user = tokens.consume(db, body.token, "invite")
    user.is_active = True
    _set_password(db, user, body.password, "user.invite_accepted")
    db.commit()
    db.refresh(user)
    set_session_cookie(response, user)
    return me_payload(user)


@router.post("/password/change", status_code=204)
def change_password(body: ChangePasswordIn, user: CurrentUser, db: DB) -> Response:
    if not verify_password(body.current_password, user.password_hash):
        raise AppError(401, "INVALID_CREDENTIALS", "Current password is incorrect")
    _set_password(db, user, body.new_password, "user.password_changed")
    db.commit()
    response = Response(status_code=204)
    set_session_cookie(response, user)  # keep this session, revoke the others
    return response
