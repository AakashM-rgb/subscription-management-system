"""Build API responses (incl. computed fields and available_actions) for staff and portal."""

from datetime import date

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.deps import PageParams
from app.errors import bad_request
from app.models import AuditEvent, Invoice, PaymentAttempt, Subscription, User
from app.schemas import TaxRef
from app.schemas.invoices import InvoiceLineOut, InvoiceListItem, InvoiceOut, InvoicePaymentOut
from app.schemas.subscriptions import (
    CustomerRef,
    DiscountRef,
    EventOut,
    InvoiceRef,
    PaymentTermRef,
    PlanRef,
    SubscriptionLineOut,
    SubscriptionListItem,
    SubscriptionOut,
)
from app.services import invoices as invoice_svc
from app.services import subscriptions as sub_svc


def apply_sort(stmt: Select, sort: str | None, allowed: dict, default) -> Select:
    if not sort:
        return stmt.order_by(default)
    descending = sort.startswith("-")
    column = allowed.get(sort.lstrip("-"))
    if column is None:
        raise bad_request(f"sort must be one of: {', '.join(sorted(allowed))} (prefix - for desc)")
    return stmt.order_by(column.desc() if descending else column.asc(), default)


def fetch_page(db: Session, stmt: Select, page: PageParams) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = list(db.scalars(stmt.limit(page.page_size).offset(page.offset)).unique())
    return rows, total


def page_out(items: list, total: int, page: PageParams) -> dict:
    return {"items": items, "total": total, "page": page.page, "page_size": page.page_size}


# ----------------------------------------------------------------------------- subscriptions


def subscription_list_item(sub: Subscription, today: date) -> SubscriptionListItem:
    return SubscriptionListItem(
        id=sub.id,
        number=sub.number,
        status=sub.status,
        customer=CustomerRef.model_validate(sub.customer),
        plan=PlanRef.model_validate(sub.plan),
        start_date=sub.start_date,
        end_date=sub.end_date,
        next_invoice_date=sub.next_invoice_date,
        is_paused=sub.paused_at is not None,
        is_expired=sub_svc.is_expired(sub, today),
        amount_total=sub.amount_total,
        created_at=sub.created_at,
    )


def subscription_out(db: Session, sub: Subscription, role: str, today: date) -> SubscriptionOut:
    last = db.scalar(
        select(Invoice)
        .where(Invoice.subscription_id == sub.id)
        .order_by(Invoice.period_start.desc(), Invoice.id.desc())
        .limit(1)
    )
    base = subscription_list_item(sub, today).model_dump()
    return SubscriptionOut(
        **base,
        payment_term=PaymentTermRef.model_validate(sub.payment_term),
        discount=DiscountRef.model_validate(sub.discount) if sub.discount else None,
        term_periods=sub.term_periods,
        quotation_valid_until=sub.quotation_valid_until,
        paused_at=sub.paused_at,
        confirmed_at=sub.confirmed_at,
        activated_at=sub.activated_at,
        closed_at=sub.closed_at,
        close_reason=sub.close_reason,
        template_id=sub.template_id,
        amount_untaxed=sub.amount_untaxed,
        amount_discount=sub.amount_discount,
        amount_tax=sub.amount_tax,
        notes=sub.notes if role != "customer" else None,
        auto_collect=sub.auto_collect,
        lines=[
            SubscriptionLineOut(
                id=line.id,
                line_type=line.line_type,
                product_id=line.product_id,
                variant_id=line.variant_id,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                tax=TaxRef.model_validate(line.tax) if line.tax else None,
                subtotal=line.subtotal,
                discount_amount=line.discount_amount,
                tax_amount=line.tax_amount,
                total=line.total,
            )
            for line in sub.lines
        ],
        last_invoice=InvoiceRef.model_validate(last) if last else None,
        available_actions=sub_svc.available_actions(sub, role, today),
    )


def events_out(db: Session, entity_type: str, entity_id: int, page: PageParams) -> dict:
    stmt = (
        select(AuditEvent, User.full_name)
        .outerjoin(User, AuditEvent.actor_user_id == User.id)
        .where(AuditEvent.entity_type == entity_type, AuditEvent.entity_id == entity_id)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
    )
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.execute(stmt.limit(page.page_size).offset(page.offset)).all()
    items = [
        EventOut(
            id=event.id,
            action=event.action,
            actor_type=event.actor_type,
            actor_name=name,
            data=event.data,
            created_at=event.created_at,
        )
        for event, name in rows
    ]
    return page_out(items, total, page)


# ----------------------------------------------------------------------------- invoices


def collection_statuses(db: Session, invoice_ids: list[int]) -> dict[int, str]:
    if not invoice_ids:
        return {}
    rows = db.execute(
        select(PaymentAttempt.invoice_id, PaymentAttempt.status)
        .where(PaymentAttempt.invoice_id.in_(invoice_ids))
        .distinct(PaymentAttempt.invoice_id)
        .order_by(PaymentAttempt.invoice_id, PaymentAttempt.id.desc())
    ).all()
    mapping = {
        "created": "pending",
        "processing": "pending",
        "failed": "failed",
        "succeeded": "succeeded",
        "cancelled": "none",
    }
    return {invoice_id: mapping[status] for invoice_id, status in rows}


def invoice_list_item(inv: Invoice, today: date, collection: str = "none") -> InvoiceListItem:
    overdue_days = invoice_svc.days_overdue(inv, today)
    return InvoiceListItem(
        id=inv.id,
        number=inv.number,
        status=inv.status,
        payment_state=invoice_svc.payment_state(inv),
        is_overdue=overdue_days > 0,
        days_overdue=overdue_days,
        collection_status=collection,
        subscription={"id": inv.subscription.id, "number": inv.subscription.number},
        customer_id=inv.customer_id,
        bill_to_name=inv.bill_to_name,
        period_start=inv.period_start,
        period_end=inv.period_end,
        invoice_date=inv.invoice_date,
        due_date=inv.due_date,
        currency=inv.currency,
        amount_total=inv.amount_total,
        amount_paid=inv.amount_paid,
        amount_due=inv.amount_due,
    )


def invoice_list(db: Session, invoices: list[Invoice], today: date) -> list[InvoiceListItem]:
    statuses = collection_statuses(db, [inv.id for inv in invoices])
    return [invoice_list_item(inv, today, statuses.get(inv.id, "none")) for inv in invoices]


def invoice_out(db: Session, inv: Invoice, role: str, today: date) -> InvoiceOut:
    base = invoice_list_item(inv, today, invoice_svc.collection_status(db, inv)).model_dump()
    return InvoiceOut(
        **base,
        bill_to_email=inv.bill_to_email,
        bill_to_address=inv.bill_to_address,
        payment_term_name=inv.payment_term_name,
        discount_name=inv.discount_name,
        amount_untaxed=inv.amount_untaxed,
        amount_discount=inv.amount_discount,
        amount_tax=inv.amount_tax,
        confirmed_at=inv.confirmed_at,
        paid_at=inv.paid_at,
        cancelled_at=inv.cancelled_at,
        cancel_reason=inv.cancel_reason,
        replaces_invoice_id=inv.replaces_invoice_id,
        sent_at=inv.sent_at,
        sent_count=inv.sent_count,
        lines=[InvoiceLineOut.model_validate(line) for line in inv.lines],
        payments=[InvoicePaymentOut.model_validate(p) for p in inv.payments],
        available_actions=invoice_svc.available_actions(inv, role),
    )
