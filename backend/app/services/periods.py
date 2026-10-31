"""Billing-period date arithmetic. Pure functions, no database.

Period k of a subscription starts at `start + k * period`, always computed from the anchor
(`start`) rather than chained, so month ends never drift: 31 Jan -> 28 Feb -> 31 Mar -> 30 Apr.
"""

import calendar
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.config import get_settings

ONE_DAY = timedelta(days=1)


def business_today() -> date:
    return datetime.now(ZoneInfo(get_settings().business_timezone)).date()


def add_periods(anchor: date, billing_period: str, n: int) -> date:
    if billing_period == "daily":
        return anchor + timedelta(days=n)
    if billing_period == "weekly":
        return anchor + timedelta(weeks=n)
    if billing_period not in ("monthly", "yearly"):
        raise ValueError(f"unknown billing period {billing_period!r}")
    months = n if billing_period == "monthly" else 12 * n
    year, month_index = divmod(anchor.month - 1 + months, 12)
    year += anchor.year
    month = month_index + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def period_start(anchor: date, billing_period: str, k: int) -> date:
    return add_periods(anchor, billing_period, k)


def period_end(anchor: date, billing_period: str, k: int) -> date:
    """Inclusive last day of period k."""
    return add_periods(anchor, billing_period, k + 1) - ONE_DAY


def end_date_for(anchor: date, billing_period: str, total_periods: int) -> date:
    """Inclusive expiry date after `total_periods` periods."""
    return add_periods(anchor, billing_period, total_periods) - ONE_DAY


def period_index_containing(anchor: date, billing_period: str, day: date) -> int:
    """Index of the period that contains `day` (0 if `day` is before the anchor)."""
    if day <= anchor:
        return 0
    if billing_period == "daily":
        return (day - anchor).days
    if billing_period == "weekly":
        return (day - anchor).days // 7
    months = (day.year - anchor.year) * 12 + (day.month - anchor.month)
    k = months if billing_period == "monthly" else months // 12
    while k > 0 and add_periods(anchor, billing_period, k) > day:
        k -= 1
    while add_periods(anchor, billing_period, k + 1) <= day:
        k += 1
    return k


def periods_in_term(anchor: date, billing_period: str, end_date: date) -> int:
    """Number of whole periods between the anchor and an inclusive end date."""
    return period_index_containing(anchor, billing_period, end_date) + 1
