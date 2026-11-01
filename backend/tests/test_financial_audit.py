"""Financial audit against the official PDF: autopay safety, webhooks, reconciliation, ledger
edge cases, reports and discounts applied by the billing engine.

Provider behaviour is exercised with the real Razorpay adapter over a mocked HTTP transport, or
with the test-only fake provider. No production path can fake a successful payment.
"""

import hashlib
import hmac
import json
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal as D

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app import providers
from app.errors import AppError
from app.models import (
    AuditEvent,
    Customer,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAttempt,
    PaymentMandate,
    PaymentTerm,
    Plan,
    Product,
    ProviderEvent,
    Subscription,
    Tax,
)
from app.providers import ProviderError
from app.providers.razorpay import RazorpayAdapter
from app.services import billing, collections, ledger
from app.services import subscriptions as sub_svc
from app.services.common import business_today
from tests import business_factories as f
from tests.conftest import login, make_user
from tests.fake_provider import install
from tests.test_collections import NOW, active_mandate, autopay_invoice, event

API = "/api/v1"


@pytest.fixture(name="fake")
def fake_provider(monkeypatch):
    yield from install(monkeypatch)


def attempts_of(db: Session, invoice: Invoice) -> list[PaymentAttempt]:
    return list(
        db.scalars(
            select(PaymentAttempt)
            .where(PaymentAttempt.invoice_id == invoice.id)
            .order_by(PaymentAttempt.id)
        )
    )


def charges(fake_provider) -> list[tuple]:
    return [c for c in fake_provider.calls if c[0] == "initiate_charge"]


def audits(db: Session, action: str, invoice_id: int) -> list[AuditEvent]:
    return list(
        db.scalars(
            select(AuditEvent).where(
                AuditEvent.action == action, AuditEvent.entity_id == invoice_id
            )
        )
    )


def age(db: Session, model, row_id: int, delta: timedelta) -> None:
    """Move a row's timestamps into the past (the provider has been quiet for `delta`)."""
    past = datetime.now(UTC) - delta
    db.execute(update(model).where(model.id == row_id).values(created_at=past, updated_at=past))


# ============================================================================ mandate required


def test_no_collection_without_an_authorised_mandate(staff_client, db, fake) -> None:
    cust = f.customer(db)
    cust.phone = "+919847020001"
    pending = PaymentMandate(
        customer_id=cust.id,
        provider="fakepay",
        provider_customer_id="c",
        provider_mandate_id="auth_unfinished",
        status="pending",
    )
    db.add(pending)
    db.flush()
    sub = f.subscription(db, cust, status="active", auto_collect=True, mandate_id=pending.id)
    invoice = f.invoice(db, sub)
    collections.collect_due(db, NOW)
    assert attempts_of(db, invoice) == [] and charges(fake) == []
    res = staff_client.post(f"{API}/invoices/{invoice.id}/collect")
    assert res.status_code == 409 and "mandate" in res.json()["error"]["message"]
    assert charges(fake) == []


def test_another_customers_mandate_is_never_used(staff_client, db, fake) -> None:
    payer, stranger = f.customer(db), f.customer(db)
    payer.phone = stranger.phone = "+919847020002"
    foreign = active_mandate(db, stranger)
    sub = f.subscription(db, payer, status="active", auto_collect=True, mandate_id=foreign.id)
    invoice = f.invoice(db, sub)
    collections.collect_due(db, NOW)
    assert attempts_of(db, invoice) == []
    assert staff_client.post(f"{API}/invoices/{invoice.id}/collect").status_code == 409
    assert charges(fake) == []


def test_collection_charges_exactly_the_amount_due(db, fake) -> None:
    invoice, _ = autopay_invoice(db, total="1180.00")
    ledger.record_payment(
        db, invoice_id=invoice.id, method="cash", amount=D("180.00"), payment_date=business_today()
    )
    collections.collect_due(db, NOW)
    [attempt] = attempts_of(db, invoice)
    assert attempt.amount == D("1000.00")
    assert charges(fake)[-1][2] == D("1000.00")


# ============================================================================ failures, retries


