"""Customer self-service portal. The customer always comes from the session; another customer's
record is answered with 404 so its existence is not revealed."""

from decimal import Decimal

from fastapi import APIRouter
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.deps import DB, CurrentCustomer, CustomerUser, Page
from app.errors import invalid_state, not_found
from app.models import Customer, Invoice, Subscription
from app.presenters import (
    fetch_page,
    invoice_list,
    invoice_out,
    page_out,
    subscription_list_item,
    subscription_out,
)
from app.schemas import PageOut, RequestModel, ResponseModel
from app.schemas.invoices import InvoiceListItem, InvoiceOut
from app.schemas.subscriptions import CloseIn, SubscriptionListItem, SubscriptionOut
from app.services import audit
from app.services import subscriptions as svc
from app.services.periods import business_today

router = APIRouter(prefix="/portal", tags=["portal"])

CUSTOMER_VISIBLE_SUBSCRIPTIONS = ("quotation", "confirmed", "active", "closed")
CUSTOMER_VISIBLE_INVOICES = ("confirmed", "paid", "cancelled")


class PortalSummaryOut(ResponseModel):
    active_subscriptions: int
    pending_quotations: int
    outstanding_amount: Decimal
    overdue_amount: Decimal
    overdue_invoices: int
    next_invoice_date: str | None


class ProfileOut(ResponseModel):
    id: int
    name: str
    email: str
    phone: str | None
    company_name: str | None
    address: str | None
    tax_id: str | None


class ProfileUpdateIn(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    phone: str | None = Field(default=None, max_length=32)
    company_name: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=1000)
    tax_id: str | None = Field(default=None, max_length=32)


def _own_subscription(db, customer: Customer, subscription_id: int, lock: bool = False):
    stmt = select(Subscription).where(
        Subscription.id == subscription_id,
        Subscription.customer_id == customer.id,
        Subscription.status.in_(CUSTOMER_VISIBLE_SUBSCRIPTIONS),
    )
    if lock:
        stmt = stmt.with_for_update(of=Subscription).execution_options(populate_existing=True)
    sub = db.scalar(stmt)
    if sub is None:
        raise not_found("Subscription")
    return sub


@router.get("/summary", response_model=PortalSummaryOut)
def summary(customer: CurrentCustomer, db: DB) -> PortalSummaryOut:
    today = business_today()
    counts = dict(
        db.execute(
            select(Subscription.status, func.count())
            .where(Subscription.customer_id == customer.id)
            .group_by(Subscription.status)
        ).all()
    )
    open_invoices = (Invoice.customer_id == customer.id) & (Invoice.status == "confirmed")
    overdue = open_invoices & (Invoice.due_date < today) & (Invoice.amount_due > 0)
    next_date = db.scalar(
        select(func.min(Subscription.next_invoice_date)).where(
            Subscription.customer_id == customer.id,
            Subscription.status == "active",
            Subscription.paused_at.is_(None),
            Subscription.next_invoice_date <= Subscription.end_date,
        )
    )
    return PortalSummaryOut(
        active_subscriptions=counts.get("active", 0),
        pending_quotations=counts.get("quotation", 0),
        outstanding_amount=db.scalar(
            select(func.coalesce(func.sum(Invoice.amount_due), 0)).where(open_invoices)
        ),
        overdue_amount=db.scalar(
            select(func.coalesce(func.sum(Invoice.amount_due), 0)).where(overdue)
        ),
        overdue_invoices=db.scalar(select(func.count()).select_from(Invoice).where(overdue)),
        next_invoice_date=next_date.isoformat() if next_date else None,
    )


@router.get("/subscriptions", response_model=PageOut[SubscriptionListItem])
def my_subscriptions(customer: CurrentCustomer, db: DB, page: Page) -> dict:
    today = business_today()
    stmt = (
        select(Subscription)
        .options(selectinload(Subscription.customer), selectinload(Subscription.plan))
        .where(
            Subscription.customer_id == customer.id,
            Subscription.status.in_(CUSTOMER_VISIBLE_SUBSCRIPTIONS),
        )
        .order_by(Subscription.id.desc())
    )
    rows, total = fetch_page(db, stmt, page)
    return page_out([subscription_list_item(s, today) for s in rows], total, page)


