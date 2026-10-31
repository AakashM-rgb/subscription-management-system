"""Request/response schemas. Requests forbid unknown fields (no mass-assignment of e.g. role)."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.security import password_problems

MoneyIn = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PageOut[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


def _check_password(value: str) -> str:
    problems = password_problems(value)
    if problems:
        raise ValueError("Password " + ", ".join(problems))
    return value


# ----------------------------------------------------------------------------- auth & users


class SignupIn(RequestModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    password: str

    _pw = field_validator("password")(_check_password)


class LoginIn(RequestModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class StaffCreateIn(SignupIn):
    pass


class UserUpdateIn(RequestModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    is_active: bool | None = None


class UserOut(ResponseModel):
    id: int
    email: str
    full_name: str
    role: Literal["admin", "staff", "customer"]
    is_active: bool
    created_at: datetime


class MeOut(UserOut):
    customer_id: int | None = None


# ----------------------------------------------------------------------------- shared refs


class TaxRef(ResponseModel):
    id: int
    name: str
    rate: Decimal
