"""Payment schemas (Claude 2)."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field

from app.schemas import RequestModel, ResponseModel

PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
PaymentMethod = Literal["cash", "bank_transfer", "card", "upi", "cheque", "other"]


class PaymentCreateIn(RequestModel):
    invoice_id: int
    method: PaymentMethod
    amount: PositiveMoney
    payment_date: date
    note: str | None = Field(default=None, max_length=2000)


class PaymentVoidIn(RequestModel):
    reason: str = Field(min_length=3, max_length=2000)


class PaymentOut(ResponseModel):
    id: int
    number: str
    invoice_id: int
    invoice_number: str | None = None
    customer_id: int
    method: PaymentMethod
    amount: Decimal
    payment_date: date
    note: str | None
    status: Literal["posted", "voided"]
    recorded_by: int | None
    voided_at: datetime | None
    voided_by: int | None
    void_reason: str | None
    created_at: datetime


class PortalPaymentOut(ResponseModel):
    """What a customer sees about their own payments: no staff ids or internal notes."""

    id: int
    number: str
    invoice_id: int
    invoice_number: str | None = None
    method: PaymentMethod
    amount: Decimal
    payment_date: date
    status: Literal["posted", "voided"]


# ----------------------------------------------------------------------------- collections

MandateStatus = Literal["pending", "active", "paused", "cancelled", "failed"]


class MandateOut(ResponseModel):
    id: int
    customer_id: int
    provider: str
    status: MandateStatus
    method_type: str | None
    display_hint: str | None
    max_amount: Decimal | None
    authorized_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime


class PortalMandateOut(ResponseModel):
    id: int
    provider: str
    status: MandateStatus
    method_type: str | None
    display_hint: str | None
    max_amount: Decimal | None
    authorized_at: datetime | None
    created_at: datetime


class MandateStartIn(RequestModel):
    method_type: Literal["card", "upi"]
    max_amount: PositiveMoney | None = None


class MandateStartOut(ResponseModel):
    mandate: PortalMandateOut
    checkout: dict


class MandateConfirmIn(RequestModel):
    """Exactly what the provider's checkout handed back to the browser (e.g. Razorpay's
    razorpay_payment_id / razorpay_order_id / razorpay_signature). Verified server-side."""

    provider_response: dict[str, str] = Field(max_length=10)


class PaymentAttemptOut(ResponseModel):
    id: int
    invoice_id: int
    mandate_id: int
    provider: str
    provider_reference: str | None
    amount: Decimal
    status: Literal["created", "processing", "succeeded", "failed", "cancelled"]
    attempt_number: int
    failure_code: str | None
    failure_message: str | None
    next_retry_at: datetime | None
    created_at: datetime
    updated_at: datetime
