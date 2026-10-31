"""Row builders for Claude 2's tests (customers, catalog, invoices, payments).

Invoices are inserted directly because invoice generation is a separate module; every row still
has to satisfy the database CHECKs and triggers, so the ledger is tested against the real rules.
"""

from datetime import date, timedelta
from decimal import Decimal
from itertools import count

from sqlalchemy.orm import Session

from app.models import Customer, Invoice, PaymentTerm, Plan, Subscription, User
from app.services.common import business_today
from tests.conftest import make_user

_seq = count(1)


def customer(db: Session, name: str = "Acme Shop", user: User | None = None) -> Customer:
    n = next(_seq)
    c = Customer(name=f"{name} {n}", email=f"billing{n}@acme.example.com", user=user)
    db.add(c)
    db.flush()
    return c


def portal_customer(db: Session, email: str) -> Customer:
    user = make_user(db, "customer", email=email)
    return customer(db, "Portal Co", user=user)


def plan(db: Session, **overrides) -> Plan:
    values = {
        "name": f"Plan {next(_seq)}",
        "price": Decimal("1000.00"),
        "billing_period": "monthly",
        "available_from": date(2026, 1, 1),
    }
    values.update(overrides)
    p = Plan(**values)
    db.add(p)
    db.flush()
    return p


def subscription(
    db: Session, cust: Customer, plan_: Plan | None = None, status: str = "draft", **overrides
) -> Subscription:
    term = PaymentTerm(name=f"Net {next(_seq)}", due_days=15)
    db.add(term)
    plan_ = plan_ or plan(db)
    start = date(2026, 1, 1)
    values = {
        "number": f"SUB-T{next(_seq):06d}",
        "customer_id": cust.id,
        "plan_id": plan_.id,
        "payment_term": term,
        "status": status,
        "start_date": start,
        "term_periods": 12,
        "end_date": start + timedelta(days=364),
    }
    if status == "active":
        values["next_invoice_date"] = start
    values.update(overrides)
    sub = Subscription(**values)
    db.add(sub)
    db.flush()
    return sub


def invoice(
    db: Session,
    sub: Subscription,
    *,
    total: str = "1180.00",
    status: str = "confirmed",
    invoice_date: date | None = None,
    due_in_days: int = 15,
    period_start: date | None = None,
) -> Invoice:
    """A confirmed invoice of `total` (18% tax on a round untaxed amount where possible)."""
    amount_total = Decimal(total)
    untaxed = (amount_total / Decimal("1.18")).quantize(Decimal("0.01"))
    tax = amount_total - untaxed
    inv_date = invoice_date or business_today()
    n = next(_seq)
    inv = Invoice(
        number=f"INV/T/{n:06d}" if status != "draft" else None,
        subscription_id=sub.id,
        customer_id=sub.customer_id,
        status=status,
        period_start=period_start or date(2000, 1, 1) + timedelta(days=n),
        period_end=(period_start or date(2000, 1, 1) + timedelta(days=n)) + timedelta(days=29),
        invoice_date=inv_date,
        due_date=inv_date + timedelta(days=due_in_days),
        currency="INR",
        bill_to_name="Acme",
        bill_to_email="billing@acme.example.com",
        payment_term_name="Net 15",
        amount_untaxed=untaxed,
        amount_discount=Decimal("0.00"),
        amount_tax=tax,
        amount_total=amount_total,
    )
    db.add(inv)
    db.flush()
    return inv
