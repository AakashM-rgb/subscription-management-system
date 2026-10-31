import itertools
from datetime import date, timedelta
from decimal import Decimal as D

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.models import (
    BillingRunItem,
    Customer,
    Discount,
    Invoice,
    PaymentTerm,
    Plan,
    Product,
    ProductVariant,
    Subscription,
    Tax,
)
from app.services import billing
from app.services import subscriptions as svc
from tests.conftest import login, make_user

API = "/api/v1"
_seq = itertools.count()


@pytest.fixture
def catalog(db):
    gst = Tax(name="GST 18%", rate=D("18.000"))
    term = PaymentTerm(name="Net 15", due_days=15)
    db.add_all([gst, term])
    db.flush()
    crm = Product(
        name="CRM Suite",
        product_type="service",
        sales_price=D("1000.00"),
        cost_price=D("400.00"),
        tax_id=gst.id,
    )
    db.add(crm)
    db.flush()
    odoo = ProductVariant(
        product_id=crm.id, attribute="Brand", value="Odoo", extra_price=D("560.00")
    )
    monthly = Plan(
        name="Team Monthly",
        price=D("999.00"),
        billing_period="monthly",
        min_quantity=5,
        available_from=date(2025, 1, 1),
        auto_close=True,
        closable=True,
        pausable=True,
        renewable=True,
        tax_id=gst.id,
    )
    yearly = Plan(
        name="Enterprise Yearly",
        price=D("100000.00"),
        billing_period="yearly",
        min_quantity=1,
        available_from=date(2025, 1, 1),
        auto_close=False,
        closable=False,
        pausable=False,
        renewable=True,
        tax_id=gst.id,
    )
    customer = Customer(name="Small Shop", email="shop@example.com")
    db.add_all([odoo, monthly, yearly, customer])
    db.flush()
    return {
        "tax": gst,
        "term": term,
        "crm": crm,
        "odoo": odoo,
        "monthly": monthly,
        "yearly": yearly,
        "customer": customer,
    }


@pytest.fixture
def staff(client, db):
    user = make_user(db, "staff")
    login(client, user.email)
    return user


def payload(c, **kw):
    body = {
        "customer_id": c["customer"].id,
        "plan_id": c["monthly"].id,
        "plan_quantity": 10,
        "start_date": date.today().isoformat(),
        "term_periods": 12,
        "payment_term_id": c["term"].id,
        "lines": [{"product_id": c["crm"].id, "variant_id": c["odoo"].id, "quantity": 1}],
    }
    return body | kw


def make_active(
    db, c, start: date, *, plan=None, term=12, seats=10, confirm_on: date | None = None
) -> Subscription:
    """Create + confirm directly through the service (start in the past => active)."""
    from app.schemas.subscriptions import SubscriptionCreateIn

    actor = make_user(db, "admin", email=f"admin{next(_seq)}@example.com")
    data = SubscriptionCreateIn(
        customer_id=c["customer"].id,
        plan_id=(plan or c["monthly"]).id,
        plan_quantity=seats,
        start_date=start,
        term_periods=term,
        payment_term_id=c["term"].id,
    )
    sub = svc.create_subscription(db, data, actor, start)
    svc.confirm(db, sub, actor, confirm_on or start)
    db.flush()
    return sub


def invoices_of(db, sub) -> list[Invoice]:
    return list(
        db.scalars(
            select(Invoice).where(Invoice.subscription_id == sub.id).order_by(Invoice.period_start)
        )
    )


# ------------------------------------------------------------------ API & lifecycle


def test_create_subscription_prices_plan_seats_and_variant(client, catalog, staff):
    res = client.post(f"{API}/subscriptions", json=payload(catalog))
    assert res.status_code == 201, res.text
    sub = res.json()
    assert sub["status"] == "draft" and sub["number"].startswith("SUB-")
    plan_line, addon = sub["lines"]
    assert plan_line["line_type"] == "plan" and plan_line["subtotal"] == "9990.00"
    assert addon["unit_price"] == "1560.00"  # 1000 sales price + 560 Odoo variant
    assert sub["amount_untaxed"] == "11550.00"
    assert sub["amount_tax"] == "2079.00"
    assert sub["amount_total"] == "13629.00"
    assert "send_quotation" in sub["available_actions"]


