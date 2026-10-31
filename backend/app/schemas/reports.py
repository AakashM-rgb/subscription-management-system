"""Report schemas (Claude 2)."""

from datetime import date
from decimal import Decimal

from app.schemas import ResponseModel
from app.schemas.payments import PaymentMethod


class SummaryReportOut(ResponseModel):
    date_from: date | None
    date_to: date | None
    as_of: date
    active_subscriptions: int
    new_subscriptions: int
    closed_subscriptions: int
    revenue_received: Decimal
    payments_count: int
    invoiced_amount: Decimal
    invoices_count: int
    outstanding_amount: Decimal
    outstanding_count: int
    overdue_amount: Decimal
    overdue_count: int


class RevenuePointOut(ResponseModel):
    period: date
    amount: Decimal
    payments_count: int


class MethodBreakdownOut(ResponseModel):
    method: PaymentMethod
    amount: Decimal
    payments_count: int


class StatusCountOut(ResponseModel):
    status: str
    count: int


class OverdueInvoiceOut(ResponseModel):
    id: int
    number: str | None
    customer_id: int
    customer_name: str
    subscription_id: int
    invoice_date: date
    due_date: date
    amount_total: Decimal
    amount_paid: Decimal
    amount_due: Decimal
    days_overdue: int
