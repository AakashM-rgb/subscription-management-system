from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import AppError
from app.models import Customer, User
from app.security import decode_session_token

DB = Annotated[Session, Depends(get_db)]


def get_current_user(request: Request, db: DB) -> User:
    token = request.cookies.get(get_settings().cookie_name)
    claims = decode_session_token(token) if token else None
    if not claims:
        raise AppError(401, "UNAUTHENTICATED", "Not signed in")
    user = db.get(User, int(claims["sub"]))
    # token_version lets us revoke every session of a user (deactivation, password change).
    if user is None or not user.is_active or user.token_version != claims.get("tv"):
        raise AppError(401, "UNAUTHENTICATED", "Session expired")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: str) -> Callable[[User], User]:
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise AppError(403, "FORBIDDEN", "You do not have access to this resource")
        return user

    return checker


AdminUser = Annotated[User, Depends(require_roles("admin"))]
StaffUser = Annotated[User, Depends(require_roles("admin", "staff"))]
CustomerUser = Annotated[User, Depends(require_roles("customer"))]


def get_current_customer(user: CustomerUser, db: DB) -> Customer:
    """Portal scope: the customer record always comes from the session, never from the URL."""
    customer = db.scalar(select(Customer).where(Customer.user_id == user.id))
    if customer is None:
        raise AppError(403, "FORBIDDEN", "No customer profile linked to this account")
    return customer


CurrentCustomer = Annotated[Customer, Depends(get_current_customer)]


class PageParams:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    ):
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


Page = Annotated[PageParams, Depends()]
