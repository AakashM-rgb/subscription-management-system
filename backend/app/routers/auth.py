from fastapi import APIRouter, Response
from sqlalchemy import func, select

from app.config import get_settings
from app.deps import DB, CurrentUser
from app.errors import AppError
from app.models import Customer, User
from app.schemas import LoginIn, MeOut, SignupIn
from app.security import create_session_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

# Verifying against a real hash for unknown emails keeps response timing uniform.
_DUMMY_HASH = hash_password("Dummy-password-1")


def email_taken(db: DB, email: str) -> bool:
    return db.scalar(select(User.id).where(func.lower(User.email) == email.lower())) is not None


def me_payload(user: User) -> MeOut:
    out = MeOut.model_validate(user)
    out.customer_id = user.customer.id if user.customer else None
    return out


def _set_session_cookie(response: Response, user: User) -> None:
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
    _set_session_cookie(response, user)
    return me_payload(user)


@router.post("/login", response_model=MeOut)
def login(body: LoginIn, response: Response, db: DB) -> MeOut:
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    valid = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not valid or not user.is_active:
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")
    _set_session_cookie(response, user)
    return me_payload(user)


@router.post("/logout", status_code=204)
def logout(response: Response) -> Response:
    response.delete_cookie(get_settings().cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser) -> MeOut:
    return me_payload(user)
