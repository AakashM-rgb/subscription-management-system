from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.deps import DB, AdminUser, Page, StaffUser
from app.errors import AppError, not_found
from app.models import Product, ProductVariant, Tax
from app.pagination import paginate
from app.schemas import PageOut
from app.schemas.catalog import (
    ProductCreateIn,
    ProductDetailOut,
    ProductOut,
    ProductType,
    ProductUpdateIn,
    VariantCreateIn,
    VariantOut,
    VariantUpdateIn,
)
from app.services.common import apply_changes, commit_or_conflict

router = APIRouter(prefix="/products", tags=["products"])

DUPLICATE_VARIANT = "This product already has a variant with that attribute and value"


def check_tax(db: Session, tax_id: int | None) -> None:
    if tax_id is None:
        return
    tax = db.get(Tax, tax_id)
    if tax is None or not tax.is_active:
        raise AppError(422, "VALIDATION_ERROR", "tax_id must reference an active tax")


def load_product(db: Session, product_id: int) -> Product:
    product = db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.variants), selectinload(Product.tax))
        .execution_options(populate_existing=True)
    )
    if product is None:
        raise not_found("Product")
    return product


@router.get("", response_model=PageOut[ProductOut])
def list_products(
    _: StaffUser,
    db: DB,
    page: Page,
    q: str | None = Query(default=None, max_length=100),
    product_type: ProductType | None = None,
    is_active: bool | None = None,
) -> dict:
    stmt = select(Product).options(selectinload(Product.tax)).order_by(Product.name, Product.id)
    if q:
        stmt = stmt.where(Product.name.ilike(f"%{q.strip()}%"))
    if product_type:
        stmt = stmt.where(Product.product_type == product_type)
    if is_active is not None:
        stmt = stmt.where(Product.is_active.is_(is_active))
    return paginate(db, stmt, page, ProductOut)


@router.post("", response_model=ProductDetailOut, status_code=201)
def create_product(body: ProductCreateIn, _: AdminUser, db: DB) -> Product:
    check_tax(db, body.tax_id)
    seen = set()
    for v in body.variants:
        key = (v.attribute.lower(), v.value.lower())
        if key in seen:
            raise AppError(409, "DUPLICATE", DUPLICATE_VARIANT)
        seen.add(key)
    product = Product(**body.model_dump(exclude={"variants"}))
    product.variants = [ProductVariant(**v.model_dump()) for v in body.variants]
    db.add(product)
    commit_or_conflict(db, DUPLICATE_VARIANT)
    return load_product(db, product.id)


@router.get("/{product_id}", response_model=ProductDetailOut)
def get_product(product_id: int, _: StaffUser, db: DB) -> Product:
    return load_product(db, product_id)


@router.patch("/{product_id}", response_model=ProductDetailOut)
def update_product(product_id: int, body: ProductUpdateIn, _: AdminUser, db: DB) -> Product:
    """Price changes apply to subscriptions created afterwards; existing subscription and
    invoice lines keep the price they were sold at. Products are archived, never deleted."""
    product = load_product(db, product_id)
    if "tax_id" in body.model_fields_set:
        check_tax(db, body.tax_id)
    apply_changes(product, body)
    db.commit()
    db.expire_all()
    return load_product(db, product_id)


@router.post("/{product_id}/variants", response_model=VariantOut, status_code=201)
def add_variant(product_id: int, body: VariantCreateIn, _: AdminUser, db: DB) -> ProductVariant:
    product = load_product(db, product_id)
    variant = ProductVariant(product_id=product.id, **body.model_dump())
    db.add(variant)
    commit_or_conflict(db, DUPLICATE_VARIANT)
    db.refresh(variant)
    return variant


@router.patch("/{product_id}/variants/{variant_id}", response_model=VariantOut)
def update_variant(
    product_id: int, variant_id: int, body: VariantUpdateIn, _: AdminUser, db: DB
) -> ProductVariant:
    variant = db.get(ProductVariant, variant_id)
    if variant is None or variant.product_id != product_id:
        raise not_found("Variant")
    apply_changes(variant, body)
    commit_or_conflict(db, DUPLICATE_VARIANT)
    db.refresh(variant)
    return variant
