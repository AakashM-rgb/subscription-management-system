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
