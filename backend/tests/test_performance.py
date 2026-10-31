"""Performance check for the PDF requirement: thousands of subscriptions, every page < 2 s.

Opt-in (slow):  RUN_PERF=1 uv run pytest tests/test_performance.py -s
Seeds 10,000 active subscriptions with plain SQL inside the test transaction (rolled back),
bills all of them at once twice (20,000 invoices), then times the API pages Claude 1 owns.
"""

import os
import time
from datetime import date

import pytest
from sqlalchemy import text

from app.services import billing
from tests.conftest import login, make_user
from tests.test_subscriptions_billing import catalog  # noqa: F401 - fixture

pytestmark = pytest.mark.skipif(os.environ.get("RUN_PERF") != "1", reason="set RUN_PERF=1")

N = 10_000
START = date(2026, 1, 1)
API_BUDGET_SECONDS = 0.5  # API share of the 2 s page budget


def seed(db, c) -> None:
    params = {
        "n": N,
        "plan": c["monthly"].id,
        "term": c["term"].id,
        "tax": c["tax"].id,
        "start": START,
        "end": date(2026, 12, 31),
    }
    db.execute(
        text("""
        INSERT INTO customers (name, email)
        SELECT 'Perf Customer ' || g, 'perf' || g || '@perf.example.com'
        FROM generate_series(1, :n) g"""),
        params,
    )
    db.execute(
        text("""
        INSERT INTO subscriptions (number, customer_id, plan_id, payment_term_id, status,
            start_date, term_periods, end_date, next_period_index, next_invoice_date,
            activated_at, amount_untaxed, amount_discount, amount_tax, amount_total)
        SELECT 'PERF-' || lpad(c.id::text, 8, '0'), c.id, :plan, :term, 'active',
            :start, 12, :end, 0, :start, now(), 9990, 0, 1798.20, 11788.20
        FROM customers c WHERE c.email LIKE '%@perf.example.com'"""),
        params,
    )
    db.execute(
        text("""
        INSERT INTO subscription_lines (subscription_id, line_type, description, quantity,
            unit_price, tax_id, sequence, subtotal, discount_amount, tax_amount, total)
        SELECT s.id, 'plan', 'Team Monthly (monthly plan)', 10, 999, :tax, 0,
            9990, 0, 1798.20, 11788.20
        FROM subscriptions s WHERE s.number LIKE 'PERF-%'"""),
        params,
    )
    db.execute(text("ANALYZE customers; ANALYZE subscriptions; ANALYZE subscription_lines"))


def timed(client, url: str, **params) -> float:
    started = time.perf_counter()
    res = client.get(url, params=params)
    elapsed = time.perf_counter() - started
    assert res.status_code == 200, res.text
    return elapsed


def test_billing_day_and_pages_at_scale(client, db, catalog):  # noqa: F811
    seed(db, catalog)

    started = time.perf_counter()
    run = billing.run_billing(db, as_of=START, trigger="manual")
    first_run = time.perf_counter() - started
    assert run.status == "succeeded" and run.invoices_created == N

    started = time.perf_counter()
    run = billing.run_billing(db, as_of=date(2026, 2, 1), trigger="manual")
    second_run = time.perf_counter() - started
    assert run.invoices_created == N

    started = time.perf_counter()
    rerun = billing.run_billing(db, as_of=date(2026, 2, 1), trigger="manual")
    idle_run = time.perf_counter() - started
    assert rerun.invoices_created == 0

    # Confirm the January invoices so overdue / outstanding queries have real volume.
    db.execute(
        text("""
        UPDATE invoices SET status = 'confirmed', number = 'PERF/' || id, confirmed_at = now()
        WHERE period_start = :d"""),
        {"d": START},
    )
    db.execute(text("ANALYZE invoices"))

    login(client, make_user(db, "admin", email="perf-admin@example.com").email)
    sub_id = db.execute(text("SELECT max(id) FROM subscriptions")).scalar()
    inv_id = db.execute(text("SELECT max(id) FROM invoices")).scalar()
    api = "/api/v1"
    pages = {
        "subscriptions page 1": timed(client, f"{api}/subscriptions"),
        "subscriptions deep page": timed(client, f"{api}/subscriptions", page=350, page_size=25),
        "subscriptions status+sort": timed(
            client, f"{api}/subscriptions", status="active", sort="-next_invoice_date"
        ),
        "subscriptions search": timed(client, f"{api}/subscriptions", q="Customer 9876"),
        "subscriptions expired filter": timed(client, f"{api}/subscriptions", expired=True),
        "subscription detail": timed(client, f"{api}/subscriptions/{sub_id}"),
        "subscription invoices": timed(client, f"{api}/subscriptions/{sub_id}/invoices"),
        "invoices page 1 (100)": timed(client, f"{api}/invoices", page_size=100),
        "invoices overdue": timed(client, f"{api}/invoices", overdue=True, sort="-amount_due"),
        "invoices search": timed(client, f"{api}/invoices", q="PERF/1"),
        "invoice detail": timed(client, f"{api}/invoices/{inv_id}"),
        "billing runs": timed(client, f"{api}/billing/runs"),
    }

    print(f"\nbilling run 1: {N} invoices in {first_run:.1f}s ({N / first_run:.0f}/s)")
    print(f"billing run 2: {N} invoices in {second_run:.1f}s; idempotent rerun {idle_run:.2f}s")
    for name, seconds in pages.items():
        print(f"  {name:32s} {seconds * 1000:7.1f} ms")
    slow = {k: v for k, v in pages.items() if v > API_BUDGET_SECONDS}
    assert not slow, f"API responses over {API_BUDGET_SECONDS}s: {slow}"
    assert idle_run < 2.0
