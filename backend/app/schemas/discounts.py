"""Discount rule schemas (Claude 2). usage_count is read-only: billing consumes uses."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from app.schemas import MoneyIn, RequestModel, ResponseModel

PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]


class DiscountCreateIn(RequestModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    kind: Literal["fixed", "percentage"]
    value: PositiveMoney
    scope: Literal["subscription", "product"]
    product_ids: list[int] = Field(default_factory=list, max_length=200)
    min_purchase_amount: MoneyIn | None = None
    min_quantity: int | None = Field(default=None, ge=1)
    valid_from: date
    valid_until: date | None = None
    usage_limit: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        check_discount_fields(
            self.kind, self.value, self.scope, self.product_ids, self.valid_from, self.valid_until
        )
        return self


class DiscountUpdateIn(RequestModel):
    name: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    kind: Literal["fixed", "percentage"] | None = None
    value: PositiveMoney | None = None
    scope: Literal["subscription", "product"] | None = None
    product_ids: list[int] | None = Field(default=None, max_length=200)
    min_purchase_amount: MoneyIn | None = None
    min_quantity: int | None = Field(default=None, ge=1)
    valid_from: date | None = None
    valid_until: date | None = None
    usage_limit: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


def check_discount_fields(
    kind: str,
    value: Decimal,
    scope: str,
    product_ids: list[int],
    valid_from: date,
    valid_until: date | None,
) -> None:
    if kind == "percentage" and value > 100:
        raise ValueError("a percentage discount cannot exceed 100")
    if scope == "product" and not product_ids:
        raise ValueError("a product discount needs at least one product")
    if scope == "subscription" and product_ids:
        raise ValueError("a subscription-wide discount cannot list products")
    if valid_until is not None and valid_until < valid_from:
        raise ValueError("valid_until must be on or after valid_from")


class ProductRef(ResponseModel):
    id: int
    name: str


class DiscountOut(ResponseModel):
    id: int
    name: str
    kind: Literal["fixed", "percentage"]
    value: Decimal
    scope: Literal["subscription", "product"]
    products: list[ProductRef]
    min_purchase_amount: Decimal | None
    min_quantity: int | None
    valid_from: date
    valid_until: date | None
    usage_limit: int | None
    usage_count: int
    is_active: bool
    state: Literal["active", "scheduled", "expired", "exhausted", "inactive"]
    created_at: datetime
