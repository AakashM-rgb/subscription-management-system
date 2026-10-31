"""Financial reporting as SQL aggregates (one round trip per figure, indexed columns only).

Flows (revenue received, invoiced, new and closed subscriptions) respect the date range.
Balances (outstanding, overdue, active subscriptions) are always "as of today" in the business
timezone, because an amount owed is a state, not a flow. Voided payments never count as revenue,
and cancelled or draft invoices never count as invoiced or owed.
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Customer, Invoice, Payment, Subscription
from app.money import money
from app.services.common import business_today

BILLED_STATUSES = ("confirmed", "paid")


@dataclass(frozen=True)
class Filters:
    date_from: date | None = None
    date_to: date | None = None
    plan_id: int | None = None
    customer_id: int | None = None


def _local_date(column):
    """Calendar date of a timestamptz in the business timezone."""
    return cast(func.timezone(get_settings().business_timezone, column), Date)


def _in_range(column, f: Filters) -> list:
    conds = []
    if f.date_from:
        conds.append(column >= f.date_from)
    if f.date_to:
        conds.append(column <= f.date_to)
    return conds


def _subscription_scope(f: Filters) -> list:
    conds = []
    if f.plan_id is not None:
        conds.append(Subscription.plan_id == f.plan_id)
    if f.customer_id is not None:
        conds.append(Subscription.customer_id == f.customer_id)
    return conds


def _invoice_scope(stmt, f: Filters):
    if f.customer_id is not None:
        stmt = stmt.where(Invoice.customer_id == f.customer_id)
    if f.plan_id is not None:
        stmt = stmt.join(Subscription, Subscription.id == Invoice.subscription_id).where(
            Subscription.plan_id == f.plan_id
        )
    return stmt


def _payment_scope(stmt, f: Filters):
    stmt = stmt.where(Payment.status == "posted", *_in_range(Payment.payment_date, f))
    if f.customer_id is not None:
        stmt = stmt.where(Payment.customer_id == f.customer_id)
    if f.plan_id is not None:
        stmt = (
            stmt.join(Invoice, Invoice.id == Payment.invoice_id)
            .join(Subscription, Subscription.id == Invoice.subscription_id)
            .where(Subscription.plan_id == f.plan_id)
        )
    return stmt


def summary(db: Session, f: Filters) -> dict:
    today = business_today()
    scope = _subscription_scope(f)
    active = db.scalar(
        select(func.count())
        .select_from(Subscription)
        .where(Subscription.status == "active", *scope)
    )
    new = db.scalar(
        select(func.count())
        .select_from(Subscription)
        .where(Subscription.activated_at.is_not(None), *scope)
        .where(*_in_range(_local_date(Subscription.activated_at), f))
    )
    closed = db.scalar(
        select(func.count())
        .select_from(Subscription)
        .where(Subscription.status == "closed", Subscription.closed_at.is_not(None), *scope)
        .where(*_in_range(_local_date(Subscription.closed_at), f))
    )
    revenue, payments_count = db.execute(
        _payment_scope(select(func.coalesce(func.sum(Payment.amount), 0), func.count()), f)
    ).one()
    invoiced, invoices_count = db.execute(
        _invoice_scope(
            select(func.coalesce(func.sum(Invoice.amount_total), 0), func.count()).where(
                Invoice.status.in_(BILLED_STATUSES), *_in_range(Invoice.invoice_date, f)
            ),
            f,
        )
    ).one()
    overdue = Invoice.due_date < today
    outstanding, outstanding_count, overdue_amount, overdue_count = db.execute(
        _invoice_scope(
            select(
                func.coalesce(func.sum(Invoice.amount_due), 0),
                func.count(),
                func.coalesce(func.sum(Invoice.amount_due).filter(overdue), 0),
                func.count().filter(overdue),
            ).where(Invoice.status == "confirmed"),
            f,
        )
    ).one()
    return {
        "date_from": f.date_from,
        "date_to": f.date_to,
        "as_of": today,
        "active_subscriptions": active,
        "new_subscriptions": new,
        "closed_subscriptions": closed,
        "revenue_received": money(revenue),
        "payments_count": payments_count,
        "invoiced_amount": money(invoiced),
        "invoices_count": invoices_count,
        "outstanding_amount": money(outstanding),
        "outstanding_count": outstanding_count,
        "overdue_amount": money(overdue_amount),
        "overdue_count": overdue_count,
    }


def revenue_series(db: Session, f: Filters, granularity: str) -> list[dict]:
    period = cast(func.date_trunc(granularity, Payment.payment_date), Date).label("period")
    rows = db.execute(
        _payment_scope(
            select(period, func.sum(Payment.amount), func.count()).group_by(period), f
        ).order_by(period)
    ).all()
    return [{"period": p, "amount": money(a), "payments_count": c} for p, a, c in rows]


def payments_by_method(db: Session, f: Filters) -> list[dict]:
    rows = db.execute(
        _payment_scope(
            select(Payment.method, func.sum(Payment.amount), func.count()).group_by(Payment.method),
            f,
        ).order_by(Payment.method)
    ).all()
    return [{"method": m, "amount": money(a), "payments_count": c} for m, a, c in rows]


def subscriptions_by_status(db: Session, f: Filters) -> list[dict]:
    rows = db.execute(
        select(Subscription.status, func.count())
        .where(*_subscription_scope(f))
        .group_by(Subscription.status)
        .order_by(Subscription.status)
    ).all()
    return [{"status": s, "count": c} for s, c in rows]


def overdue_invoices(
    db: Session, *, customer_id: int | None, min_days_overdue: int, limit: int, offset: int
) -> tuple[int, list[dict]]:
    today = business_today()
    cutoff = date.fromordinal(today.toordinal() - min_days_overdue)
    conds = [Invoice.status == "confirmed", Invoice.due_date < today, Invoice.due_date <= cutoff]
    if customer_id is not None:
        conds.append(Invoice.customer_id == customer_id)
    total = db.scalar(select(func.count()).select_from(Invoice).where(*conds)) or 0
    rows = db.execute(
        select(Invoice, Customer.name)
        .join(Customer, Customer.id == Invoice.customer_id)
        .where(*conds)
        .order_by(Invoice.due_date, Invoice.id)
        .limit(limit)
        .offset(offset)
    ).all()
    items = [
        {
            "id": inv.id,
            "number": inv.number,
            "customer_id": inv.customer_id,
            "customer_name": name,
            "subscription_id": inv.subscription_id,
            "invoice_date": inv.invoice_date,
            "due_date": inv.due_date,
            "amount_total": inv.amount_total,
            "amount_paid": inv.amount_paid,
            "amount_due": inv.amount_due,
            "days_overdue": (today - inv.due_date).days,
        }
        for inv, name in rows
    ]
    return total, items
