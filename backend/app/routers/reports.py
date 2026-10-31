from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Query

from app.deps import DB, Page, StaffUser
from app.errors import AppError
from app.schemas import PageOut
from app.schemas.reports import (
    MethodBreakdownOut,
    OverdueInvoiceOut,
    RevenuePointOut,
    StatusCountOut,
    SummaryReportOut,
)
from app.services import reports
from app.services.common import business_today

router = APIRouter(prefix="/reports", tags=["reports"])

MAX_DAILY_RANGE = 366


def filters(
    date_from: date | None, date_to: date | None, plan_id: int | None, customer_id: int | None
) -> reports.Filters:
    if date_from and date_to and date_to < date_from:
        raise AppError(422, "VALIDATION_ERROR", "date_to must be on or after date_from")
    return reports.Filters(date_from, date_to, plan_id, customer_id)


@router.get("/summary", response_model=SummaryReportOut)
def summary(
    _: StaffUser,
    db: DB,
    date_from: date | None = None,
    date_to: date | None = None,
    plan_id: int | None = None,
    customer_id: int | None = None,
) -> dict:
    """Active subscriptions, revenue received, invoiced, outstanding and overdue in one call."""
    return reports.summary(db, filters(date_from, date_to, plan_id, customer_id))


@router.get("/revenue", response_model=list[RevenuePointOut])
def revenue(
    _: StaffUser,
    db: DB,
    date_from: date | None = None,
    date_to: date | None = None,
    granularity: Literal["day", "month"] = "month",
    plan_id: int | None = None,
    customer_id: int | None = None,
) -> list[dict]:
    """Payments received per day or month. Defaults to the last 12 months (month) or the last
    30 days (day); a daily series is limited to 366 days."""
    date_to = date_to or business_today()
    if date_from is None:
        if granularity == "day":
            date_from = date_to - timedelta(days=29)
        else:
            # First day of the month 11 months back: 12 monthly buckets including this one.
            year, month0 = divmod(date_to.year * 12 + date_to.month - 1 - 11, 12)
            date_from = date(year, month0 + 1, 1)
    if granularity == "day" and (date_to - date_from).days >= MAX_DAILY_RANGE:
        raise AppError(422, "VALIDATION_ERROR", "A daily series can cover at most 366 days")
    return reports.revenue_series(
        db, filters(date_from, date_to, plan_id, customer_id), granularity
    )


@router.get("/payments-by-method", response_model=list[MethodBreakdownOut])
def payments_by_method(
    _: StaffUser,
    db: DB,
    date_from: date | None = None,
    date_to: date | None = None,
    plan_id: int | None = None,
    customer_id: int | None = None,
) -> list[dict]:
    return reports.payments_by_method(db, filters(date_from, date_to, plan_id, customer_id))


@router.get("/subscriptions-by-status", response_model=list[StatusCountOut])
def subscriptions_by_status(
    _: StaffUser, db: DB, plan_id: int | None = None, customer_id: int | None = None
) -> list[dict]:
    return reports.subscriptions_by_status(db, filters(None, None, plan_id, customer_id))


@router.get("/overdue-invoices", response_model=PageOut[OverdueInvoiceOut])
def overdue_invoices(
    _: StaffUser,
    db: DB,
    page: Page,
    customer_id: int | None = None,
    min_days_overdue: int = Query(default=1, ge=1, le=3650),
) -> dict:
    """Confirmed invoices past their due date with money still owed, oldest first."""
    total, items = reports.overdue_invoices(
        db,
        customer_id=customer_id,
        min_days_overdue=min_days_overdue,
        limit=page.page_size,
        offset=page.offset,
    )
    return {"items": items, "total": total, "page": page.page, "page_size": page.page_size}