def test_network_failure_then_retry_succeeds_once(db, fake) -> None:
    invoice, _ = autopay_invoice(db)
    fake.charge_error = ProviderError("Razorpay unreachable: ConnectTimeout")
    first = collections.collect_invoice(db, invoice.id, NOW)
    assert (first.status, first.failure_code) == ("failed", "provider_error")
    fake.charge_error = None
    assert collections.retry_failed(db, first.next_retry_at + timedelta(seconds=1)) == 1
    second = attempts_of(db, invoice)[-1]
    assert (second.attempt_number, second.status) == (2, "processing")
    collections.handle_event(
        db,
        event(
            db,
            "payment_succeeded",
            provider_reference=second.provider_reference,
            provider_payment_id="pay_after_retry",
            amount="1180.00",
        ),
    )
    db.refresh(invoice)
    assert invoice.status == "paid"
    assert len(charges(fake)) == 2
    assert db.scalar(select(func.count()).where(Payment.invoice_id == invoice.id)) == 1


def test_provider_rejection_is_not_retried(db, fake) -> None:
    invoice, _ = autopay_invoice(db)
    fake.charge_error = ProviderError("Mandate expired", retryable=False)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    assert attempt.status == "failed" and attempt.next_retry_at is None
    assert collections.retry_failed(db, NOW + timedelta(days=30)) == 0


# ============================================================================ revocation


def test_no_collection_after_customer_revokes(client: TestClient, db, fake) -> None:
    cust = f.portal_customer(db, "revoker@portal.example.com")
    cust.phone = "+919847020003"
    sub = f.subscription(db, cust, status="active")
    login(client, "revoker@portal.example.com")
    started = client.post(f"{API}/portal/payment-methods", json={"method_type": "upi"}).json()
    ref = started["checkout"]["order_id"]
    mid = started["mandate"]["id"]
    client.post(
        f"{API}/portal/payment-methods/{mid}/confirm",
        json={"provider_response": {"signature": f"ok:{ref}"}},
    )
    invoice = f.invoice(db, sub)
    assert client.delete(f"{API}/portal/payment-methods/{mid}").status_code == 200

    collections.collect_due(db, NOW)
    assert attempts_of(db, invoice) == [] and charges(fake) == []
    login(client, make_user(db, "staff", email="desk2@example.com").email)
    assert client.post(f"{API}/invoices/{invoice.id}/collect").status_code == 409
    assert charges(fake) == []


def test_provider_side_revocation_stops_scheduled_retries(db, fake) -> None:
    invoice, mandate = autopay_invoice(db)
    first = collections.collect_invoice(db, invoice.id, NOW)
    collections.handle_event(
        db, event(db, "payment_failed", provider_reference=first.provider_reference)
    )
    assert first.next_retry_at is not None
    collections.handle_event(
        db, event(db, "mandate_cancelled", provider_mandate_id=mandate.provider_mandate_id)
    )
    assert mandate.status == "cancelled"
    assert collections.retry_failed(db, first.next_retry_at + timedelta(seconds=1)) == 0
    assert len(charges(fake)) == 1 and len(attempts_of(db, invoice)) == 1


def test_paused_mandate_is_not_charged(db, fake) -> None:
    invoice, mandate = autopay_invoice(db)
    collections.handle_event(
        db, event(db, "mandate_paused", provider_mandate_id=mandate.provider_mandate_id)
    )
    assert mandate.status == "paused"
    collections.collect_due(db, NOW)
    assert attempts_of(db, invoice) == [] and charges(fake) == []


def test_closed_subscription_is_not_charged_automatically(staff_client, db, fake) -> None:
    invoice, _ = autopay_invoice(db)
    sub = db.get(Subscription, invoice.subscription_id)
    sub_svc.close(db, sub, None, business_today(), "cancelled", system=True)
    db.flush()
    collections.collect_due(db, NOW)
    assert attempts_of(db, invoice) == []
    # The invoice is still owed: staff may collect it deliberately (audited).
    assert staff_client.post(f"{API}/invoices/{invoice.id}/collect").status_code == 201


# ============================================================================ pending & abandoned


