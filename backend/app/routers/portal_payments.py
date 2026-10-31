from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DB, CurrentCustomer, Page
from app.errors import not_found
from app.models import Payment, PaymentMandate
from app.providers import default_provider_name
from app.routers.payments import payment_page
from app.schemas import PageOut
from app.schemas.payments import (
    MandateConfirmIn,
    MandateStartIn,
    MandateStartOut,
    PortalMandateOut,
    PortalPaymentOut,
)
from app.services import collections

payments_router = APIRouter(prefix="/portal/payments", tags=["portal"])


@payments_router.get("", response_model=PageOut[PortalPaymentOut])
def my_payments(customer: CurrentCustomer, db: DB, page: Page) -> dict:
    """The signed-in customer's own payments; the customer comes from the session only."""
    stmt = (
        select(Payment)
        .where(Payment.customer_id == customer.id)
        .order_by(Payment.payment_date.desc(), Payment.id.desc())
    )
    return payment_page(db, stmt, page)


methods_router = APIRouter(prefix="/portal/payment-methods", tags=["portal"])


def own_mandate(db, customer, mandate_id: int) -> PaymentMandate:
    mandate = db.get(PaymentMandate, mandate_id)
    if mandate is None or mandate.customer_id != customer.id:
        raise not_found("Payment method")  # another customer's record looks like a missing one
    return mandate


@methods_router.get("", response_model=list[PortalMandateOut])
def my_payment_methods(customer: CurrentCustomer, db: DB) -> list[PaymentMandate]:
    return list(
        db.scalars(
            select(PaymentMandate)
            .where(
                PaymentMandate.customer_id == customer.id,
                PaymentMandate.status.in_(("pending", "active", "paused")),
            )
            .order_by(PaymentMandate.id.desc())
        )
    )


@methods_router.post("", response_model=MandateStartOut, status_code=201)
def add_payment_method(body: MandateStartIn, customer: CurrentCustomer, db: DB) -> dict:
    """Start autopay: returns the checkout payload for the provider's widget. The method only
    becomes active after the customer authorises it with their bank or card issuer."""
    mandate, checkout = collections.start_mandate(
        db,
        customer=customer,
        method_type=body.method_type,
        max_amount=body.max_amount,
        provider=default_provider_name(),
        actor=customer.user,
    )
    db.commit()
    return {"mandate": PortalMandateOut.model_validate(mandate), "checkout": checkout}


@methods_router.post("/{mandate_id}/confirm", response_model=PortalMandateOut)
def confirm_payment_method(
    mandate_id: int, body: MandateConfirmIn, customer: CurrentCustomer, db: DB
) -> PaymentMandate:
    mandate = own_mandate(db, customer, mandate_id)
    collections.complete_mandate(
        db, mandate=mandate, client_payload=body.provider_response, actor=customer.user
    )
    db.commit()
    db.refresh(mandate)
    return mandate


@methods_router.delete("/{mandate_id}", response_model=PortalMandateOut)
def remove_payment_method(mandate_id: int, customer: CurrentCustomer, db: DB) -> PaymentMandate:
    """Cancel autopay with the provider; invoices are then paid manually."""
    mandate = own_mandate(db, customer, mandate_id)
    collections.cancel_mandate(db, mandate=mandate, actor=customer.user)
    db.commit()
    db.refresh(mandate)
    return mandate


# Auto-discovery mounts one `router` per module.
router = APIRouter()
router.include_router(payments_router)
router.include_router(methods_router)