def test_minimum_quantity_enforced(client, catalog, staff):
    res = client.post(f"{API}/subscriptions", json=payload(catalog, plan_quantity=2))
    assert res.status_code == 422
    assert "minimum quantity of 5" in res.json()["error"]["message"]


def test_quotation_to_active_flow(client, catalog, staff):
    sub = client.post(f"{API}/subscriptions", json=payload(catalog)).json()
    quote = client.post(f"{API}/subscriptions/{sub['id']}/send-quotation").json()
    assert quote["status"] == "quotation" and quote["quotation_valid_until"]
    active = client.post(f"{API}/subscriptions/{sub['id']}/confirm").json()
    assert active["status"] == "active"  # start date is today
    assert active["next_invoice_date"] == date.today().isoformat()
    events = client.get(f"{API}/subscriptions/{sub['id']}/events").json()["items"]
    assert [e["action"] for e in events][:3] == [
        "subscription.activated",
        "subscription.confirmed",
        "subscription.quotation_sent",
    ]
    assert events[0]["actor_name"] == "Test Staff"


def test_expired_quotation_cannot_be_confirmed(client, catalog, staff, db):
    sub = client.post(f"{API}/subscriptions", json=payload(catalog)).json()
    client.post(f"{API}/subscriptions/{sub['id']}/send-quotation")
    db.execute(
        text("UPDATE subscriptions SET quotation_valid_until = :d WHERE id = :i"),
        {"d": date.today() - timedelta(days=1), "i": sub["id"]},
    )
    res = client.post(f"{API}/subscriptions/{sub['id']}/confirm")
    assert res.status_code == 409 and res.json()["error"]["code"] == "QUOTATION_EXPIRED"


def test_future_start_stays_confirmed_until_start_date(db, catalog):
    start = date.today() + timedelta(days=10)
    sub = make_active(db, catalog, start, confirm_on=date.today())
    assert sub.status == "confirmed"
    billing.run_billing(db, as_of=start, trigger="manual")
    db.refresh(sub)
    assert sub.status == "active" and len(invoices_of(db, sub)) == 1


def test_customer_cannot_use_staff_endpoints(client, db, catalog):
    login(client, make_user(db, "customer").email)
    assert client.get(f"{API}/subscriptions").status_code == 403
    assert client.get(f"{API}/invoices").status_code == 403


def test_non_closable_plan_cannot_close_early(db, catalog):
    sub = make_active(db, catalog, date(2026, 1, 1), plan=catalog["yearly"], term=1)
    with pytest.raises(Exception, match="cannot be closed before its expiry"):
        svc.close(db, sub, None, date(2026, 6, 1))
    svc.close(db, sub, None, date(2027, 1, 2))  # after expiry closing is allowed
    assert sub.status == "closed"


# ------------------------------------------------------------------ billing engine


def test_catch_up_billing_and_idempotent_rerun(db, catalog):
    sub = make_active(db, catalog, date(2026, 1, 1))
    run = billing.run_billing(db, as_of=date(2026, 3, 15), trigger="manual")
    assert run.status == "succeeded" and run.invoices_created == 3
    periods = [(i.period_start, i.period_end) for i in invoices_of(db, sub)]
    assert periods == [
        (date(2026, 1, 1), date(2026, 1, 31)),
        (date(2026, 2, 1), date(2026, 2, 28)),
        (date(2026, 3, 1), date(2026, 3, 31)),
    ]
    again = billing.run_billing(db, as_of=date(2026, 3, 15), trigger="manual")
    assert again.invoices_created == 0
    assert len(invoices_of(db, sub)) == 3
    inv = invoices_of(db, sub)[0]
    assert inv.amount_total == D("11788.20")  # 10 seats x 999 + 18% GST
    assert inv.due_date == date(2026, 3, 30)  # invoice date + Net 15
    assert inv.bill_to_name == "Small Shop"


