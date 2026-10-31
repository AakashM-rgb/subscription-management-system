from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from app.schemas import RequestModel, ResponseModel


class CancelIn(RequestModel):
    reason: str = Field(min_length=1, max_length=500)
    reissue: bool = False


class BulkConfirmIn(RequestModel):
    invoice_ids: list[int] = Field(min_length=1, max_length=500)


class BillingRunIn(RequestModel):
    as_of: date | None = None


class SubscriptionRef(ResponseModel):
    id: int
    number: str


class InvoiceLineOut(ResponseModel):
    id: int
    line_type: str
    product_id: int | None
    description: str
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    tax_name: str | None
    tax_rate: Decimal
    tax_amount: Decimal
    total: Decimal


class InvoicePaymentOut(ResponseModel):
    id: int
    number: str
    method: str
    amount: Decimal
    payment_date: date
    note: str | None
    status: str
    provider: str | None
    created_at: datetime


class InvoiceListItem(ResponseModel):
    id: int
    number: str | None
    status: str
    payment_state: str
    is_overdue: bool
    days_overdue: int
    collection_status: str
    subscription: SubscriptionRef
    customer_id: int
    bill_to_name: str
    period_start: date
    period_end: date
    invoice_date: date
    due_date: date
    currency: str
    amount_total: Decimal
    amount_paid: Decimal
    amount_due: Decimal


class InvoiceOut(InvoiceListItem):
    bill_to_email: str
    bill_to_address: str | None
    payment_term_name: str
    discount_name: str | None
    amount_untaxed: Decimal
    amount_discount: Decimal
    amount_tax: Decimal
    confirmed_at: datetime | None
    paid_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    replaces_invoice_id: int | None
    sent_at: datetime | None
    sent_count: int
    lines: list[InvoiceLineOut]
    payments: list[InvoicePaymentOut]
    available_actions: list[str]


class BulkConfirmError(ResponseModel):
    id: int
    code: str
    message: str


class BulkConfirmOut(ResponseModel):
    confirmed: list[int]
    errors: list[BulkConfirmError]


class BillingRunItemOut(ResponseModel):
    id: int
    subscription_id: int
    status: str
    invoices_created: int
    error: str | None
    created_at: datetime


class BillingRunOut(ResponseModel):
    id: int
    trigger: str
    as_of: date
    status: str
    triggered_by: int | None
    subscriptions_due: int
    invoices_created: int
    failures: int
    error: str | None
    started_at: datetime
    finished_at: datetime | None


class BillingRunDetailOut(BillingRunOut):
    items: list[BillingRunItemOut]
