from datetime import date
from decimal import Decimal as D

import pytest

from app.services.periods import (
    add_periods,
    end_date_for,
    period_end,
    period_index_containing,
    periods_in_term,
)
from app.services.pricing import DiscountRule, PriceLine, price

# ---------------------------------------------------------------- periods


def test_month_end_anchor_does_not_drift():
    starts = [add_periods(date(2026, 1, 31), "monthly", k) for k in range(5)]
    assert starts == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
        date(2026, 4, 30),
        date(2026, 5, 31),
    ]


def test_leap_day_yearly():
    assert add_periods(date(2024, 2, 29), "yearly", 1) == date(2025, 2, 28)
    assert add_periods(date(2024, 2, 29), "yearly", 4) == date(2028, 2, 29)


@pytest.mark.parametrize(
    ("period", "term", "expected"),
    [
        ("monthly", 3, date(2026, 3, 31)),
        ("monthly", 12, date(2026, 12, 31)),
        ("yearly", 1, date(2026, 12, 31)),
        ("weekly", 2, date(2026, 1, 14)),
        ("daily", 10, date(2026, 1, 10)),
    ],
)
def test_inclusive_expiry(period, term, expected):
    assert end_date_for(date(2026, 1, 1), period, term) == expected


def test_period_index_containing():
    anchor = date(2026, 1, 31)
    assert period_index_containing(anchor, "monthly", date(2026, 1, 31)) == 0
    assert period_index_containing(anchor, "monthly", date(2026, 2, 27)) == 0
    assert period_index_containing(anchor, "monthly", date(2026, 2, 28)) == 1
    assert period_index_containing(anchor, "monthly", date(2026, 4, 15)) == 2
    assert period_index_containing(date(2026, 1, 1), "weekly", date(2026, 1, 15)) == 2
    assert period_index_containing(date(2026, 1, 1), "yearly", date(2027, 6, 1)) == 1
    assert periods_in_term(date(2026, 1, 1), "monthly", date(2026, 12, 31)) == 12
    assert period_end(anchor, "monthly", 0) == date(2026, 2, 27)


# ---------------------------------------------------------------- pricing

SEATS = PriceLine("plan", None, 10, D("999.00"), D("18"), "GST 18%")
ADDON = PriceLine("product", 7, 1, D("1560.00"), D("18"), "GST 18%")  # 1000 + Odoo variant 560
ON = date(2026, 11, 1)


def rule(**kw) -> DiscountRule:
    base = {
        "id": 1,
        "name": "Promo",
        "kind": "percentage",
        "value": D("10"),
        "scope": "subscription",
    }
    return DiscountRule(**(base | kw))


def test_price_without_discount():
    r = price([SEATS, ADDON], None, ON)
    assert r.amount_untaxed == D("11550.00")
    assert r.amount_tax == D("2079.00")
    assert r.amount_total == D("13629.00")


def test_pdf_variant_example_with_percentage_discount():
    line = PriceLine("product", 7, 10, D("1560.00"), D("18"), "GST 18%")
    r = price([line], rule(scope="product", product_ids=frozenset({7})), ON)
    assert r.lines[0].discount_amount == D("1560.00")
    assert r.lines[0].taxable_amount == D("14040.00")
    assert r.lines[0].tax_amount == D("2527.20")
    assert r.amount_total == D("16567.20")


def test_fixed_discount_is_allocated_and_sums_exactly():
    r = price([SEATS, ADDON], rule(kind="fixed", value=D("500")), ON)
    assert r.amount_discount == D("500.00")
    assert sum(line.discount_amount for line in r.lines) == D("500.00")
    assert r.amount_total == r.amount_untaxed - r.amount_discount + r.amount_tax


def test_fixed_discount_never_exceeds_subtotal():
    r = price([ADDON], rule(kind="fixed", value=D("99999")), ON)
    assert r.amount_discount == D("1560.00")
    assert r.amount_total == D("0.00")


@pytest.mark.parametrize(
    ("kwargs", "reason"),
    [
        ({"valid_until": date(2026, 10, 31)}, "expired"),
        ({"valid_from": date(2026, 11, 2)}, "not_started"),
        ({"usage_limit": 3, "usage_count": 3}, "usage_limit_reached"),
        ({"min_quantity": 20}, "below_min_quantity"),  # 10 seats < 20
        ({"min_purchase_amount": D("50000")}, "below_min_purchase"),
        ({"scope": "product", "product_ids": frozenset({99})}, "no_applicable_lines"),
        ({"is_active": False}, "inactive"),
    ],
)
def test_discount_stops_when_ineligible(kwargs, reason):
    r = price([SEATS, ADDON], rule(**kwargs), ON)
    assert r.discount_applied is None
    assert r.discount_skipped_reason == reason
    assert r.amount_discount == D("0.00")


def test_seat_based_discount_applies_at_threshold():
    r = price([SEATS], rule(min_quantity=10), ON)
    assert r.discount_applied is not None
    assert r.amount_discount == D("999.00")


def test_product_scope_does_not_touch_plan_line():
    r = price([SEATS, ADDON], rule(scope="product", product_ids=frozenset({7})), ON)
    assert r.lines[0].discount_amount == D("0.00")
    assert r.lines[1].discount_amount == D("156.00")