def test_database_rejects_duplicate_period(db, catalog):
    sub = make_active(db, catalog, date(2026, 1, 1))
    billing.run_billing(db, as_of=date(2026, 1, 1), trigger="manual")
    original = invoices_of(db, sub)[0]
    clone = Invoice(
        **{
            c: getattr(original, c)
            for c in (
                "subscription_id",
                "customer_id",
                "period_start",
                "period_end",
                "invoice_date",
                "due_date",
                "currency",
                "bill_to_name",
                "bill_to_email",
                "payment_term_name",
                "amount_untaxed",
                "amount_discount",
                "amount_tax",
                "amount_total",
            )
        }
    )
    with pytest.raises(IntegrityError, match="ux_invoices_subscription_period"), db.begin_nested():
        db.add(clone)
        db.flush()


def test_concurrent_run_is_rejected(db, engine, catalog):
    with engine.connect() as other:
        other.execute(select(func.pg_advisory_lock(billing.BILLING_LOCK_KEY)))
        with pytest.raises(Exception, match="already in progress"):
            billing.run_billing(db, as_of=date(2026, 1, 1), trigger="manual")
        other.execute(select(func.pg_advisory_unlock(billing.BILLING_LOCK_KEY)))


def test_failed_subscription_is_isolated_and_retried(db, catalog, monkeypatch):
    good = make_active(db, catalog, date(2026, 1, 1))
    bad = make_active(db, catalog, date(2026, 1, 1), seats=6)
    real = billing.create_invoice_for_period

    def flaky(db_, sub, *args, **kwargs):
        if sub.id == bad.id:
            raise RuntimeError("tax service unavailable")
        return real(db_, sub, *args, **kwargs)

    monkeypatch.setattr(billing, "create_invoice_for_period", flaky)
    run = billing.run_billing(db, as_of=date(2026, 1, 1), trigger="scheduled")
    assert run.status == "partial" and run.failures == 1 and run.invoices_created == 1
    item = db.scalar(select(BillingRunItem).where(BillingRunItem.subscription_id == bad.id))
    assert item.status == "failed" and "tax service unavailable" in item.error
    db.refresh(bad)
    assert bad.next_invoice_date == date(2026, 1, 1)  # cursor not advanced: not skipped

    monkeypatch.setattr(billing, "create_invoice_for_period", real)
    retry = billing.run_billing(db, as_of=date(2026, 1, 1), trigger="scheduled")
    assert retry.status == "succeeded" and retry.invoices_created == 1
    assert len(invoices_of(db, good)) == len(invoices_of(db, bad)) == 1


def test_pause_skips_whole_periods_and_resume_bills_current(db, catalog):
    sub = make_active(db, catalog, date(2026, 1, 1))
    billing.run_billing(db, as_of=date(2026, 2, 1), trigger="manual")  # Jan, Feb
    svc.pause(db, sub, None, date(2026, 2, 10))
    billing.run_billing(db, as_of=date(2026, 4, 1), trigger="manual")  # nothing while paused
    assert len(invoices_of(db, sub)) == 2
    svc.resume(db, sub, None, date(2026, 4, 15))
    billing.run_billing(db, as_of=date(2026, 4, 15), trigger="manual")
    starts = [i.period_start for i in invoices_of(db, sub)]
    assert starts == [date(2026, 1, 1), date(2026, 2, 1), date(2026, 4, 1)]  # March skipped
    assert sub.end_date == date(2026, 12, 31)  # pause does not extend expiry


def test_late_renewal_bills_from_schedule_without_gap(db, catalog):
    sub = make_active(db, catalog, date(2026, 4, 1), plan=catalog["yearly"], term=1)
    billing.run_billing(db, as_of=date(2027, 4, 1), trigger="manual")
    assert len(invoices_of(db, sub)) == 1  # expired 31 Mar 2027: second year not billed
    assert svc.is_expired(sub, date(2027, 4, 1)) and sub.status == "active"
    svc.renew(db, sub, None, date(2027, 4, 10))
    assert sub.end_date == date(2028, 3, 31)
    billing.run_billing(db, as_of=date(2027, 4, 10), trigger="manual")
    second = invoices_of(db, sub)[1]
    assert (second.period_start, second.period_end) == (date(2027, 4, 1), date(2028, 3, 31))