@router.get("/subscriptions/{subscription_id}", response_model=SubscriptionOut)
def my_subscription(
    subscription_id: int, user: CustomerUser, customer: CurrentCustomer, db: DB
) -> SubscriptionOut:
    sub = _own_subscription(db, customer, subscription_id)
    return subscription_out(db, sub, user.role, business_today())


def _self_service(action: str, subscription_id: int, user, customer, db, **kwargs):
    today = business_today()
    sub = _own_subscription(db, customer, subscription_id, lock=True)
    if action not in svc.available_actions(sub, "customer", today):
        raise invalid_state(f"'{action}' is not available for this subscription")
    handler = {
        "accept": svc.confirm,
        "pause": svc.pause,
        "resume": svc.resume,
        "renew": svc.renew,
        "close": svc.close,
    }[action]
    handler(db, sub, user, today, **kwargs)
    audit.record(
        db, action=f"portal.{action}", entity_type="subscription", entity_id=sub.id, actor=user
    )
    db.commit()
    return subscription_out(db, sub, user.role, today)


@router.post("/subscriptions/{subscription_id}/accept", response_model=SubscriptionOut)
def accept(subscription_id: int, user: CustomerUser, customer: CurrentCustomer, db: DB):
    return _self_service("accept", subscription_id, user, customer, db)


@router.post("/subscriptions/{subscription_id}/pause", response_model=SubscriptionOut)
def pause(subscription_id: int, user: CustomerUser, customer: CurrentCustomer, db: DB):
    return _self_service("pause", subscription_id, user, customer, db)


@router.post("/subscriptions/{subscription_id}/resume", response_model=SubscriptionOut)
def resume(subscription_id: int, user: CustomerUser, customer: CurrentCustomer, db: DB):
    return _self_service("resume", subscription_id, user, customer, db)


@router.post("/subscriptions/{subscription_id}/renew", response_model=SubscriptionOut)
def renew(subscription_id: int, user: CustomerUser, customer: CurrentCustomer, db: DB):
    return _self_service("renew", subscription_id, user, customer, db)


@router.post("/subscriptions/{subscription_id}/close", response_model=SubscriptionOut)
def close(
    subscription_id: int,
    user: CustomerUser,
    customer: CurrentCustomer,
    db: DB,
    body: CloseIn | None = None,
):
    reason = (body.reason if body else None) or "closed_by_customer"
    return _self_service("close", subscription_id, user, customer, db, reason=reason)


@router.get("/invoices", response_model=PageOut[InvoiceListItem])
def my_invoices(customer: CurrentCustomer, db: DB, page: Page) -> dict:
    stmt = (
        select(Invoice)
        .options(selectinload(Invoice.subscription))
        .where(Invoice.customer_id == customer.id, Invoice.status.in_(CUSTOMER_VISIBLE_INVOICES))
        .order_by(Invoice.invoice_date.desc(), Invoice.id.desc())
    )
    rows, total = fetch_page(db, stmt, page)
    return page_out(invoice_list(db, rows, business_today()), total, page)


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def my_invoice(invoice_id: int, user: CustomerUser, customer: CurrentCustomer, db: DB):
    inv = db.scalar(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.customer_id == customer.id,
            Invoice.status.in_(CUSTOMER_VISIBLE_INVOICES),
        )
    )
    if inv is None:
        raise not_found("Invoice")
    return invoice_out(db, inv, user.role, business_today())


@router.get("/profile", response_model=ProfileOut)
def get_profile(customer: CurrentCustomer) -> Customer:
    return customer


@router.patch("/profile", response_model=ProfileOut)
def update_profile(
    body: ProfileUpdateIn, user: CustomerUser, customer: CurrentCustomer, db: DB
) -> Customer:
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(customer, field, value)
    audit.record(
        db,
        action="customer.profile_updated",
        entity_type="customer",
        entity_id=customer.id,
        actor=user,
        data={"fields": sorted(changes)},
    )
    db.commit()
    db.refresh(customer)
    return customer
