from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas import MoneyIn, RequestModel, ResponseModel


class TemplateLineIn(RequestModel):
    product_id: int
    variant_id: int | None = None
    quantity: int = Field(ge=1, le=1_000_000)
    unit_price: MoneyIn | None = None


class TemplateCreateIn(RequestModel):
    name: str = Field(min_length=1, max_length=120)
    plan_id: int
    plan_quantity: int = Field(default=1, ge=1, le=1_000_000)
    payment_term_id: int | None = None
    term_periods: int | None = Field(default=None, ge=1, le=1200)
    validity_days: int = Field(ge=1, le=365)
    notes: str | None = None
    lines: list[TemplateLineIn] = []


class TemplateUpdateIn(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    plan_id: int | None = None
    plan_quantity: int | None = Field(default=None, ge=1, le=1_000_000)
    payment_term_id: int | None = None
    term_periods: int | None = Field(default=None, ge=1, le=1200)
    validity_days: int | None = Field(default=None, ge=1, le=365)
    notes: str | None = None
    is_active: bool | None = None
    lines: list[TemplateLineIn] | None = None


class TemplateLineOut(ResponseModel):
    id: int
    product_id: int
    variant_id: int | None
    quantity: int
    unit_price: Decimal | None


class TemplateOut(ResponseModel):
    id: int
    name: str
    plan_id: int
    plan_quantity: int
    payment_term_id: int | None
    term_periods: int | None
    validity_days: int
    notes: str | None
    is_active: bool
    lines: list[TemplateLineOut]
    created_at: datetime
