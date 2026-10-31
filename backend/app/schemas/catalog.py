"""Taxes, payment terms, products, variants and plans (Claude 2)."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from app.schemas import MoneyIn, RequestModel, ResponseModel, TaxRef

Name = Annotated[str, Field(min_length=1, max_length=160)]
ShortName = Annotated[str, Field(min_length=1, max_length=60)]
Notes = Annotated[str, Field(max_length=5000)]
TaxRateIn = Annotated[Decimal, Field(ge=0, le=100, max_digits=6, decimal_places=3)]
ProductType = Literal["service", "goods"]
BillingPeriod = Literal["daily", "weekly", "monthly", "yearly"]


class TaxCreateIn(RequestModel):
    name: ShortName
    rate: TaxRateIn


class TaxUpdateIn(RequestModel):
    name: ShortName | None = None
    rate: TaxRateIn | None = None
    is_active: bool | None = None


class TaxOut(ResponseModel):
    id: int
    name: str
    rate: Decimal
    is_active: bool


class PaymentTermCreateIn(RequestModel):
    name: ShortName
    due_days: int = Field(ge=0, le=365)


class PaymentTermUpdateIn(RequestModel):
    name: ShortName | None = None
    due_days: int | None = Field(default=None, ge=0, le=365)
    is_active: bool | None = None


class PaymentTermOut(ResponseModel):
    id: int
    name: str
    due_days: int
    is_active: bool


class VariantCreateIn(RequestModel):
    attribute: ShortName
    value: ShortName
    extra_price: MoneyIn = Decimal("0.00")


class VariantUpdateIn(RequestModel):
    attribute: ShortName | None = None
    value: ShortName | None = None
    extra_price: MoneyIn | None = None
    is_active: bool | None = None


class VariantOut(ResponseModel):
    id: int
    product_id: int
    attribute: str
    value: str
    extra_price: Decimal
    is_active: bool


class ProductCreateIn(RequestModel):
    name: Name
    product_type: ProductType
    sales_price: MoneyIn
    cost_price: MoneyIn
    notes: Notes | None = None
    tax_id: int | None = None
    variants: list[VariantCreateIn] = Field(default_factory=list, max_length=50)


class ProductUpdateIn(RequestModel):
    name: Name | None = None
    product_type: ProductType | None = None
    sales_price: MoneyIn | None = None
    cost_price: MoneyIn | None = None
    notes: Notes | None = None
    tax_id: int | None = None
    is_active: bool | None = None


class ProductOut(ResponseModel):
    id: int
    name: str
    product_type: ProductType
    sales_price: Decimal
    cost_price: Decimal
    notes: str | None
    tax: TaxRef | None
    is_active: bool
    created_at: datetime


class ProductDetailOut(ProductOut):
    variants: list[VariantOut]


class PlanCreateIn(RequestModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    price: MoneyIn
    billing_period: BillingPeriod
    min_quantity: int = Field(default=1, ge=1, le=100_000)
    available_from: date
    available_until: date | None = None
    auto_close: bool = False
    closable: bool = True
    pausable: bool = False
    renewable: bool = True
    tax_id: int | None = None

    @model_validator(mode="after")
    def _window(self) -> Self:
        if self.available_until is not None and self.available_until < self.available_from:
            raise ValueError("available_until must be on or after available_from")
        return self


class PlanUpdateIn(RequestModel):
    name: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    price: MoneyIn | None = None
    billing_period: BillingPeriod | None = None
    min_quantity: int | None = Field(default=None, ge=1, le=100_000)
    available_from: date | None = None
    available_until: date | None = None
    auto_close: bool | None = None
    closable: bool | None = None
    pausable: bool | None = None
    renewable: bool | None = None
    tax_id: int | None = None
    is_active: bool | None = None


class PlanOut(ResponseModel):
    id: int
    name: str
    price: Decimal
    billing_period: BillingPeriod
    min_quantity: int
    available_from: date
    available_until: date | None
    auto_close: bool
    closable: bool
    pausable: bool
    renewable: bool
    tax: TaxRef | None
    is_active: bool
    created_at: datetime
