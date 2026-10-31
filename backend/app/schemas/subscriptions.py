from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from app.schemas import MoneyIn, RequestModel, ResponseModel, TaxRef


class LineIn(RequestModel):
    product_id: int
    variant_id: int | None = None
    quantity: int = Field(ge=1, le=1_000_000)
    unit_price: MoneyIn | None = None  # defaults to product sales price + variant extra
    description: str | None = Field(default=None, max_length=255)


class SubscriptionCreateIn(RequestModel):
    customer_id: int
    template_id: int | None = None
    plan_id: int | None = None
    plan_quantity: int | None = Field(default=None, ge=1, le=1_000_000)
    start_date: date
    term_periods: int | None = Field(default=None, ge=1, le=1200)
    payment_term_id: int | None = None
    discount_id: int | None = None
    notes: str | None = None
    lines: list[LineIn] | None = None


class SubscriptionUpdateIn(RequestModel):
    customer_id: int | None = None
    plan_id: int | None = None
    plan_quantity: int | None = Field(default=None, ge=1, le=1_000_000)
    start_date: date | None = None
    term_periods: int | None = Field(default=None, ge=1, le=1200)
    payment_term_id: int | None = None
    notes: str | None = None
    lines: list[LineIn] | None = None


class CloseIn(RequestModel):
    reason: str | None = Field(default=None, max_length=200)


class DiscountAttachIn(RequestModel):
    discount_id: int | None


class PricingPreviewIn(RequestModel):
    plan_id: int
    plan_quantity: int = Field(ge=1, le=1_000_000)
    lines: list[LineIn] = []
    discount_id: int | None = None
    on: date | None = None


# ----------------------------------------------------------------------------- responses


class CustomerRef(ResponseModel):
    id: int
    name: str
    email: str


class PlanRef(ResponseModel):
    id: int
    name: str
    price: Decimal
    billing_period: str
    min_quantity: int
    auto_close: bool
    closable: bool
    pausable: bool
    renewable: bool


class PaymentTermRef(ResponseModel):
    id: int
    name: str
    due_days: int


class DiscountRef(ResponseModel):
    id: int
    name: str
    kind: str
    value: Decimal
    scope: str


class SubscriptionLineOut(ResponseModel):
    id: int | None = None
    line_type: str
    product_id: int | None
    variant_id: int | None
    description: str
    quantity: int
    unit_price: Decimal
    tax: TaxRef | None
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total: Decimal


class InvoiceRef(ResponseModel):
    id: int
    number: str | None
    status: str
    amount_total: Decimal
    invoice_date: date


class SubscriptionListItem(ResponseModel):
    id: int
    number: str
    status: str
    customer: CustomerRef
    plan: PlanRef
    start_date: date
    end_date: date
    next_invoice_date: date | None
    is_paused: bool
    is_expired: bool
    amount_total: Decimal
    created_at: datetime


class SubscriptionOut(SubscriptionListItem):
    payment_term: PaymentTermRef
    discount: DiscountRef | None
    term_periods: int
    quotation_valid_until: date | None
    paused_at: datetime | None
    confirmed_at: datetime | None
    activated_at: datetime | None
    closed_at: datetime | None
    close_reason: str | None
    template_id: int | None
    amount_untaxed: Decimal
    amount_discount: Decimal
    amount_tax: Decimal
    notes: str | None
    auto_collect: bool
    lines: list[SubscriptionLineOut]
    last_invoice: InvoiceRef | None
    available_actions: list[str]


class PricingPreviewOut(ResponseModel):
    lines: list[SubscriptionLineOut]
    amount_untaxed: Decimal
    amount_discount: Decimal
    amount_tax: Decimal
    amount_total: Decimal
    discount_applied: bool
    discount_skipped_reason: str | None


class EventOut(ResponseModel):
    id: int
    action: str
    actor_type: str
    actor_name: str | None
    data: dict
    created_at: datetime
