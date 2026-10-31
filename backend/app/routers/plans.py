from datetime import date

from fastapi import APIRouter
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.deps import DB, AdminUser, Page, StaffUser
from app.errors import AppError, not_found
from app.models import Plan, Subscription
from app.pagination import paginate
from app.routers.products import check_tax
from app.schemas import PageOut
from app.schemas.catalog import BillingPeriod, PlanCreateIn, PlanOut, PlanUpdateIn
from app.services.common import apply_changes

router = APIRouter(prefix="/plans", tags=["plans"])

# Subscriptions in these states are scheduled from the plan's billing period.
LIVE_STATUSES = ("quotation", "confirmed", "active")


def load_plan(db: Session, plan_id: int) -> Plan:
    plan = db.scalar(
        select(Plan)
        .where(Plan.id == plan_id)
        .options(selectinload(Plan.tax))
        .execution_options(populate_existing=True)
    )
    if plan is None:
        raise not_found("Plan")
    return plan


@router.get("", response_model=PageOut[PlanOut])
def list_plans(
    _: StaffUser,
    db: DB,
    page: Page,
    is_active: bool | None = None,
    billing_period: BillingPeriod | None = None,
    available_on: date | None = None,
) -> dict:
    stmt = select(Plan).options(selectinload(Plan.tax)).order_by(Plan.name, Plan.id)
    if is_active is not None:
        stmt = stmt.where(Plan.is_active.is_(is_active))
    if billing_period:
        stmt = stmt.where(Plan.billing_period == billing_period)
    if available_on:
        stmt = stmt.where(
            Plan.available_from <= available_on,
            or_(Plan.available_until.is_(None), Plan.available_until >= available_on),
        )
    return paginate(db, stmt, page, PlanOut)


@router.post("", response_model=PlanOut, status_code=201)
def create_plan(body: PlanCreateIn, _: AdminUser, db: DB) -> Plan:
    check_tax(db, body.tax_id)
    plan = Plan(**body.model_dump())
    db.add(plan)
    db.commit()
    return load_plan(db, plan.id)


@router.get("/{plan_id}", response_model=PlanOut)
def get_plan(plan_id: int, _: StaffUser, db: DB) -> Plan:
    return load_plan(db, plan_id)


@router.patch("/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: int, body: PlanUpdateIn, _: AdminUser, db: DB) -> Plan:
    """The price applies to subscriptions created afterwards (subscription lines keep their
    unit price). The billing period cannot change while live subscriptions depend on it."""
    plan = load_plan(db, plan_id)
    fields = body.model_fields_set
    if "tax_id" in fields:
        check_tax(db, body.tax_id)
    if "billing_period" in fields and body.billing_period != plan.billing_period:
        in_use = db.scalar(
            select(Subscription.id)
            .where(Subscription.plan_id == plan.id, Subscription.status.in_(LIVE_STATUSES))
            .limit(1)
        )
        if in_use is not None:
            raise AppError(
                409,
                "INVALID_STATE",
                "The billing period cannot change while subscriptions use this plan; "
                "create a new plan instead",
            )
    available_from = body.available_from if "available_from" in fields else plan.available_from
    available_until = body.available_until if "available_until" in fields else plan.available_until
    if available_until is not None and available_from is not None:
        if available_until < available_from:
            raise AppError(
                422, "VALIDATION_ERROR", "available_until must be on or after available_from"
            )
    apply_changes(plan, body)
    db.commit()
    db.expire_all()
    return load_plan(db, plan_id)
