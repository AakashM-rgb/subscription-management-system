import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.common import business_today
from tests import business_factories as f
from tests.conftest import login, make_user

API = "/api/v1"


def pay(client: TestClient, invoice_id: int, amount: str, method: str = "upi", on=None) -> int:
    res = client.post(
        f"{API}/payments",
        json={
            "invoice_id": invoice_id,
            "method": method,
            "amount": amount,
            "payment_date": str(on or business_today()),
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def seed_month(db: Session):
    """One customer: 2 active subscriptions + 1 closed, 3 billed invoices (one overdue),
    a draft and a cancelled invoice that must not count anywhere."""
    today = business_today()
    cust = f.customer(db, "Finance")
    plan = f.plan(db)
    now = datetime.now(UTC)
    a = f.subscription(db, cust, plan, status="active", activated_at=now)
    b = f.subscription(db, cust, status="active", activated_at=now)
    f.subscription(db, cust, status="closed", closed_at=now)
    inv_paid = f.invoice(db, a, total="1180.00")
    inv_partial = f.invoice(db, b, total="2360.00")
    inv_overdue = f.invoice(db, a, total="590.00", invoice_date=today - timedelta(days=40))
    f.invoice(db, a, total="999.00", status="draft")
    f.invoice(db, b, total="888.00", status="cancelled")
    return cust, plan, inv_paid, inv_partial, inv_overdue


def test_summary_figures(client: TestClient, db: Session) -> None:
    cust, plan, inv_paid, inv_partial, inv_overdue = seed_month(db)
    login(client, make_user(db, "admin").email)
    pay(client, inv_paid.id, "1180.00", "card")
    pay(client, inv_partial.id, "1000.00", "cash")
    voided = pay(client, inv_partial.id, "60.00", "cash")
    client.post(f"{API}/payments/{voided}/void", json={"reason": "Wrong invoice"})

    res = client.get(f"{API}/reports/summary?customer_id={cust.id}")
    assert res.status_code == 200, res.text
    s = res.json()
    assert s["as_of"] == str(business_today())
    assert (s["active_subscriptions"], s["new_subscriptions"], s["closed_subscriptions"]) == (
        2,
        2,
        1,
    )
    assert (s["revenue_received"], s["payments_count"]) == ("2180.00", 2)  # void excluded
    assert (s["invoiced_amount"], s["invoices_count"]) == ("4130.00", 3)  # draft/cancelled excluded
    assert (s["outstanding_amount"], s["outstanding_count"]) == ("1950.00", 2)
    assert (s["overdue_amount"], s["overdue_count"]) == ("590.00", 1)

    by_plan = client.get(f"{API}/reports/summary?customer_id={cust.id}&plan_id={plan.id}").json()
    assert by_plan["active_subscriptions"] == 1
    assert by_plan["revenue_received"] == "1180.00"
    assert by_plan["overdue_amount"] == "590.00"


def test_date_range_applies_to_flows_not_balances(admin_client: TestClient, db: Session) -> None:
    cust, _, inv_paid, _, _ = seed_month(db)
    pay(admin_client, inv_paid.id, "100.00", on=business_today() - timedelta(days=60))
    future = business_today() + timedelta(days=1)
    s = admin_client.get(
        f"{API}/reports/summary?customer_id={cust.id}&date_from={future}&date_to={future}"
    ).json()
    assert (s["revenue_received"], s["invoiced_amount"], s["new_subscriptions"]) == (
        "0.00",
        "0.00",
        0,
    )
    assert s["outstanding_amount"] == "4030.00"  # balances stay "as of today"
    bad = admin_client.get(f"{API}/reports/summary?date_from=2026-02-01&date_to=2026-01-01")
    assert bad.status_code == 422


def test_revenue_series_and_method_breakdown(admin_client: TestClient, db: Session) -> None:
    cust, _, inv_paid, inv_partial, _ = seed_month(db)
    today = business_today()
    earlier = today - timedelta(days=45)
    pay(admin_client, inv_paid.id, "180.00", "card", on=earlier)
    pay(admin_client, inv_paid.id, "1000.00", "upi", on=today)
    pay(admin_client, inv_partial.id, "60.00", "upi", on=today)

    monthly = admin_client.get(f"{API}/reports/revenue?customer_id={cust.id}").json()
    assert sum(float(p["amount"]) for p in monthly) == 1240.0
    assert monthly[-1]["period"] == str(today.replace(day=1))
    assert all(p["period"].endswith("-01") for p in monthly)

    daily = admin_client.get(
        f"{API}/reports/revenue?customer_id={cust.id}&granularity=day&date_from={today}"
    ).json()
    assert daily == [{"period": str(today), "amount": "1060.00", "payments_count": 2}]
    too_long = admin_client.get(f"{API}/reports/revenue?granularity=day&date_from=2024-01-01")
    assert too_long.status_code == 422

    methods = admin_client.get(f"{API}/reports/payments-by-method?customer_id={cust.id}").json()
    assert methods == [
        {"method": "card", "amount": "180.00", "payments_count": 1},
        {"method": "upi", "amount": "1060.00", "payments_count": 2},
    ]


def test_overdue_invoices_and_status_counts(staff_client: TestClient, db: Session) -> None:
    cust, _, _, _, inv_overdue = seed_month(db)
    res = staff_client.get(f"{API}/reports/overdue-invoices?customer_id={cust.id}").json()
    assert res["total"] == 1
    row = res["items"][0]
    assert (row["id"], row["days_overdue"], row["amount_due"]) == (inv_overdue.id, 25, "590.00")
    assert row["customer_name"] == cust.name
    later = staff_client.get(
        f"{API}/reports/overdue-invoices?customer_id={cust.id}&min_days_overdue=26"
    ).json()
    assert later["total"] == 0
    statuses = staff_client.get(
        f"{API}/reports/subscriptions-by-status?customer_id={cust.id}"
    ).json()
    assert statuses == [{"status": "active", "count": 2}, {"status": "closed", "count": 1}]


def test_reports_are_staff_only(client: TestClient, db: Session) -> None:
    f.portal_customer(db, "peek@portal.example.com")
    login(client, "peek@portal.example.com")
    assert client.get(f"{API}/reports/summary").status_code == 403
    assert client.get(f"{API}/reports/overdue-invoices").status_code == 403