def test_stuck_charge_times_out_and_late_money_is_kept(db, fake) -> None:
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    with pytest.raises(AppError):  # in flight: manual payment would risk overpaying
        ledger.record_payment(
            db,
            invoice_id=invoice.id,
            method="cash",
            amount=D("1180.00"),
            payment_date=business_today(),
        )
    age(db, PaymentAttempt, attempt.id, timedelta(days=4))
    db.refresh(attempt)
    collections.reconcile_pending(db, datetime.now(UTC))
    assert (attempt.status, attempt.failure_code, attempt.next_retry_at) == (
        "failed",
        "timed_out",
        None,
    )
    ledger.record_payment(
        db, invoice_id=invoice.id, method="cash", amount=D("1180.00"), payment_date=business_today()
    )
    # The provider captures after all: nothing is lost, it is flagged for a refund.
    collections.handle_event(
        db,
        event(
            db,
            "payment_succeeded",
            provider_reference=attempt.provider_reference,
            provider_payment_id="pay_late",
            amount="1180.00",
        ),
    )
    assert attempt.status == "succeeded"
    assert len(audits(db, "payment.unapplied", invoice.id)) == 1
    assert db.scalar(select(func.count()).where(Payment.invoice_id == invoice.id)) == 1


def test_customer_cannot_pile_up_unfinished_setups(client: TestClient, db, fake) -> None:
    cust = f.portal_customer(db, "spammy@portal.example.com")
    cust.phone = "+919847020004"
    login(client, "spammy@portal.example.com")
    for _ in range(3):
        assert (
            client.post(f"{API}/portal/payment-methods", json={"method_type": "card"}).status_code
            == 201
        )
    res = client.post(f"{API}/portal/payment-methods", json={"method_type": "card"})
    assert res.status_code == 409


def test_over_limit_invoice_is_not_reselected(db, fake) -> None:
    invoice, _ = autopay_invoice(db, total="1180.00", max_amount="1000.00")
    assert invoice.id not in collections._eligible_invoice_ids(db, business_today())
    collections.collect_due(db, NOW)
    assert charges(fake) == []


# ============================================================================ amount matching


def test_provider_amount_below_request_is_recorded_and_flagged(db, fake) -> None:
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    collections.handle_event(
        db,
        event(
            db,
            "payment_succeeded",
            provider_reference=attempt.provider_reference,
            provider_payment_id="pay_short",
            amount="1000.00",
        ),
    )
    db.refresh(invoice)
    assert (invoice.status, invoice.amount_due) == ("confirmed", D("180.00"))
    [mismatch] = audits(db, "collection.amount_mismatch", invoice.id)
    assert mismatch.data == {"attempt_id": attempt.id, "requested": "1180.00", "taken": "1000.00"}


def test_payment_in_another_currency_is_never_applied(db, fake) -> None:
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    collections.handle_event(
        db,
        event(
            db,
            "payment_succeeded",
            provider_reference=attempt.provider_reference,
            provider_payment_id="pay_usd",
            amount="1180.00",
            currency="USD",
        ),
    )
    db.refresh(invoice)
    assert invoice.status == "confirmed" and invoice.amount_paid == D("0.00")
    [unapplied] = audits(db, "payment.unapplied", invoice.id)
    assert "USD" in unapplied.data["reason"]


# ============================================================================ Razorpay webhooks

WH_SECRET = "audit_webhook_secret"


@pytest.fixture
def razorpay():
    def offline(request):  # every API call fails: these tests use webhooks only
        return httpx.Response(503, json={})

    adapter = RazorpayAdapter(
        key_id="rzp_test_audit",
        key_secret="audit_secret",
        webhook_secret=WH_SECRET,
        transport=httpx.MockTransport(offline),
    )
    providers.register("razorpay", lambda: adapter)
    yield adapter
    providers.unregister("razorpay")


def razorpay_attempt(db: Session, order_id: str) -> tuple[Invoice, PaymentAttempt]:
    cust = f.customer(db)
    mandate = PaymentMandate(
        customer_id=cust.id,
        provider="razorpay",
        provider_customer_id="cust_r",
        provider_mandate_id=f"token_{uuid.uuid4().hex[:8]}",
        status="active",
    )
    db.add(mandate)
    db.flush()
    sub = f.subscription(db, cust, status="active", auto_collect=True, mandate_id=mandate.id)
    invoice = f.invoice(db, sub, total="1180.00")
    attempt = PaymentAttempt(
        invoice_id=invoice.id,
        mandate_id=mandate.id,
        provider="razorpay",
        provider_reference=order_id,
        idempotency_key=f"inv{invoice.id}-a1",
        amount=D("1180.00"),
        status="processing",
    )
    db.add(attempt)
    db.flush()
    return invoice, attempt


