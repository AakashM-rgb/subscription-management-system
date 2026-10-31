"""Customer schemas (Claude 2)."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import EmailStr, Field

from app.schemas import RequestModel, ResponseModel

Name = Annotated[str, Field(min_length=1, max_length=160)]


class CustomerCreateIn(RequestModel):
    name: Name
    email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    company_name: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=2000)
    tax_id: str | None = Field(default=None, max_length=32)


class CustomerUpdateIn(RequestModel):
    name: Name | None = None
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    company_name: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=2000)
    tax_id: str | None = Field(default=None, max_length=32)
    is_active: bool | None = None


class CustomerOut(ResponseModel):
    id: int
    user_id: int | None
    name: str
    email: str
    phone: str | None
    company_name: str | None
    address: str | None
    tax_id: str | None
    is_active: bool
    created_at: datetime


class CustomerBalanceOut(ResponseModel):
    customer_id: int
    outstanding_amount: Decimal
    overdue_amount: Decimal
    overdue_count: int
    open_invoice_count: int
