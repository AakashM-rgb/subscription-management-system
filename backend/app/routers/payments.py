from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Header
from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.deps import DB, AdminUser, Page, PageParams, StaffUser
from app.errors import AppError, not_found
from app.models import Payment
from app.schemas import PageOut
from app.schemas.payments import PaymentCreateIn, PaymentMethod, PaymentOut, PaymentVoidIn
from app.services import ledger

router = APIRouter(prefix="/payments", tags=["payments"])


def to_out(payment: Payment) -> PaymentOut:
    out = PaymentOut.model_validate(payment)
    out.invoice_number = payment.invoice.number if payment.invoice else None
    return out


def payment_page(db: Session, stmt: Select, page: PageParams) -> dict:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(
        stmt.options(selectinload(Payment.invoice)).limit(page.page_size).offset(page.offset)
    ).all()
    return {
        "items": [to_out(p) for p in rows],
        "total": total,
        "page": page.page,
        "page_size": page.page_size,
    }


def load_payment(db: Session, payment_id: int) -> Payment:
    payment = db.scalar(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(selectinload(Payment.invoice))
        .execution_options(populate_existing=True)
    )
    if payment is None:
        raise not_found("Payment")
    return payment


@router.get("", response_model=PageOut[PaymentOut])
def list_payments(
    _: StaffUser,
    db: DB,
    page: Page,
    invoice_id: int | None = None,
    customer_id: int | None = None,
    method: PaymentMethod | None = None,
    status: Literal["posted", "voided"] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    stmt = select(Payment).order_by(Payment.payment_date.desc(), Payment.id.desc())
    if invoice_id is not None:
        stmt = stmt.where(Payment.invoice_id == invoice_id)
    if customer_id is not None:
        stmt = stmt.where(Payment.customer_id == customer_id)
    if method:
        stmt = stmt.where(Payment.method == method)
    if status:
        stmt = stmt.where(Payment.status == status)
    if date_from:
        stmt = stmt.where(Payment.payment_date >= date_from)
    if date_to:
        stmt = stmt.where(Payment.payment_date <= date_to)
    return payment_page(db, stmt, page)


@router.post("", response_model=PaymentOut, status_code=201)
def create_payment(
    body: PaymentCreateIn,
    user: StaffUser,
    db: DB,
    idempotency_key: Annotated[UUID, Header(alias="Idempotency-Key")],
) -> PaymentOut:
    """Record a payment received outside the system (cash, bank transfer, card, UPI, ...).
    Retrying with the same Idempotency-Key returns the original payment."""
    try:
        payment = ledger.record_payment(
            db,
            invoice_id=body.invoice_id,
            method=body.method,
            amount=body.amount,
            payment_date=body.payment_date,
            note=body.note,
            actor=user,
            idempotency_key=str(idempotency_key),
        )
        db.commit()
    except IntegrityError as exc:
        # Same key used concurrently for a *different* invoice: the unique index wins.
        db.rollback()
        raise AppError(
            409, "DUPLICATE", "This Idempotency-Key was already used for another payment"
        ) from exc
    return to_out(load_payment(db, payment.id))


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: int, _: StaffUser, db: DB) -> PaymentOut:
    return to_out(load_payment(db, payment_id))


@router.post("/{payment_id}/void", response_model=PaymentOut)
def void_payment(payment_id: int, body: PaymentVoidIn, admin: AdminUser, db: DB) -> PaymentOut:
    """Only an admin can void; the payment stays on record as voided."""
    ledger.void_payment(db, payment_id=payment_id, reason=body.reason, actor=admin)
    db.commit()
    db.expire_all()
    return to_out(load_payment(db, payment_id))