def post_razorpay(client: TestClient, body: dict, event_id: str, secret: str = WH_SECRET):
    raw = json.dumps(body).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return client.post(
        f"{API}/webhooks/payments/razorpay",
        content=raw,
        headers={
            "x-razorpay-signature": sig,
            "x-razorpay-event-id": event_id,
            "content-type": "application/json",
        },
    )


def captured(order_id: str, pay_id: str, event: str = "payment.captured", **extra) -> dict:
    entity = {
        "id": pay_id,
        "entity": "payment",
        "amount": 118000,
        "currency": "INR",
        "status": "captured",
        "order_id": order_id,
        "method": "upi",
        "notes": [],
        "created_at": int(datetime.now(UTC).timestamp()),
        **extra,
    }
    contains = ["payment", "order"] if event == "order.paid" else ["payment"]
    return {
        "entity": "event",
        "account_id": "acc_test",
        "event": event,
        "contains": contains,
        "payload": {"payment": {"entity": entity}},
        "created_at": entity["created_at"],
    }


def test_duplicate_razorpay_deliveries_post_one_payment(client, db, razorpay) -> None:
    invoice, attempt = razorpay_attempt(db, "order_dup")
    body = captured("order_dup", "pay_dup")
    assert post_razorpay(client, body, "evt_cap").json() == {"received": 1, "duplicates": 0}
    assert post_razorpay(client, body, "evt_cap").json() == {"received": 0, "duplicates": 1}
    # Razorpay also sends order.paid for the same payment under another event id.
    assert (
        post_razorpay(
            client, captured("order_dup", "pay_dup", "order.paid"), "evt_paid"
        ).status_code
        == 200
    )
    statuses = dict(
        db.execute(
            select(ProviderEvent.event_type, ProviderEvent.status).where(
                ProviderEvent.event_type.in_(["payment.captured", "order.paid"])
            )
        ).all()
    )
    assert statuses == {"payment.captured": "processed", "order.paid": "ignored"}
    [payment] = db.scalars(select(Payment).where(Payment.invoice_id == invoice.id)).all()
    assert (payment.provider, payment.provider_payment_id, payment.method, payment.amount) == (
        "razorpay",
        "pay_dup",
        "upi",
        D("1180.00"),
    )
    db.refresh(invoice)
    assert invoice.status == "paid" and attempt.status == "succeeded"


def test_failure_after_capture_does_not_undo_payment(client, db, razorpay) -> None:
    invoice, attempt = razorpay_attempt(db, "order_ooo")
    post_razorpay(client, captured("order_ooo", "pay_ok"), "evt_ok")
    failed = captured(
        "order_ooo",
        "pay_bad",
        "payment.failed",
        status="failed",
        error_code="BAD_REQUEST_ERROR",
        error_description="Payment failed",
    )
    assert post_razorpay(client, failed, "evt_bad").status_code == 200
    db.refresh(invoice)
    assert invoice.status == "paid" and attempt.status == "succeeded"


def test_forged_razorpay_webhook_changes_nothing(client, db, razorpay) -> None:
    invoice, attempt = razorpay_attempt(db, "order_forged")
    res = post_razorpay(client, captured("order_forged", "pay_x"), "evt_forged", secret="guess")
    assert res.status_code == 400 and res.json()["error"]["code"] == "INVALID_SIGNATURE"
    assert db.scalar(select(ProviderEvent).where(ProviderEvent.event_id == "evt_forged")) is None
    db.refresh(invoice)
    assert invoice.status == "confirmed" and attempt.status == "processing"


def test_razorpay_currency_is_checked_end_to_end(client, db, razorpay) -> None:
    invoice, _ = razorpay_attempt(db, "order_usd")
    post_razorpay(client, captured("order_usd", "pay_usd", currency="USD"), "evt_usd")
    db.refresh(invoice)
    assert invoice.amount_paid == D("0.00")
    assert len(audits(db, "payment.unapplied", invoice.id)) == 1


# ============================================================================ ledger edge cases


