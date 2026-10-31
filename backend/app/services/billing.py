"""Recurring billing engine.

Guarantees
- No double billing: the partial unique index (subscription_id, period_start) WHERE status <>
  'cancelled', a row lock on each subscription, and the cursor advanced in the same transaction.
- No silent skipping: every due period up to `as_of` is billed (catch-up after downtime);
  a failing subscription keeps its cursor, is recorded as a failed run item and retried next run.
- Safe concurrency: a PostgreSQL advisory lock allows one run at a time; rows are claimed with
  FOR UPDATE SKIP LOCKED; batches commit independently so a worker restart loses no work.
"""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Connection, Engine, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.errors import AppError
from app.models import (
    BillingRun,
    BillingRunItem,
    Discount,
    Invoice,
    InvoiceLine,
    Subscription,
    SubscriptionLine,
    User,
)
from app.services import audit
from app.services.periods import period_end, period_start
from app.services.pricing import price
from app.services.subscriptions import (
    activate_due,
    auto_close_expired,
    discount_rule,
    price_lines,
)

log = logging.getLogger(__name__)

BILLING_LOCK_KEY = 72_026_101  # arbitrary, constant application-wide advisory lock id
BATCH_SIZE = 100
DUPLICATE_PERIOD_INDEX = "ux_invoices_subscription_period"


@contextmanager
def billing_lock(db: Session) -> Iterator[bool]:
    """Session-level advisory lock held on one dedicated connection for the whole run."""
    bind = db.get_bind()
    conn: Connection = bind.connect() if isinstance(bind, Engine) else bind
    acquired = bool(conn.execute(select(func.pg_try_advisory_lock(BILLING_LOCK_KEY))).scalar())
    try:
        yield acquired
    finally:
        if acquired:
            conn.execute(select(func.pg_advisory_unlock(BILLING_LOCK_KEY)))
        if isinstance(bind, Engine):
            conn.commit()
            conn.close()


def _consume_discount(db: Session, discount_id: int) -> bool:
    """Atomically take one use of a discount; False when its usage limit was just reached."""
    row = db.execute(
        update(Discount)
        .where(
            Discount.id == discount_id,
            or_(Discount.usage_limit.is_(None), Discount.usage_count < Discount.usage_limit),
        )
        .values(usage_count=Discount.usage_count + 1)
        .returning(Discount.id)
        .execution_options(synchronize_session=False)
    ).first()
    return row is not None


def release_discount(db: Session, discount_id: int) -> None:
    db.execute(
        update(Discount)
        .where(Discount.id == discount_id, Discount.usage_count > 0)
        .values(usage_count=Discount.usage_count - 1)
        .execution_options(synchronize_session=False)
    )


def create_invoice_for_period(
    db: Session,
    sub: Subscription,
    k: int,
    invoice_date: date,
    *,
    billing_run_id: int | None = None,
    replaces_invoice_id: int | None = None,
) -> Invoice | None:
    """Create the draft invoice for period k from the subscription's current lines.

    Returns None if a live invoice for that period already exists.
    """
    p_start = period_start(sub.start_date, sub.plan.billing_period, k)
    p_end = min(period_end(sub.start_date, sub.plan.billing_period, k), sub.end_date)
    lines = price_lines(sub.lines)
    rule = discount_rule(sub.discount)
    result = price(lines, rule, invoice_date)
    if result.discount_applied is not None and not _consume_discount(db, rule.id):
        result = price(lines, None, invoice_date)  # limit reached concurrently: bill without it
    if sub.discount is not None:
        db.expire(sub.discount, ["usage_count"])

    customer = sub.customer
    invoice = Invoice(
        subscription_id=sub.id,
        customer_id=customer.id,
        status="draft",
        period_start=p_start,
        period_end=p_end,
        invoice_date=invoice_date,
        due_date=invoice_date + timedelta(days=sub.payment_term.due_days),
        currency=get_settings().currency,
        bill_to_name=customer.company_name or customer.name,
        bill_to_email=customer.email,
        bill_to_address=customer.address,
        payment_term_name=sub.payment_term.name,
        discount_id=result.discount_applied.id if result.discount_applied else None,
        discount_name=result.discount_applied.name if result.discount_applied else None,
        amount_untaxed=result.amount_untaxed,
        amount_discount=result.amount_discount,
        amount_tax=result.amount_tax,
        amount_total=result.amount_total,
        billing_run_id=billing_run_id,
        replaces_invoice_id=replaces_invoice_id,
    )
    invoice.lines = [
        InvoiceLine(
            line_type=src.line_type,
            product_id=src.product_id,
            description=src.description,
            quantity=src.quantity,
            unit_price=src.unit_price,
            subtotal=priced.subtotal,
            discount_amount=priced.discount_amount,
            taxable_amount=priced.taxable_amount,
            tax_name=line.tax_name,
            tax_rate=line.tax_rate,
            tax_amount=priced.tax_amount,
            total=priced.total,
            sequence=src.sequence,
        )
        for src, line, priced in zip(sub.lines, lines, result.lines, strict=True)
    ]
    try:
        with db.begin_nested():
            db.add(invoice)
            db.flush()
    except IntegrityError as exc:
        if DUPLICATE_PERIOD_INDEX in str(exc.orig):
            return None  # already billed by someone else; never bill twice
        raise
    audit.record(
        db,
        action="invoice.generated",
        entity_type="invoice",
        entity_id=invoice.id,
        actor_type="system",
        data={
            "subscription_id": sub.id,
            "period_start": p_start.isoformat(),
            "amount_total": str(invoice.amount_total),
            "replaces_invoice_id": replaces_invoice_id,
        },
    )
    return invoice


