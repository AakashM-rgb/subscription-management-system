"""Invoice/subscription pricing: taxes and the single attached discount. Pure, no database.

Order per line: subtotal = qty * unit_price -> discount -> taxable -> tax (per-line, half-up).
Totals are sums of the rounded line values, which satisfies the invoice CHECK constraints
(total = untaxed - discount + tax; taxable = subtotal - discount; line total = taxable + tax).
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.money import ZERO, money


@dataclass(frozen=True)
class PriceLine:
    line_type: str  # "plan" | "product"
    product_id: int | None
    quantity: int
    unit_price: Decimal
    tax_rate: Decimal = ZERO
    tax_name: str | None = None


@dataclass(frozen=True)
class DiscountRule:
    id: int
    name: str
    kind: str  # "fixed" | "percentage"
    value: Decimal
    scope: str  # "subscription" | "product"
    product_ids: frozenset[int] = frozenset()
    min_purchase_amount: Decimal | None = None
    min_quantity: int | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    usage_limit: int | None = None
    usage_count: int = 0
    is_active: bool = True


@dataclass(frozen=True)
class PricedLine:
    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    tax_amount: Decimal
    total: Decimal


@dataclass
class PricingResult:
    lines: list[PricedLine]
    amount_untaxed: Decimal
    amount_discount: Decimal
    amount_tax: Decimal
    amount_total: Decimal
    discount_applied: DiscountRule | None = None
    discount_skipped_reason: str | None = None
    notes: list[str] = field(default_factory=list)


def _applicable_indexes(lines: list[PriceLine], rule: DiscountRule) -> list[int]:
    if rule.scope == "subscription":
        return list(range(len(lines)))
    return [
        i
        for i, line in enumerate(lines)
        if line.line_type == "product" and line.product_id in rule.product_ids
    ]


def discount_ineligibility(
    lines: list[PriceLine], subtotals: list[Decimal], rule: DiscountRule, on: date
) -> str | None:
    """Return why the discount does not apply on `on`, or None when it applies."""
    if not rule.is_active:
        return "inactive"
    if rule.valid_from and on < rule.valid_from:
        return "not_started"
    if rule.valid_until and on > rule.valid_until:
        return "expired"
    if rule.usage_limit is not None and rule.usage_count >= rule.usage_limit:
        return "usage_limit_reached"
    idx = _applicable_indexes(lines, rule)
    applicable_subtotal = sum((subtotals[i] for i in idx), ZERO)
    if not idx or applicable_subtotal <= ZERO:
        return "no_applicable_lines"
    if rule.min_purchase_amount is not None and applicable_subtotal < rule.min_purchase_amount:
        return "below_min_purchase"
    if rule.min_quantity is not None:
        if rule.scope == "subscription":
            # "A discount for taking more seats": whole-subscription rules count seats.
            seats = [lines[i].quantity for i in idx if lines[i].line_type == "plan"]
            quantity = sum(seats) if seats else sum(lines[i].quantity for i in idx)
        else:
            quantity = sum(lines[i].quantity for i in idx)
        if quantity < rule.min_quantity:
            return "below_min_quantity"
    return None


def _allocate_discount(
    subtotals: list[Decimal], idx: list[int], rule: DiscountRule
) -> list[Decimal]:
    discounts = [ZERO] * len(subtotals)
    if rule.kind == "percentage":
        for i in idx:
            discounts[i] = min(subtotals[i], money(subtotals[i] * rule.value / 100))
        return discounts
    base = sum((subtotals[i] for i in idx), ZERO)
    total = min(money(rule.value), base)
    for i in idx:
        discounts[i] = money(total * subtotals[i] / base)
    remainder = total - sum(discounts, ZERO)
    if remainder:
        largest = max(idx, key=lambda i: subtotals[i])
        discounts[largest] = min(subtotals[largest], discounts[largest] + remainder)
    return discounts


def price(lines: list[PriceLine], discount: DiscountRule | None, on: date) -> PricingResult:
    subtotals = [money(Decimal(line.quantity) * line.unit_price) for line in lines]
    discounts = [ZERO] * len(lines)
    applied: DiscountRule | None = None
    skipped: str | None = None
    if discount is not None:
        skipped = discount_ineligibility(lines, subtotals, discount, on)
        if skipped is None:
            discounts = _allocate_discount(
                subtotals, _applicable_indexes(lines, discount), discount
            )
            applied = discount

    priced: list[PricedLine] = []
    for line, subtotal, disc in zip(lines, subtotals, discounts, strict=True):
        taxable = subtotal - disc
        tax = money(taxable * line.tax_rate / 100)
        priced.append(PricedLine(subtotal, disc, taxable, tax, taxable + tax))

    untaxed = sum((p.subtotal for p in priced), ZERO)
    disc_total = sum((p.discount_amount for p in priced), ZERO)
    tax_total = sum((p.tax_amount for p in priced), ZERO)
    return PricingResult(
        lines=priced,
        amount_untaxed=untaxed,
        amount_discount=disc_total,
        amount_tax=tax_total,
        amount_total=untaxed - disc_total + tax_total,
        discount_applied=applied,
        discount_skipped_reason=skipped,
    )
