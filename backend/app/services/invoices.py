"""Invoice confirmation (gapless numbering), cancellation with optional reissue, and sending."""

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import AppError, invalid_state, not_found
from app.models import Invoice, NumberSequence, PaymentAttempt, User
from app.services import audit, email
from app.services.billing import create_invoice_for_period, release_discount
from app.services.periods import period_index_containing

INFLIGHT = ("created", "processing")


def lock_invoice(db: Session, invoice_id: int) -> Invoice:
    inv = db.scalar(
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .with_for_update(of=Invoice)
        .execution_options(populate_existing=True)
    )
    if inv is None:
        raise not_found("Invoice")
    return inv


def next_invoice_number(db: Session, year: int) -> str:
    """Gapless per-year numbering: the counter row is locked until the transaction commits."""
    name = f"invoice:{year}"
    db.execute(
        insert(NumberSequence)
        .values(name=name, next_value=1)
        .on_conflict_do_nothing(index_elements=["name"])
    )
    counter = db.scalar(select(NumberSequence).where(NumberSequence.name == name).with_for_update())
    value = counter.next_value
    counter.next_value = value + 1
    return f"INV/{year}/{value:06d}"


def confirm(db: Session, inv: Invoice, actor: User | None) -> Invoice:
    if inv.status != "draft":
        raise invalid_state("Only draft invoices can be confirmed")
    inv.number = next_invoice_number(db, inv.invoice_date.year)
    inv.status = "confirmed"
    inv.confirmed_at = datetime.now(UTC)
    if inv.amount_total == 0:
        # Nothing to collect (e.g. 100% discount): settled without any payment record.
        inv.status = "paid"
        inv.paid_at = inv.confirmed_at
    audit.record(
        db,
        action="invoice.confirmed",
        entity_type="invoice",
        entity_id=inv.id,
        actor=actor,
        data={"number": inv.number, "amount_total": str(inv.amount_total)},
    )
    return inv


def _has_inflight_collection(db: Session, invoice_id: int) -> bool:
    return (
        db.scalar(
            select(PaymentAttempt.id).where(
                PaymentAttempt.invoice_id == invoice_id, PaymentAttempt.status.in_(INFLIGHT)
            )
        )
        is not None
    )


def cancel(
    db: Session, inv: Invoice, actor: User, reason: str, reissue: bool, today: date
) -> tuple[Invoice, Invoice | None]:
    if inv.status not in ("draft", "confirmed"):
        raise invalid_state(f"A {inv.status} invoice cannot be cancelled")
    if inv.amount_paid > 0:
        raise invalid_state("Void the recorded payments before cancelling this invoice")
    if _has_inflight_collection(db, inv.id):
        raise invalid_state("A payment collection is in progress for this invoice")
    inv.status = "cancelled"
    inv.cancelled_at = datetime.now(UTC)
    inv.cancel_reason = reason
    if inv.discount_id is not None:
        release_discount(db, inv.discount_id)
    db.flush()  # frees the (subscription, period) slot for a replacement
    audit.record(
        db,
        action="invoice.cancelled",
        entity_type="invoice",
        entity_id=inv.id,
        actor=actor,
        data={"reason": reason, "reissue": reissue},
    )
    replacement = None
    if reissue:
        sub = inv.subscription
        k = period_index_containing(sub.start_date, sub.plan.billing_period, inv.period_start)
        replacement = create_invoice_for_period(db, sub, k, today, replaces_invoice_id=inv.id)
        if replacement is None:
            raise AppError(409, "DUPLICATE", "A live invoice already exists for this period")
    return inv, replacement


def send(db: Session, inv: Invoice, actor: User) -> Invoice:
    if inv.status not in ("confirmed", "paid"):
        raise invalid_state("Only confirmed or paid invoices can be sent")
    inv.sent_count += 1
    inv.sent_at = datetime.now(UTC)
    settings = get_settings()
    email.enqueue(
        db,
        key=f"invoice:{inv.id}:send:{inv.sent_count}",
        to=inv.bill_to_email,
        subject=f"{settings.company_name} invoice {inv.number}",
        template="invoice",
        context={
            "number": inv.number,
            "currency": inv.currency,
            "amount_total": str(inv.amount_total),
            "due_date": inv.due_date.isoformat(),
            "url": f"{settings.app_base_url}/portal/invoices/{inv.id}",
        },
    )
    audit.record(
        db,
        action="invoice.sent",
        entity_type="invoice",
        entity_id=inv.id,
        actor=actor,
        data={"to": inv.bill_to_email, "sent_count": inv.sent_count},
    )
    return inv


def payment_state(inv: Invoice) -> str:
    if inv.status == "paid":
        return "paid"
    return "partially_paid" if inv.amount_paid > 0 else "unpaid"


def days_overdue(inv: Invoice, today: date) -> int:
    if inv.status != "confirmed" or inv.amount_due <= 0 or today <= inv.due_date:
        return 0
    return (today - inv.due_date).days


def collection_status(db: Session, inv: Invoice) -> str:
    latest = db.scalar(
        select(PaymentAttempt.status)
        .where(PaymentAttempt.invoice_id == inv.id)
        .order_by(PaymentAttempt.id.desc())
        .limit(1)
    )
    return {
        None: "none",
        "created": "pending",
        "processing": "pending",
        "failed": "failed",
        "succeeded": "succeeded",
        "cancelled": "none",
    }[latest]


def available_actions(inv: Invoice, role: str) -> list[str]:
    actions = ["print"] if inv.status != "draft" or role != "customer" else []
    if role == "customer":
        return actions
    if inv.status == "draft":
        actions += ["confirm", "cancel"]
    if inv.status == "confirmed":
        if inv.amount_paid == 0:
            actions.append("cancel")
        actions += ["send", "record_payment"]
    if inv.status == "paid":
        actions.append("send")
    return actions
