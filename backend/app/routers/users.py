from typing import Literal

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DB, AdminUser, Page
from app.errors import AppError, not_found
from app.models import User
from app.pagination import paginate
from app.routers.auth import email_taken
from app.schemas import PageOut, StaffCreateIn, UserOut, UserUpdateIn
from app.security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=PageOut[UserOut])
def list_users(
    _: AdminUser, db: DB, page: Page, role: Literal["admin", "staff", "customer"] | None = None
) -> dict:
    stmt = select(User).order_by(User.id)
    if role:
        stmt = stmt.where(User.role == role)
    return paginate(db, stmt, page, UserOut)


@router.post("/staff", response_model=UserOut, status_code=201)
def create_staff(body: StaffCreateIn, _: AdminUser, db: DB) -> User:
    """Only an admin can add a member of staff."""
    if email_taken(db, body.email):
        raise AppError(409, "DUPLICATE", "An account with this email already exists")
    user = User(
        email=body.email.lower(),
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        role="staff",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdateIn, admin: AdminUser, db: DB) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise not_found("User")
    if user.id == admin.id and body.is_active is False:
        raise AppError(409, "INVALID_STATE", "You cannot deactivate your own account")
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.is_active is not None and body.is_active != user.is_active:
        user.is_active = body.is_active
        user.token_version += 1  # revoke existing sessions
    db.commit()
    db.refresh(user)
    return user
