from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value: Decimal | int | str) -> Decimal:
    """Round to 2 decimal places, half-up. Money is always Decimal, never float."""
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)
