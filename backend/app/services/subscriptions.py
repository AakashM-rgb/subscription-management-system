"""Subscription creation, quotation workflow and lifecycle (draft -> quotation -> confirmed ->
active -> closed), plus pause/resume/renew, and the activation and expiry sweeps."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import AppError, bad_request, invalid_state, not_found
from app.models import (
    Customer,
    Discount,
    PaymentTerm,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    Subscription,
    SubscriptionLine,
    User,
)
from app.schemas.subscriptions import LineIn, SubscriptionCreateIn, SubscriptionUpdateIn
from app.services import audit
from app.services.periods import (
    end_date_for,
    period_index_containing,
    period_start,
    periods_in_term,
)
from app.services.pricing import DiscountRule, PriceLine, PricingResult, price

EDITABLE = ("draft", "quotation")


def _now() -> datetime:
    return datetime.now(UTC)


# ----------------------------------------------------------------------------- pricing glue


def discount_rule(discount: Discount | None) -> DiscountRule | None:
    if discount is None:
        return None
    return DiscountRule(
        id=discount.id,
        name=discount.name,
        kind=discount.kind,
        value=discount.value,
        scope=discount.scope,
        product_ids=frozenset(p.id for p in discount.products),
        min_purchase_amount=discount.min_purchase_amount,
        min_quantity=discount.min_quantity,
        valid_from=discount.valid_from,
        valid_until=discount.valid_until,
        usage_limit=discount.usage_limit,
        usage_count=discount.usage_count,
        is_active=discount.is_active,
    )


def price_lines(lines: list[SubscriptionLine]) -> list[PriceLine]:
    return [
        PriceLine(
            line_type=line.line_type,
            product_id=line.product_id,
            quantity=line.quantity,
            unit_price=line.unit_price,
            tax_rate=line.tax.rate if line.tax else Decimal("0"),
            tax_name=line.tax.name if line.tax else None,
        )
        for line in lines
    ]


def recompute_amounts(sub: Subscription, on: date) -> PricingResult:
    """Refresh the cached per-period amounts shown on the subscription (server-side only)."""
    result = price(price_lines(sub.lines), discount_rule(sub.discount), on)
    for line, priced in zip(sub.lines, result.lines, strict=True):
        line.subtotal = priced.subtotal
        line.discount_amount = priced.discount_amount
        line.tax_amount = priced.tax_amount
        line.total = priced.total
    sub.amount_untaxed = result.amount_untaxed
    sub.amount_discount = result.amount_discount
    sub.amount_tax = result.amount_tax
    sub.amount_total = result.amount_total
    return result


# ----------------------------------------------------------------------------- lookups


def get_active(db: Session, model, entity_id: int | None, label: str):
    obj = db.get(model, entity_id) if entity_id is not None else None
    if obj is None or not getattr(obj, "is_active", True):
        raise bad_request(f"{label} {entity_id} does not exist or is inactive")
    return obj


def lock_subscription(db: Session, subscription_id: int) -> Subscription:
    sub = db.scalar(
        select(Subscription)
        .where(Subscription.id == subscription_id)
        .with_for_update(of=Subscription)
        .execution_options(populate_existing=True)  # use the locked row, not cached values
    )
    if sub is None:
        raise not_found("Subscription")
    return sub


def build_lines(
    db: Session, plan: Plan, plan_quantity: int, lines_in: list[LineIn]
) -> list[SubscriptionLine]:
    if plan_quantity < plan.min_quantity:
        raise bad_request(f"Plan '{plan.name}' requires a minimum quantity of {plan.min_quantity}")
    lines = [
        SubscriptionLine(
            line_type="plan",
            description=f"{plan.name} ({plan.billing_period} plan)",
            quantity=plan_quantity,
            unit_price=plan.price,
            tax_id=plan.tax_id,
            tax=plan.tax,
            sequence=0,
        )
    ]
    for seq, line_in in enumerate(lines_in, start=1):
        product = get_active(db, Product, line_in.product_id, "Product")
        variant = None
        if line_in.variant_id is not None:
            variant = db.get(ProductVariant, line_in.variant_id)
            if variant is None or variant.product_id != product.id or not variant.is_active:
                raise bad_request(
                    f"Variant {line_in.variant_id} does not belong to product {product.id}"
                )
        unit_price = line_in.unit_price
        if unit_price is None:
            unit_price = product.sales_price + (variant.extra_price if variant else Decimal("0"))
        description = line_in.description or (
            f"{product.name} ({variant.attribute}: {variant.value})" if variant else product.name
        )
        lines.append(
            SubscriptionLine(
                line_type="product",
                product_id=product.id,
                variant_id=variant.id if variant else None,
                description=description,
                quantity=line_in.quantity,
                unit_price=unit_price,
                tax_id=product.tax_id,
                tax=product.tax,
                sequence=seq,
            )
        )
    return lines


def _template_lines(template: QuotationTemplate) -> list[LineIn]:
    return [
        LineIn(
            product_id=t.product_id,
            variant_id=t.variant_id,
            quantity=t.quantity,
            unit_price=t.unit_price,
        )
        for t in template.lines
    ]


def _next_number(db: Session) -> str:
    return f"SUB-{db.scalar(select(func.nextval('subscription_number_seq'))):06d}"


# ----------------------------------------------------------------------------- create / edit


def create_subscription(
    db: Session, data: SubscriptionCreateIn, actor: User, today: date
) -> Subscription:
    template = None
    if data.template_id is not None:
        template = get_active(db, QuotationTemplate, data.template_id, "Quotation template")
    plan_id = data.plan_id or (template.plan_id if template else None)
    term_periods = data.term_periods or (template.term_periods if template else None)
    payment_term_id = data.payment_term_id or (template.payment_term_id if template else None)
    if plan_id is None or term_periods is None or payment_term_id is None:
        raise bad_request("plan_id, term_periods and payment_term_id are required")

    customer = get_active(db, Customer, data.customer_id, "Customer")
    plan = get_active(db, Plan, plan_id, "Plan")
    get_active(db, PaymentTerm, payment_term_id, "Payment term")
    plan_quantity = data.plan_quantity or (
        template.plan_quantity if template else plan.min_quantity
    )
    lines_in = (
        data.lines if data.lines is not None else (_template_lines(template) if template else [])
    )

    sub = Subscription(
        number=_next_number(db),
        customer=customer,
        plan=plan,
        payment_term_id=payment_term_id,
        template_id=template.id if template else None,
        status="draft",
        start_date=data.start_date,
        term_periods=term_periods,
        end_date=end_date_for(data.start_date, plan.billing_period, term_periods),
        notes=data.notes,
        created_by=actor.id,
    )
    sub.lines = build_lines(db, plan, plan_quantity, lines_in)
    if data.discount_id is not None:
        sub.discount = get_active(db, Discount, data.discount_id, "Discount")
    db.add(sub)
    recompute_amounts(sub, today)
    db.flush()
    audit.record(
        db,
        action="subscription.created",
        entity_type="subscription",
        entity_id=sub.id,
        actor=actor,
        data={"number": sub.number, "template_id": sub.template_id},
    )
    return sub


def update_subscription(
    db: Session, sub: Subscription, data: SubscriptionUpdateIn, actor: User, today: date
) -> Subscription:
    if sub.status not in EDITABLE:
        raise invalid_state("Only draft or quotation subscriptions can be edited")
    changes = data.model_dump(exclude_unset=True)
    if "customer_id" in changes:
        sub.customer = get_active(db, Customer, data.customer_id, "Customer")
    if "payment_term_id" in changes:
        sub.payment_term_id = get_active(db, PaymentTerm, data.payment_term_id, "Payment term").id
    if "notes" in changes:
        sub.notes = data.notes
    plan = sub.plan
    if "plan_id" in changes:
        plan = get_active(db, Plan, data.plan_id, "Plan")
        sub.plan = plan
    if "start_date" in changes:
        sub.start_date = data.start_date
    if "term_periods" in changes:
        sub.term_periods = data.term_periods
    sub.end_date = end_date_for(sub.start_date, plan.billing_period, sub.term_periods)

    plan_line = next(line for line in sub.lines if line.line_type == "plan")
    if {"plan_id", "plan_quantity", "lines"} & changes.keys():
        quantity = data.plan_quantity or plan_line.quantity
        current = [
            LineIn(
                product_id=line.product_id,
                variant_id=line.variant_id,
                quantity=line.quantity,
                unit_price=line.unit_price,
                description=line.description,
            )
            for line in sub.lines
            if line.line_type == "product"
        ]
        sub.lines = build_lines(db, plan, quantity, data.lines if "lines" in changes else current)
    if sub.status == "quotation":
        # A changed offer must be re-sent before the customer can accept it.
        sub.status = "draft"
        sub.quotation_valid_until = None
    recompute_amounts(sub, today)
    audit.record(
        db,
        action="subscription.updated",
        entity_type="subscription",
        entity_id=sub.id,
        actor=actor,
        data={"fields": sorted(changes)},
    )
    return sub


def set_discount(
    db: Session, sub: Subscription, discount_id: int | None, actor: User, today: date
) -> Subscription:
    if sub.status == "closed":
        raise invalid_state("A closed subscription cannot be changed")
    sub.discount = get_active(db, Discount, discount_id, "Discount") if discount_id else None
    recompute_amounts(sub, today)
    audit.record(
        db,
        action="subscription.discount_set",
        entity_type="subscription",
        entity_id=sub.id,
        actor=actor,
        data={"discount_id": discount_id},
    )
    return sub


# ----------------------------------------------------------------------------- lifecycle


def is_expired(sub: Subscription, today: date) -> bool:
    return sub.status == "active" and today > sub.end_date


def _quotation_expired(sub: Subscription, today: date) -> bool:
    return (
        sub.status == "quotation"
        and sub.quotation_valid_until is not None
        and today > sub.quotation_valid_until
    )


def _validate_offer(sub: Subscription) -> None:
    plan = sub.plan
    if not plan.is_active:
        raise invalid_state(f"Plan '{plan.name}' is no longer active")
    if sub.start_date < plan.available_from or (
        plan.available_until and sub.start_date > plan.available_until
    ):
        raise invalid_state(f"Plan '{plan.name}' is not available on {sub.start_date}")
    plan_line = next((line for line in sub.lines if line.line_type == "plan"), None)
    if plan_line is None or plan_line.quantity < plan.min_quantity:
        raise invalid_state(f"Plan '{plan.name}' requires at least {plan.min_quantity} seats")


def _event(db: Session, sub: Subscription, action: str, actor: User | None, **data) -> None:
    audit.record(
        db,
        action=f"subscription.{action}",
        entity_type="subscription",
        entity_id=sub.id,
        actor=actor,
        data={k: (v.isoformat() if isinstance(v, date) else v) for k, v in data.items()},
    )


def send_quotation(db: Session, sub: Subscription, actor: User, today: date) -> Subscription:
    if sub.status not in EDITABLE:
        raise invalid_state("Only draft or quotation subscriptions can be sent as a quotation")
    _validate_offer(sub)
    template = db.get(QuotationTemplate, sub.template_id) if sub.template_id else None
    validity = template.validity_days if template else get_settings().quotation_validity_days
    from_status = sub.status
    sub.status = "quotation"
    sub.quotation_valid_until = today + timedelta(days=validity)
    _event(
        db,
        sub,
        "quotation_sent",
        actor,
        from_status=from_status,
        valid_until=sub.quotation_valid_until,
    )
    return sub


def _activate(db: Session, sub: Subscription, actor: User | None) -> None:
    sub.status = "active"
    sub.activated_at = _now()
    sub.next_period_index = 0
    sub.next_invoice_date = sub.start_date
    _event(db, sub, "activated", actor)


def confirm(db: Session, sub: Subscription, actor: User, today: date) -> Subscription:
    if sub.status not in EDITABLE:
        raise invalid_state("Only draft or quotation subscriptions can be confirmed")
    if _quotation_expired(sub, today):
        raise AppError(409, "QUOTATION_EXPIRED", "This quotation has expired; send it again")
    _validate_offer(sub)
    from_status = sub.status
    sub.status = "confirmed"
    sub.confirmed_at = _now()
    _event(db, sub, "confirmed", actor, from_status=from_status)
    if sub.start_date <= today:
        _activate(db, sub, actor)
    return sub


def pause(db: Session, sub: Subscription, actor: User, today: date) -> Subscription:
    if sub.status != "active" or sub.paused_at is not None:
        raise invalid_state("Only an active, running subscription can be paused")
    if not sub.plan.pausable:
        raise invalid_state(f"Plan '{sub.plan.name}' does not allow pausing")
    if is_expired(sub, today):
        raise invalid_state("An expired subscription cannot be paused; renew or close it")
    sub.paused_at = _now()
    _event(db, sub, "paused", actor)
    return sub


def resume(db: Session, sub: Subscription, actor: User, today: date) -> Subscription:
    if sub.status != "active" or sub.paused_at is None:
        raise invalid_state("Only a paused subscription can be resumed")
    period = sub.plan.billing_period
    current = period_index_containing(sub.start_date, period, today)
    skipped = []
    if current > sub.next_period_index:
        # Periods that started entirely while paused are intentionally not billed; the period
        # containing the resume date is billed on the next run.
        skipped = [
            period_start(sub.start_date, period, k).isoformat()
            for k in range(sub.next_period_index, current)
        ]
        sub.next_period_index = current
        sub.next_invoice_date = period_start(sub.start_date, period, current)
    sub.paused_at = None
    _event(db, sub, "resumed", actor, skipped_periods=skipped)
    return sub


def renew(db: Session, sub: Subscription, actor: User, today: date) -> Subscription:
    if sub.status != "active":
        raise invalid_state("Only an active subscription can be renewed")
    if not sub.plan.renewable:
        raise invalid_state(f"Plan '{sub.plan.name}' is not renewable")
    period = sub.plan.billing_period
    old_end = sub.end_date
    covered = periods_in_term(sub.start_date, period, old_end)
    sub.end_date = end_date_for(sub.start_date, period, covered + sub.term_periods)
    _event(db, sub, "renewed", actor, old_end_date=old_end, new_end_date=sub.end_date)
    return sub


def close(
    db: Session,
    sub: Subscription,
    actor: User | None,
    today: date,
    reason: str | None = None,
    *,
    system: bool = False,
) -> Subscription:
    if sub.status == "closed":
        raise invalid_state("Subscription is already closed")
    if (
        sub.status == "active"
        and not system
        and not is_expired(sub, today)
        and not sub.plan.closable
    ):
        raise invalid_state(f"Plan '{sub.plan.name}' cannot be closed before its expiry date")
    from_status = sub.status
    default_reason = "cancelled" if from_status in (*EDITABLE, "confirmed") else "closed_early"
    sub.status = "closed"
    sub.closed_at = _now()
    sub.paused_at = None
    sub.close_reason = reason or default_reason
    _event(db, sub, "closed", actor, from_status=from_status, reason=sub.close_reason)
    return sub


def available_actions(sub: Subscription, role: str, today: date) -> list[str]:
    plan = sub.plan
    expired = is_expired(sub, today)
    actions: list[str] = []
    if role == "customer":
        if sub.status == "quotation" and not _quotation_expired(sub, today):
            actions.append("accept")
    else:
        if sub.status in EDITABLE:
            actions += ["edit", "send_quotation"]
            if not _quotation_expired(sub, today):
                actions.append("confirm")
            actions.append("close")
        elif sub.status == "confirmed":
            actions.append("close")
    if sub.status == "active":
        if sub.paused_at is not None:
            actions.append("resume")
        elif plan.pausable and not expired:
            actions.append("pause")
        if plan.renewable:
            actions.append("renew")
        if plan.closable or expired:
            actions.append("close")
        if (
            role != "customer"
            and sub.paused_at is None
            and sub.next_invoice_date is not None
            and sub.next_invoice_date <= min(today, sub.end_date)
        ):
            actions.append("bill_now")
    if role != "customer" and sub.status != "closed":
        actions.append("set_discount")
    return actions


# ----------------------------------------------------------------------------- sweeps


def activate_due(db: Session, today: date) -> int:
    subs = db.scalars(
        select(Subscription)
        .where(Subscription.status == "confirmed", Subscription.start_date <= today)
        .with_for_update(skip_locked=True, of=Subscription)
        .execution_options(populate_existing=True)
    ).all()
    for sub in subs:
        _activate(db, sub, None)
    return len(subs)


def auto_close_expired(db: Session, today: date) -> int:
    """Close expired subscriptions of auto-close plans once every period up to expiry is billed."""
    subs = db.scalars(
        select(Subscription)
        .join(Plan, Subscription.plan_id == Plan.id)
        .where(
            Subscription.status == "active",
            Plan.auto_close.is_(True),
            Subscription.end_date < today,
        )
        .with_for_update(skip_locked=True, of=Subscription)
        .execution_options(populate_existing=True)
    ).all()
    closed = 0
    for sub in subs:
        fully_billed = sub.next_invoice_date is None or sub.next_invoice_date > sub.end_date
        if fully_billed or sub.paused_at is not None:
            close(db, sub, None, today, "expired", system=True)
            closed += 1
    return closed