def test_odd_cent_partials_settle_exactly(staff_client, db) -> None:
    invoice = f.invoice(db, f.subscription(db, f.customer(db)), total="999.99")
    for _ in range(3):
        res = staff_client.post(
            f"{API}/payments",
            json={
                "invoice_id": invoice.id,
                "method": "upi",
                "amount": "333.33",
                "payment_date": str(business_today()),
            },
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        assert res.status_code == 201
    db.refresh(invoice)
    assert (invoice.status, invoice.amount_due) == ("paid", D("0.00"))


def test_voiding_one_partial_restores_exact_balance(admin_client, db) -> None:
    invoice = f.invoice(db, f.subscription(db, f.customer(db)), total="1000.00")
    ids = []
    for amount in ("250.00", "300.00", "450.00"):
        ids.append(
            admin_client.post(
                f"{API}/payments",
                json={
                    "invoice_id": invoice.id,
                    "method": "cash",
                    "amount": amount,
                    "payment_date": str(business_today()),
                },
                headers={"Idempotency-Key": str(uuid.uuid4())},
            ).json()["id"]
        )
    db.refresh(invoice)
    assert invoice.status == "paid"
    admin_client.post(f"{API}/payments/{ids[1]}/void", json={"reason": "Cheque bounced"})
    db.refresh(invoice)
    assert (invoice.status, invoice.amount_paid, invoice.amount_due) == (
        "confirmed",
        D("700.00"),
        D("300.00"),
    )


def test_payment_cannot_belong_to_another_customer_at_db_level(db) -> None:
    invoice = f.invoice(db, f.subscription(db, f.customer(db)))
    other = f.customer(db)
    with pytest.raises(DBAPIError), db.begin_nested():
        db.add(
            Payment(
                number=f"PAY-X{invoice.id}",
                invoice_id=invoice.id,
                customer_id=other.id,
                method="cash",
                amount=D("1.00"),
                payment_date=business_today(),
            )
        )
        db.flush()


def test_posted_payment_amount_is_immutable_at_db_level(db) -> None:
    invoice = f.invoice(db, f.subscription(db, f.customer(db)))
    payment = ledger.record_payment(
        db, invoice_id=invoice.id, method="cash", amount=D("10.00"), payment_date=business_today()
    )
    with pytest.raises(DBAPIError), db.begin_nested():
        payment.amount = D("1.00")
        db.flush()


def test_zero_total_invoice_takes_no_payment(db) -> None:
    invoice = f.invoice(db, f.subscription(db, f.customer(db)), total="0.00", status="confirmed")
    with pytest.raises(AppError) as exc:
        ledger.record_payment(
            db,
            invoice_id=invoice.id,
            method="cash",
            amount=D("0.01"),
            payment_date=business_today(),
        )
    assert exc.value.code == "AMOUNT_EXCEEDS_DUE"


def test_idempotency_key_cannot_be_reused_on_another_invoice(staff_client, db) -> None:
    a = f.invoice(db, f.subscription(db, f.customer(db)))
    b = f.invoice(db, f.subscription(db, f.customer(db)))
    key = str(uuid.uuid4())
    body = {"method": "cash", "amount": "5.00", "payment_date": str(business_today())}
    first = staff_client.post(
        f"{API}/payments", json={**body, "invoice_id": a.id}, headers={"Idempotency-Key": key}
    )
    assert first.status_code == 201
    second = staff_client.post(
        f"{API}/payments", json={**body, "invoice_id": b.id}, headers={"Idempotency-Key": key}
    )
    assert second.status_code == 409
    db.refresh(b)
    assert b.amount_paid == D("0.00")


# ============================================================================ reports edges


def test_overdue_starts_the_day_after_the_due_date(staff_client, db) -> None:
    cust = f.customer(db)
    sub = f.subscription(db, cust)
    today = business_today()
    f.invoice(db, sub, invoice_date=today - timedelta(days=15), due_in_days=15)  # due today
    late = f.invoice(db, sub, invoice_date=today - timedelta(days=16), due_in_days=15)
    rows = staff_client.get(f"{API}/reports/overdue-invoices?customer_id={cust.id}").json()
    assert [(r["id"], r["days_overdue"]) for r in rows["items"]] == [(late.id, 1)]
    summary = staff_client.get(f"{API}/reports/summary?customer_id={cust.id}").json()
    assert (summary["overdue_count"], summary["outstanding_count"]) == (1, 2)


def test_partial_payment_counts_only_the_remainder_as_owed(admin_client, db) -> None:
    cust = f.customer(db)
    invoice = f.invoice(db, f.subscription(db, cust), total="1000.00")
    for amount, method in (("400.00", "card"), ("100.00", "cash")):
        admin_client.post(
            f"{API}/payments",
            json={
                "invoice_id": invoice.id,
                "method": method,
                "amount": amount,
                "payment_date": str(business_today()),
            },
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
    cash_id = admin_client.get(f"{API}/payments?invoice_id={invoice.id}&method=cash").json()
    admin_client.post(f"{API}/payments/{cash_id['items'][0]['id']}/void", json={"reason": "Typo"})
    s = admin_client.get(f"{API}/reports/summary?customer_id={cust.id}").json()
    assert (s["outstanding_amount"], s["revenue_received"]) == ("600.00", "400.00")
    methods = admin_client.get(f"{API}/reports/payments-by-method?customer_id={cust.id}").json()
    assert methods == [{"method": "card", "amount": "400.00", "payments_count": 1}]


# ============================================================================ discounts at billing


@pytest.fixture
def billing_setup(db):
    gst = Tax(name=f"GST audit {uuid.uuid4().hex[:6]}", rate=D("18.000"))
    term = PaymentTerm(name=f"Net audit {uuid.uuid4().hex[:6]}", due_days=15)
    db.add_all([gst, term])
    db.flush()
    plan = Plan(
        name="Audit Monthly",
        price=D("1000.00"),
        billing_period="monthly",
        min_quantity=1,
        available_from=date(2025, 1, 1),
        tax_id=gst.id,
    )
    addon = Product(
        name="Audit Backup",
        product_type="service",
        sales_price=D("500.00"),
        cost_price=D("100.00"),
        tax_id=gst.id,
    )
    customer = Customer(name="Audit Discount Co", email="disc@audit.example.com")
    db.add_all([plan, addon, customer])
    db.flush()
    admin = make_user(db, "admin", email=f"auditadmin{uuid.uuid4().hex[:6]}@example.com")
    return {"plan": plan, "addon": addon, "customer": customer, "term": term, "admin": admin}


def billed_sub(db, s, *, seats: int, discount_id: int | None, with_addon: bool = False):
    from app.schemas.subscriptions import LineIn, SubscriptionCreateIn

    start = date(2026, 1, 1)
    data = SubscriptionCreateIn(
        customer_id=s["customer"].id,
        plan_id=s["plan"].id,
        plan_quantity=seats,
        start_date=start,
        term_periods=12,
        payment_term_id=s["term"].id,
        lines=[LineIn(product_id=s["addon"].id, quantity=1)] if with_addon else None,
    )
    sub = sub_svc.create_subscription(db, data, s["admin"], start)
    sub_svc.confirm(db, sub, s["admin"], start)
    if discount_id is not None:
        sub_svc.set_discount(db, sub, discount_id, s["admin"], start)
    db.flush()
    return sub


def bill(db, sub, until: date) -> list[Invoice]:
    """Bill period by period, as the daily scheduler does when it runs on time."""
    day = date(2026, 1, 1)
    while day <= until:
        billing.run_billing(db, as_of=day, trigger="manual", subscription_id=sub.id)
        day = date(day.year + (day.month == 12), day.month % 12 + 1, 1)
    return list(
        db.scalars(
            select(Invoice).where(Invoice.subscription_id == sub.id).order_by(Invoice.period_start)
        )
    )


def create_rule(client, **overrides) -> dict:
    body = {
        "name": f"Audit rule {uuid.uuid4().hex[:6]}",
        "kind": "percentage",
        "value": "10",
        "scope": "subscription",
        "valid_from": "2026-01-01",
        **overrides,
    }
    res = client.post(f"{API}/discounts", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_api_rule_applies_on_future_invoices_until_expiry(admin_client, db, billing_setup):
    rule = create_rule(admin_client, valid_until="2026-02-28")
    sub = billed_sub(db, billing_setup, seats=2, discount_id=rule["id"])
    invoices = bill(db, sub, date(2026, 4, 1))
    assert [i.amount_discount for i in invoices] == [D("200.00"), D("200.00"), D("0.00"), D("0.00")]
    assert admin_client.get(f"{API}/discounts/{rule['id']}").json()["usage_count"] == 2


def test_rule_below_minimum_quantity_does_not_apply(admin_client, db, billing_setup):
    rule = create_rule(admin_client, min_quantity=10)
    sub = billed_sub(db, billing_setup, seats=5, discount_id=rule["id"])
    assert [i.amount_discount for i in bill(db, sub, date(2026, 2, 1))] == [D("0.00"), D("0.00")]


def test_deactivating_rule_stops_future_but_keeps_issued(admin_client, db, billing_setup):
    rule = create_rule(admin_client)
    sub = billed_sub(db, billing_setup, seats=1, discount_id=rule["id"])
    [jan] = bill(db, sub, date(2026, 1, 1))
    assert jan.amount_discount == D("100.00")
    admin_client.patch(f"{API}/discounts/{rule['id']}", json={"is_active": False})
    jan2, feb = bill(db, sub, date(2026, 2, 1))
    assert (jan2.id, jan2.amount_discount, feb.amount_discount) == (jan.id, D("100.00"), D("0.00"))


def test_product_rule_discounts_only_that_product(admin_client, db, billing_setup):
    rule = create_rule(
        admin_client,
        scope="product",
        kind="fixed",
        value="50.00",
        product_ids=[billing_setup["addon"].id],
    )
    sub = billed_sub(db, billing_setup, seats=1, discount_id=rule["id"], with_addon=True)
    [inv] = bill(db, sub, date(2026, 1, 1))
    lines = db.scalars(select(InvoiceLine).where(InvoiceLine.invoice_id == inv.id)).all()
    by_type = {ln.line_type: ln.discount_amount for ln in lines}
    assert by_type == {"plan": D("0.00"), "product": D("50.00")}
    assert inv.amount_discount == D("50.00")


def test_catch_up_billing_keeps_discount_valid_in_each_period(admin_client, db, billing_setup):
    """Billing that falls behind still applies a discount in the periods it was valid for."""
    rule = create_rule(admin_client, valid_until="2026-02-28")
    sub = billed_sub(db, billing_setup, seats=2, discount_id=rule["id"])
    billing.run_billing(db, as_of=date(2026, 4, 1), trigger="manual", subscription_id=sub.id)
    invoices = db.scalars(
        select(Invoice).where(Invoice.subscription_id == sub.id).order_by(Invoice.period_start)
    ).all()
    assert [i.amount_discount for i in invoices] == [D("200.00"), D("200.00"), D("0.00"), D("0.00")]


def test_explicit_rejection_after_order_is_a_definite_failure(staff_client, db, fake) -> None:
    """A 4xx from the charge call means nothing was charged: failed now, not 'pending'."""
    invoice, _ = autopay_invoice(db)
    fake.charge_error = ProviderError(
        "Card declined by issuer",
        reference="order_declined",
        retryable=True,
        outcome_unknown=False,
        code="BAD_REQUEST_ERROR",
    )
    res = staff_client.post(f"{API}/invoices/{invoice.id}/collect")
    assert res.status_code == 201
    body = res.json()
    assert (body["status"], body["failure_code"], body["provider_reference"]) == (
        "failed",
        "BAD_REQUEST_ERROR",
        "order_declined",
    )
    assert body["next_retry_at"] is not None
    # Unknown outcomes (timeout after the order exists) still wait for reconciliation.
    other, _ = autopay_invoice(db)
    fake.charge_error = ProviderError("timeout", reference="order_unknown")
    assert collections.collect_invoice(db, other.id, NOW).status == "processing"


def test_duplicate_provider_mandate_id_is_a_conflict_not_a_crash(client, db, fake) -> None:
    cust = f.portal_customer(db, "twin@portal.example.com")
    cust.phone = "+919847020005"
    taken = active_mandate(db, f.customer(db))
    login(client, "twin@portal.example.com")
    started = client.post(f"{API}/portal/payment-methods", json={"method_type": "card"}).json()
    ref = started["checkout"]["order_id"]
    # The (misbehaving) provider hands back a token that another mandate already holds.
    db.execute(
        update(PaymentMandate)
        .where(PaymentMandate.id == taken.id)
        .values(provider_mandate_id=f"tok_{ref}")
    )
    res = client.post(
        f"{API}/portal/payment-methods/{started['mandate']['id']}/confirm",
        json={"provider_response": {"signature": f"ok:{ref}"}},
    )
    assert res.status_code == 409 and res.json()["error"]["code"] == "DUPLICATE"
    # The same conflict arriving by webhook is recorded, not retried forever.
    ev = event(
        db, "payment_authorized", authorization_reference=ref, provider_mandate_id=f"tok_{ref}"
    )
    assert collections.handle_event(db, ev) == "ignored"
    assert (
        db.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(AuditEvent.action == "mandate.conflict")
        )
        >= 1
    )
