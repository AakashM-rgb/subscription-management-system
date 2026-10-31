from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DB, Page, StaffUser
from app.errors import bad_request, not_found
from app.models import PaymentTerm, Plan, ProductVariant, QuotationTemplate, QuotationTemplateLine
from app.models import Product as ProductModel
from app.presenters import fetch_page, page_out
from app.schemas import PageOut
from app.schemas.quotations import TemplateCreateIn, TemplateLineIn, TemplateOut, TemplateUpdateIn
from app.services import audit
from app.services.subscriptions import get_active

router = APIRouter(prefix="/quotation-templates", tags=["quotations"])


def _lines(db, lines_in: list[TemplateLineIn]) -> list[QuotationTemplateLine]:
    result = []
    for seq, line in enumerate(lines_in):
        get_active(db, ProductModel, line.product_id, "Product")
        if line.variant_id is not None:
            variant = db.get(ProductVariant, line.variant_id)
            if variant is None or variant.product_id != line.product_id:
                raise bad_request(
                    f"Variant {line.variant_id} does not belong to product {line.product_id}"
                )
        result.append(
            QuotationTemplateLine(
                product_id=line.product_id,
                variant_id=line.variant_id,
                quantity=line.quantity,
                unit_price=line.unit_price,
                sequence=seq,
            )
        )
    return result


def _check_plan(db, plan_id: int, plan_quantity: int) -> None:
    plan = get_active(db, Plan, plan_id, "Plan")
    if plan_quantity < plan.min_quantity:
        raise bad_request(f"Plan '{plan.name}' requires a minimum quantity of {plan.min_quantity}")


@router.get("", response_model=PageOut[TemplateOut])
def list_templates(
    _: StaffUser, db: DB, page: Page, q: str | None = None, is_active: bool | None = None
) -> dict:
    stmt = select(QuotationTemplate).order_by(QuotationTemplate.name)
    if q:
        stmt = stmt.where(QuotationTemplate.name.ilike(f"%{q.strip()}%"))
    if is_active is not None:
        stmt = stmt.where(QuotationTemplate.is_active.is_(is_active))
    rows, total = fetch_page(db, stmt, page)
    return page_out([TemplateOut.model_validate(t) for t in rows], total, page)


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(body: TemplateCreateIn, user: StaffUser, db: DB) -> QuotationTemplate:
    _check_plan(db, body.plan_id, body.plan_quantity)
    if body.payment_term_id is not None:
        get_active(db, PaymentTerm, body.payment_term_id, "Payment term")
    template = QuotationTemplate(**body.model_dump(exclude={"lines"}), lines=_lines(db, body.lines))
    db.add(template)
    db.flush()
    audit.record(
        db,
        action="quotation_template.created",
        entity_type="quotation_template",
        entity_id=template.id,
        actor=user,
    )
    db.commit()
    db.refresh(template)
    return template


def _get(db, template_id: int) -> QuotationTemplate:
    template = db.get(QuotationTemplate, template_id)
    if template is None:
        raise not_found("Quotation template")
    return template


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: int, _: StaffUser, db: DB) -> QuotationTemplate:
    return _get(db, template_id)


@router.patch("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: int, body: TemplateUpdateIn, user: StaffUser, db: DB
) -> QuotationTemplate:
    template = _get(db, template_id)
    changes = body.model_dump(exclude_unset=True, exclude={"lines"})
    for field, value in changes.items():
        setattr(template, field, value)
    _check_plan(db, template.plan_id, template.plan_quantity)
    if template.payment_term_id is not None:
        get_active(db, PaymentTerm, template.payment_term_id, "Payment term")
    if body.lines is not None:
        template.lines = _lines(db, body.lines)
    audit.record(
        db,
        action="quotation_template.updated",
        entity_type="quotation_template",
        entity_id=template.id,
        actor=user,
        data={"fields": sorted(changes)},
    )
    db.commit()
    db.refresh(template)
    return template
