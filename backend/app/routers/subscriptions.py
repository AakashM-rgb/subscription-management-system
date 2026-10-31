from typing import Literal

from fastapi import APIRouter
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.deps import DB, Page, StaffUser
from app.errors import not_found
from app.models import Customer, Invoice, Subscription
from app.presenters import (
    apply_sort,
    events_out,
    fetch_page,
    invoice_list,
    page_out,
    subscription_list_item,
    subscription_out,
)
from app.schemas import PageOut
from app.schemas.invoices import BillingRunOut, InvoiceListItem
from app.schemas.subscriptions import (
    CloseIn,
    DiscountAttachIn,
    EventOut,
    SubscriptionCreateIn,
    SubscriptionListItem,
    SubscriptionOut,
    SubscriptionUpdateIn,
)
from app.services import billing
from app.services import subscriptions as svc
from app.services.periods import business_today

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

SORTABLE = {
    "created_at": Subscription.created_at,
    "number": Subscription.number,
    "status": Subscription.status,
    "start_date": Subscription.start_date,
    "end_date": Subscription.end_date,
    "next_invoice_date": Subscription.next_invoice_date,
    "amount_total": Subscription.amount_total,
}


@router.get("", response_model=PageOut[SubscriptionListItem])
def list_subscriptions(
    _: StaffUser,
    db: DB,
    page: Page,
    status: Literal["draft", "quotation", "confirmed", "active", "closed"] | None = None,
    customer_id: int | None = None,
    plan_id: int | None = None,
    q: str | None = None,
    expired: bool | None = None,
    paused: bool | None = None,
    sort: str | None = None,
) -> dict:
    today = business_today()
    stmt = select(Subscription).options(
        selectinload(Subscription.customer), selectinload(Subscription.plan)
    )
    if status:
        stmt = stmt.where(Subscription.status == status)
    if customer_id:
        stmt = stmt.where(Subscription.customer_id == customer_id)
    if plan_id:
        stmt = stmt.where(Subscription.plan_id == plan_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.join(Customer, Subscription.customer_id == Customer.id).where(
            or_(
                Subscription.number.ilike(like),
                Customer.name.ilike(like),
                Customer.email.ilike(like),
            )
        )
    if expired is not None:
        cond = (Subscription.status == "active") & (Subscription.end_date < today)
        stmt = stmt.where(cond if expired else ~cond)
    if paused is not None:
        stmt = stmt.where(
            Subscription.paused_at.is_not(None) if paused else Subscription.paused_at.is_(None)
        )
    stmt = apply_sort(stmt, sort, SORTABLE, Subscription.id.desc())
    rows, total = fetch_page(db, stmt, page)
    return page_out([subscription_list_item(s, today) for s in rows], total, page)


@router.post("", response_model=SubscriptionOut, status_code=201)
def create_subscription(body: SubscriptionCreateIn, user: StaffUser, db: DB) -> SubscriptionOut:
    today = business_today()
    sub = svc.create_subscription(db, body, user, today)
    db.commit()
    return subscription_out(db, sub, user.role, today)


def _get(db, subscription_id: int) -> Subscription:
    sub = db.get(Subscription, subscription_id)
    if sub is None:
        raise not_found("Subscription")
    return sub


@router.get("/{subscription_id}", response_model=SubscriptionOut)
def get_subscription(subscription_id: int, user: StaffUser, db: DB) -> SubscriptionOut:
    return subscription_out(db, _get(db, subscription_id), user.role, business_today())


@router.patch("/{subscription_id}", response_model=SubscriptionOut)
def update_subscription(
    subscription_id: int, body: SubscriptionUpdateIn, user: StaffUser, db: DB
) -> SubscriptionOut:
    today = business_today()
    sub = svc.update_subscription(db, svc.lock_subscription(db, subscription_id), body, user, today)
    db.commit()
    return subscription_out(db, sub, user.role, today)


@router.put("/{subscription_id}/discount", response_model=SubscriptionOut)
def set_discount(
    subscription_id: int, body: DiscountAttachIn, user: StaffUser, db: DB
) -> SubscriptionOut:
    today = business_today()
    sub = svc.lock_subscription(db, subscription_id)
    svc.set_discount(db, sub, body.discount_id, user, today)
    db.commit()
    return subscription_out(db, sub, user.role, today)


def _transition(action, subscription_id: int, user, db, **kwargs) -> SubscriptionOut:
    today = business_today()
    sub = svc.lock_subscription(db, subscription_id)
    action(db, sub, user, today, **kwargs)
    db.commit()
    return subscription_out(db, sub, user.role, today)


@router.post("/{subscription_id}/send-quotation", response_model=SubscriptionOut)
def send_quotation(subscription_id: int, user: StaffUser, db: DB) -> SubscriptionOut:
    return _transition(svc.send_quotation, subscription_id, user, db)


@router.post("/{subscription_id}/confirm", response_model=SubscriptionOut)
def confirm(subscription_id: int, user: StaffUser, db: DB) -> SubscriptionOut:
    return _transition(svc.confirm, subscription_id, user, db)


@router.post("/{subscription_id}/pause", response_model=SubscriptionOut)
def pause(subscription_id: int, user: StaffUser, db: DB) -> SubscriptionOut:
    return _transition(svc.pause, subscription_id, user, db)


@router.post("/{subscription_id}/resume", response_model=SubscriptionOut)
def resume(subscription_id: int, user: StaffUser, db: DB) -> SubscriptionOut:
    return _transition(svc.resume, subscription_id, user, db)


@router.post("/{subscription_id}/renew", response_model=SubscriptionOut)
def renew(subscription_id: int, user: StaffUser, db: DB) -> SubscriptionOut:
    return _transition(svc.renew, subscription_id, user, db)


@router.post("/{subscription_id}/close", response_model=SubscriptionOut)
def close(subscription_id: int, user: StaffUser, db: DB, body: CloseIn | None = None):
    return _transition(svc.close, subscription_id, user, db, reason=body.reason if body else None)


@router.post("/{subscription_id}/bill-now", response_model=BillingRunOut)
def bill_now(subscription_id: int, user: StaffUser, db: DB):
    _get(db, subscription_id)
    return billing.run_billing(
        db,
        as_of=business_today(),
        trigger="subscription",
        actor=user,
        subscription_id=subscription_id,
    )


@router.get("/{subscription_id}/events", response_model=PageOut[EventOut])
def events(subscription_id: int, _: StaffUser, db: DB, page: Page) -> dict:
    _get(db, subscription_id)
    return events_out(db, "subscription", subscription_id, page)


@router.get("/{subscription_id}/invoices", response_model=PageOut[InvoiceListItem])
def subscription_invoices(subscription_id: int, _: StaffUser, db: DB, page: Page) -> dict:
    _get(db, subscription_id)
    stmt = (
        select(Invoice)
        .options(selectinload(Invoice.subscription))
        .where(Invoice.subscription_id == subscription_id)
        .order_by(Invoice.period_start.desc(), Invoice.id.desc())
    )
    rows, total = fetch_page(db, stmt, page)
    return page_out(invoice_list(db, rows, business_today()), total, page)
