from datetime import date
from typing import Literal

from fastapi import APIRouter
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.deps import DB, AdminUser, Page, StaffUser
from app.errors import AppError, not_found
from app.models import Discount, Product
from app.schemas import PageOut
from app.schemas.discounts import (
    DiscountCreateIn,
    DiscountOut,
    DiscountUpdateIn,
    check_discount_fields,
)
from app.services.common import apply_audited, audited_add, business_today

router = APIRouter(prefix="/discounts", tags=["discounts"])

DiscountState = Literal["active", "scheduled", "expired", "exhausted", "inactive"]


def discount_state(discount: Discount, on: date) -> DiscountState:
    if not discount.is_active:
        return "inactive"
    if discount.usage_limit is not None and discount.usage_count >= discount.usage_limit:
        return "exhausted"
    if discount.valid_until is not None and on > discount.valid_until:
        return "expired"
    if on < discount.valid_from:
        return "scheduled"
    return "active"


def usable_on(on: date) -> Select[tuple[Discount]]:
    return select(Discount).where(
        Discount.is_active.is_(True),
        Discount.valid_from <= on,
        or_(Discount.valid_until.is_(None), Discount.valid_until >= on),
        or_(Discount.usage_limit.is_(None), Discount.usage_count < Discount.usage_limit),
    )


_FIELDS = (
    "id name kind value scope min_purchase_amount min_quantity valid_from valid_until "
    "usage_limit usage_count is_active created_at"
).split()


def to_out(discount: Discount, today: date) -> DiscountOut:
    data = {f: getattr(discount, f) for f in _FIELDS}
    data["products"] = [{"id": p.id, "name": p.name} for p in discount.products]
    data["state"] = discount_state(discount, today)
    return DiscountOut.model_validate(data)


def load_products(db: Session, product_ids: list[int]) -> list[Product]:
    unique_ids = sorted(set(product_ids))
    products = list(db.scalars(select(Product).where(Product.id.in_(unique_ids))))
    if len(products) != len(unique_ids):
        raise AppError(422, "VALIDATION_ERROR", "product_ids contains unknown products")
    return products


def load_discount(db: Session, discount_id: int, for_update: bool = False) -> Discount:
    stmt = (
        select(Discount)
        .where(Discount.id == discount_id)
        .options(selectinload(Discount.products))
        .execution_options(populate_existing=True)
    )
    if for_update:
        stmt = stmt.with_for_update(of=Discount)
    discount = db.scalar(stmt)
    if discount is None:
        raise not_found("Discount")
    return discount


@router.get("", response_model=PageOut[DiscountOut])
def list_discounts(
    _: StaffUser,
    db: DB,
    page: Page,
    is_active: bool | None = None,
    scope: str | None = None,
    usable_on_date: date | None = None,
) -> dict:
    """`usable_on_date` keeps only rules that would apply on that date (active, in their
    validity window and not exhausted)."""
    stmt = usable_on(usable_on_date) if usable_on_date else select(Discount)
    if is_active is not None:
        stmt = stmt.where(Discount.is_active.is_(is_active))
    if scope in ("subscription", "product"):
        stmt = stmt.where(Discount.scope == scope)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.options(selectinload(Discount.products))
        .order_by(Discount.id.desc())
        .limit(page.page_size)
        .offset(page.offset)
    ).all()
    today = business_today()
    return {
        "items": [to_out(d, today) for d in rows],
        "total": total,
        "page": page.page,
        "page_size": page.page_size,
    }


@router.post("", response_model=DiscountOut, status_code=201)
def create_discount(body: DiscountCreateIn, admin: AdminUser, db: DB) -> DiscountOut:
    """Only the admin creates discount rules."""
    discount = Discount(**body.model_dump(exclude={"product_ids"}))
    discount.products = load_products(db, body.product_ids) if body.product_ids else []
    audited_add(
        db,
        discount,
        entity_type="discount",
        actor=admin,
        conflict="Could not create the discount",
        data=body.model_dump(mode="json"),
    )
    return to_out(load_discount(db, discount.id), business_today())


@router.get("/{discount_id}", response_model=DiscountOut)
def get_discount(discount_id: int, _: StaffUser, db: DB) -> DiscountOut:
    return to_out(load_discount(db, discount_id), business_today())


@router.patch("/{discount_id}", response_model=DiscountOut)
def update_discount(
    discount_id: int, body: DiscountUpdateIn, admin: AdminUser, db: DB
) -> DiscountOut:
    """Changes affect invoices generated afterwards; issued invoices keep their amounts.
    The row is locked so the usage check cannot race invoice generation."""
    discount = load_discount(db, discount_id, for_update=True)
    fields = body.model_fields_set

    def merged(name: str):
        return getattr(body, name) if name in fields else getattr(discount, name)

    product_ids = (
        body.product_ids
        if "product_ids" in fields and body.product_ids is not None
        else [p.id for p in discount.products]
    )
    try:
        check_discount_fields(
            merged("kind") or discount.kind,
            merged("value") or discount.value,
            merged("scope") or discount.scope,
            product_ids,
            merged("valid_from") or discount.valid_from,
            merged("valid_until"),
        )
    except ValueError as exc:
        raise AppError(422, "VALIDATION_ERROR", str(exc)) from exc
    limit = merged("usage_limit")
    if limit is not None and limit < discount.usage_count:
        raise AppError(
            409,
            "INVALID_STATE",
            f"usage_limit cannot be below the {discount.usage_count} uses already counted",
        )
    before_ids = sorted(p.id for p in discount.products)
    after_ids = sorted(set(product_ids)) if "product_ids" in fields else before_ids
    apply_audited(
        db,
        discount,
        body,
        entity_type="discount",
        actor=admin,
        exclude={"product_ids"},
        extra={"product_ids": {"from": before_ids, "to": after_ids}}
        if after_ids != before_ids
        else None,
    )
    if "product_ids" in fields:
        discount.products = load_products(db, product_ids) if product_ids else []
    db.commit()
    db.expire_all()
    return to_out(load_discount(db, discount_id), business_today())
