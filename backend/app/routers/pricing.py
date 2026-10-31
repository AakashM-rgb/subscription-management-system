from fastapi import APIRouter

from app.deps import DB, StaffUser
from app.models import Discount, Plan
from app.schemas import TaxRef
from app.schemas.subscriptions import PricingPreviewIn, PricingPreviewOut, SubscriptionLineOut
from app.services.periods import business_today
from app.services.pricing import price
from app.services.subscriptions import build_lines, discount_rule, get_active, price_lines

router = APIRouter(prefix="/pricing", tags=["pricing"])


@router.post("/preview", response_model=PricingPreviewOut)
def preview(body: PricingPreviewIn, _: StaffUser, db: DB) -> PricingPreviewOut:
    """Server-side totals for a draft offer. Nothing is saved; the UI never computes money."""
    plan = get_active(db, Plan, body.plan_id, "Plan")
    lines = build_lines(db, plan, body.plan_quantity, body.lines)
    discount = get_active(db, Discount, body.discount_id, "Discount") if body.discount_id else None
    result = price(price_lines(lines), discount_rule(discount), body.on or business_today())
    return PricingPreviewOut(
        lines=[
            SubscriptionLineOut(
                line_type=line.line_type,
                product_id=line.product_id,
                variant_id=line.variant_id,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                tax=TaxRef.model_validate(line.tax) if line.tax else None,
                subtotal=priced.subtotal,
                discount_amount=priced.discount_amount,
                tax_amount=priced.tax_amount,
                total=priced.total,
            )
            for line, priced in zip(lines, result.lines, strict=True)
        ],
        amount_untaxed=result.amount_untaxed,
        amount_discount=result.amount_discount,
        amount_tax=result.amount_tax,
        amount_total=result.amount_total,
        discount_applied=result.discount_applied is not None,
        discount_skipped_reason=result.discount_skipped_reason,
    )