def bill_subscription(
    db: Session, sub: Subscription, as_of: date, billing_run_id: int | None = None
) -> list[Invoice]:
    """Bill every due period of one (already row-locked) subscription up to `as_of`."""
    created: list[Invoice] = []
    while (
        sub.status == "active"
        and sub.paused_at is None
        and sub.next_invoice_date is not None
        and sub.next_invoice_date <= as_of
        and sub.next_invoice_date <= sub.end_date
    ):
        invoice = create_invoice_for_period(
            db, sub, sub.next_period_index, as_of, billing_run_id=billing_run_id
        )
        if invoice is not None:
            created.append(invoice)
        sub.next_period_index += 1
        sub.next_invoice_date = period_start(
            sub.start_date, sub.plan.billing_period, sub.next_period_index
        )
    db.flush()
    return created


def _due_batch(db: Session, as_of: date, after_id: int, only_id: int | None) -> list[Subscription]:
    stmt = (
        select(Subscription)
        .where(
            Subscription.status == "active",
            Subscription.paused_at.is_(None),
            Subscription.next_invoice_date <= as_of,
            Subscription.next_invoice_date <= Subscription.end_date,
            Subscription.id > after_id,
        )
        .order_by(Subscription.id)
        .limit(BATCH_SIZE)
        .with_for_update(skip_locked=True, of=Subscription)
        .execution_options(populate_existing=True)
        # Load everything pricing and invoicing need up front (a few queries per batch
        # instead of several per subscription).
        .options(
            selectinload(Subscription.lines).selectinload(SubscriptionLine.tax),
            selectinload(Subscription.plan),
            selectinload(Subscription.payment_term),
            selectinload(Subscription.customer),
            selectinload(Subscription.discount).selectinload(Discount.products),
        )
    )
    if only_id is not None:
        stmt = stmt.where(Subscription.id == only_id)
    return list(db.scalars(stmt))


def run_billing(
    db: Session,
    *,
    as_of: date,
    trigger: str,
    actor: User | None = None,
    subscription_id: int | None = None,
) -> BillingRun:
    with billing_lock(db) as acquired:
        if not acquired:
            raise AppError(409, "BILLING_RUN_IN_PROGRESS", "A billing run is already in progress")
        # Holding the lock proves no other run is alive: close runs orphaned by a crash.
        db.execute(
            update(BillingRun)
            .where(BillingRun.status == "running")
            .values(
                status="failed", error="interrupted (worker stopped)", finished_at=datetime.now(UTC)
            )
        )
        run = BillingRun(trigger=trigger, as_of=as_of, triggered_by=actor.id if actor else None)
        db.add(run)
        db.commit()
        try:
            activate_due(db, as_of)
            db.commit()
            last_id = 0
            while batch := _due_batch(db, as_of, last_id, subscription_id):
                for sub in batch:
                    last_id = sub.id
                    run.subscriptions_due += 1
                    try:
                        with db.begin_nested():
                            invoices = bill_subscription(db, sub, as_of, run.id)
                        run.invoices_created += len(invoices)
                        db.add(
                            BillingRunItem(
                                billing_run_id=run.id,
                                subscription_id=sub.id,
                                status="billed",
                                invoices_created=len(invoices),
                            )
                        )
                    except Exception as exc:  # isolate the failure; retried next run
                        log.exception("billing failed for subscription %s", sub.id)
                        db.expire(sub)
                        run.failures += 1
                        db.add(
                            BillingRunItem(
                                billing_run_id=run.id,
                                subscription_id=sub.id,
                                status="failed",
                                error=f"{type(exc).__name__}: {exc}"[:2000],
                            )
                        )
                db.commit()
            if subscription_id is None:
                auto_close_expired(db, as_of)
            run.status = "succeeded" if run.failures == 0 else "partial"
        except Exception as exc:
            log.exception("billing run %s aborted", run.id)
            db.rollback()
            run.status = "failed"
            run.error = f"{type(exc).__name__}: {exc}"[:2000]
        run.finished_at = datetime.now(UTC)
        db.commit()
        log.info(
            "billing run %s %s: due=%s invoices=%s failures=%s",
            run.id,
            run.status,
            run.subscriptions_due,
            run.invoices_created,
            run.failures,
        )
        return run