def test_auto_close_after_final_period_is_billed(db, catalog):
    sub = make_active(db, catalog, date(2026, 1, 1), term=3)
    billing.run_billing(db, as_of=date(2026, 4, 1), trigger="manual")
    db.refresh(sub)
    assert len(invoices_of(db, sub)) == 3
    assert sub.status == "closed" and sub.close_reason == "expired"


def test_discount_applies_automatically_until_usage_limit(db, catalog):
    promo = Discount(
        name="10 seats 10%",
        kind="percentage",
        value=D("10"),
        scope="subscription",
        min_quantity=10,
        valid_from=date(2026, 1, 1),
        usage_limit=2,
    )
    db.add(promo)
    db.flush()
    sub = make_active(db, catalog, date(2026, 1, 1))
    svc.set_discount(db, sub, promo.id, None, date(2026, 1, 1))
    billing.run_billing(db, as_of=date(2026, 3, 1), trigger="manual")
    discounts = [i.amount_discount for i in invoices_of(db, sub)]
    assert discounts == [D("999.00"), D("999.00"), D("0.00")]  # runs out after 2 uses
    db.refresh(promo)
    assert promo.usage_count == 2


# ------------------------------------------------------------------ invoices


def test_confirm_numbering_cancel_reissue_and_immutability(client, db, catalog, staff):
    sub = make_active(db, catalog, date(2026, 1, 1))
    billing.run_billing(db, as_of=date(2026, 2, 1), trigger="manual")
    first, second = invoices_of(db, sub)
    a = client.post(f"{API}/invoices/{first.id}/confirm").json()
    b = client.post(f"{API}/invoices/{second.id}/confirm").json()
    assert a["number"] == "INV/2026/000001" and b["number"] == "INV/2026/000002"
    assert a["available_actions"] == ["print", "cancel", "send", "record_payment"]

    with pytest.raises(DBAPIError, match="can no longer be modified"), db.begin_nested():
        db.execute(text("UPDATE invoices SET amount_total = 1 WHERE id = :i"), {"i": first.id})

    res = client.post(
        f"{API}/invoices/{first.id}/cancel", json={"reason": "wrong seat count", "reissue": True}
    )
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    live = [i for i in invoices_of(db, sub) if i.status != "cancelled"]
    assert len(live) == 2  # replacement draft exists for the same period: nothing skipped
    replacement = next(i for i in live if i.replaces_invoice_id == first.id)
    assert replacement.period_start == first.period_start and replacement.status == "draft"

    sent = client.post(f"{API}/invoices/{second.id}/send").json()
    assert sent["sent_count"] == 1


def test_bulk_confirm_reports_per_invoice_errors(client, db, catalog, staff):
    sub = make_active(db, catalog, date(2026, 1, 1))
    billing.run_billing(db, as_of=date(2026, 2, 1), trigger="manual")
    ids = [i.id for i in invoices_of(db, sub)]
    res = client.post(f"{API}/invoices/bulk-confirm", json={"invoice_ids": [*ids, 999999]})
    body = res.json()
    assert body["confirmed"] == ids
    assert body["errors"] == [{"id": 999999, "code": "NOT_FOUND", "message": "Invoice not found"}]


def test_billing_run_api_and_history(client, db, catalog):
    make_active(db, catalog, date.today())
    login(client, make_user(db, "admin", email="boss@example.com").email)
    run = client.post(f"{API}/billing/runs", json={})
    assert run.status_code == 201 and run.json()["invoices_created"] == 1
    detail = client.get(f"{API}/billing/runs/{run.json()['id']}").json()
    assert detail["items"][0]["status"] == "billed"
    overdue = client.get(f"{API}/invoices", params={"overdue": True}).json()
    assert overdue["total"] == 0


def test_pricing_preview(client, catalog, staff):
    res = client.post(
        f"{API}/pricing/preview",
        json={
            "plan_id": catalog["monthly"].id,
            "plan_quantity": 10,
            "lines": [
                {"product_id": catalog["crm"].id, "variant_id": catalog["odoo"].id, "quantity": 1}
            ],
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["amount_total"] == "13629.00"
