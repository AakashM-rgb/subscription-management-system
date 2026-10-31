import secrets

from fastapi import APIRouter
from sqlalchemy import func, select

from app.config import get_settings
from app.deps import DB, StaffUser
from app.errors import AppError, not_found
from app.models import Customer, User
from app.security import hash_password
from app.services import audit, email, tokens

router = APIRouter(tags=["invites"])


@router.post("/customers/{customer_id}/portal-invite", status_code=202)
def invite_customer(customer_id: int, actor: StaffUser, db: DB) -> dict:
    """Email a set-password link so a staff-created customer can use the portal.

    The link proves ownership of the mailbox, so an existing customer record is never linked to
    a self-signup just because the email matches (that would allow account takeover).
    """
    customer = db.get(Customer, customer_id)
    if customer is None or not customer.is_active:
        raise not_found("Customer")
    user = customer.user
    if user is None:
        existing = db.scalar(select(User).where(func.lower(User.email) == customer.email.lower()))
        if existing is not None:
            raise AppError(409, "DUPLICATE", "Another account already uses this email")
        user = User(
            email=customer.email.lower(),
            full_name=customer.name,
            # Unusable until the invitation is accepted.
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role="customer",
        )
        db.add(user)
        db.flush()
        customer.user_id = user.id
    elif user.role != "customer":
        raise AppError(409, "INVALID_STATE", "This customer is linked to a non-customer account")
    token, raw = tokens.issue(db, user, "invite")
    settings = get_settings()
    email.enqueue(
        db,
        key=f"invite:{token.id}",
        to=user.email,
        subject=f"Your {settings.company_name} customer portal",
        template="invite",
        context={"url": f"{settings.app_base_url}/accept-invite?token={raw}"},
    )
    audit.record(
        db,
        action="customer.portal_invited",
        entity_type="customer",
        entity_id=customer.id,
        actor=actor,
        data={"user_id": user.id},
    )
    db.commit()
    return {"status": "accepted"}
