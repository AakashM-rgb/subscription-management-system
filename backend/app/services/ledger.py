"""The ledger: the only code that changes invoices.amount_paid, paid_at and confirmed <-> paid.

Every operation locks the invoice row FOR UPDATE first, so payments, idempotent replays and
voids for one invoice are serialised: two concurrent payments can never together exceed the
amount due. Functions never commit; the caller owns the transaction (an API request, or a
provider webhook being processed by the event inbox).
"""

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import AppError, not_found
from app.models import PAYMENT_METHODS, Invoice, Payment, PaymentAttempt, User
from app.money import ZERO, money
from app.services import audit
from app.services.common import business_today


def _lock_invoice(db: Session, invoice_id: int) -> Invoice:
    invoice = db.scalar(
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if invoice is None:
        raise not_found("Invoice")
    return invoice


def _collection_in_flight(db: Session, invoice_id: int) -> bool:
    return (
        db.scalar(
            select(PaymentAttempt.id).where(
                PaymentAttempt.invoice_id == invoice_id,
                PaymentAttempt.status.in_(("created", "processing")),
            )
        )
        is not None
    )


def _next_payment_number(db: Session) -> str:
    value = db.scalar(select(func.nextval("payment_number_seq")))
    return f"PAY-{value:06d}"


def _replay(
    db: Session,
    *,
    invoice_id: int,
    amount: Decimal,
    method: str,
    idempotency_key: str | None,
    provider: str | None,
    provider_payment_id: str | None,
) -> Payment | None:
    """Return the payment an earlier identical request created, or None.

    Runs after the invoice lock is held, so a concurrent request with the same key has either
    committed (and is found here) or not started its insert yet.
    """
    existing = None
    if idempotency_key is not None:
        existing = db.scalar(select(Payment).where(Payment.idempotency_key == idempotency_key))
    if existing is None and provider is not None and provider_payment_id is not None:
        existing = db.scalar(
            select(Payment).where(
                Payment.provider == provider, Payment.provider_payment_id == provider_payment_id
            )
        )
    if existing is None:
        return None
    if (existing.invoice_id, existing.amount, existing.method) != (invoice_id, amount, method):
        raise AppError(
            409,
            "DUPLICATE",
            "This idempotency key or provider payment was already used for a different payment",
            {"payment_id": existing.id},
        )
    return existing


def record_payment(
    db: Session,
    *,
    invoice_id: int,
    method: str,
    amount: Decimal,
    payment_date: date,
    note: str | None = None,
    actor: User | None = None,
    idempotency_key: str | None = None,
    provider: str | None = None,
    provider_payment_id: str | None = None,
    payment_attempt_id: int | None = None,
) -> Payment:
    """Post a payment against a confirmed invoice. Partial payments are allowed; paying more
    than the amount due is not. Repeating a request with the same idempotency key (or the same
    provider payment id) returns the original payment instead of posting a second one."""
    amount = Decimal(amount)
    if amount <= ZERO or money(amount) != amount:
        raise AppError(422, "VALIDATION_ERROR", "amount must be positive with at most 2 decimals")
    if method not in PAYMENT_METHODS:
        raise AppError(
            422, "VALIDATION_ERROR", f"method must be one of {', '.join(PAYMENT_METHODS)}"
        )
    if payment_date > business_today():
        raise AppError(422, "VALIDATION_ERROR", "payment_date cannot be in the future")

    invoice = _lock_invoice(db, invoice_id)
    replayed = _replay(
        db,
        invoice_id=invoice_id,
        amount=amount,
        method=method,
        idempotency_key=idempotency_key,
        provider=provider,
        provider_payment_id=provider_payment_id,
    )
    if replayed is not None:
        return replayed

    if invoice.status == "draft":
        raise AppError(409, "INVALID_STATE", "Confirm the invoice before recording a payment")
    if invoice.status == "cancelled":
        raise AppError(409, "INVALID_STATE", "Payments cannot be recorded on a cancelled invoice")
    if invoice.status == "paid":
        raise AppError(409, "INVALID_STATE", "This invoice is already fully paid")
    if payment_attempt_id is None and _collection_in_flight(db, invoice.id):
        # Otherwise a manual payment plus the pending provider charge could exceed the total.
        raise AppError(
            409,
            "INVALID_STATE",
            "An automatic collection for this invoice is in progress; wait for its result",
        )
    amount_due = invoice.amount_total - invoice.amount_paid
    if amount > amount_due:
        raise AppError(
            422,
            "AMOUNT_EXCEEDS_DUE",
            f"Payment of {amount} exceeds the amount due of {amount_due}",
            {"amount_due": str(amount_due)},
        )

    payment = Payment(
        number=_next_payment_number(db),
        invoice_id=invoice.id,
        customer_id=invoice.customer_id,
        method=method,
        amount=amount,
        payment_date=payment_date,
        note=note,
        status="posted",
        idempotency_key=idempotency_key,
        recorded_by=actor.id if actor else None,
        provider=provider,
        provider_payment_id=provider_payment_id,
        payment_attempt_id=payment_attempt_id,
    )
    db.add(payment)
    invoice.amount_paid = invoice.amount_paid + amount
    if invoice.amount_paid == invoice.amount_total:
        invoice.status = "paid"
        invoice.paid_at = datetime.now(UTC)
    db.flush()
    audit.record(
        db,
        action="payment.recorded",
        entity_type="invoice",
        entity_id=invoice.id,
        actor=actor,
        actor_type="provider" if provider and actor is None else None,
        data={
            "payment_id": payment.id,
            "payment_number": payment.number,
            "amount": str(amount),
            "method": method,
            "invoice_status": invoice.status,
            "amount_paid": str(invoice.amount_paid),
        },
    )
    return payment


def void_payment(db: Session, *, payment_id: int, reason: str, actor: User | None) -> Payment:
    """Reverse a posted payment (e.g. a bounced cheque). The payment row is kept as history;
    a paid invoice returns to confirmed and its balance is due again."""
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise AppError(422, "VALIDATION_ERROR", "A reason of at least 3 characters is required")
    found = db.get(Payment, payment_id)
    if found is None:
        raise not_found("Payment")
    # Lock order is always invoice, then payment (the same order record_payment uses).
    invoice = _lock_invoice(db, found.invoice_id)
    payment = db.scalar(
        select(Payment)
        .where(Payment.id == payment_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if payment.status == "voided":
        raise AppError(409, "INVALID_STATE", "This payment is already voided")

    payment.status = "voided"
    payment.voided_at = datetime.now(UTC)
    payment.voided_by = actor.id if actor else None
    payment.void_reason = reason
    invoice.amount_paid = invoice.amount_paid - payment.amount
    if invoice.status == "paid":
        invoice.status = "confirmed"
        invoice.paid_at = None
    db.flush()
    audit.record(
        db,
        action="payment.voided",
        entity_type="invoice",
        entity_id=invoice.id,
        actor=actor,
        data={
            "payment_id": payment.id,
            "payment_number": payment.number,
            "amount": str(payment.amount),
            "reason": reason,
            "invoice_status": invoice.status,
            "amount_paid": str(invoice.amount_paid),
        },
    )
    return payment
