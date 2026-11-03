"""Security and integrity audit of the Razorpay path: authorisation races, webhook replay,
network/5xx/4xx outcomes, reconciliation fairness. The real Razorpay adapter runs over a mocked
HTTP transport; nothing here can fake a payment in production code."""

import hashlib
import hmac
import itertools
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal as D

import httpx
import pytest
from sqlalchemy import func, select

from app import providers
from app.models import AuditEvent, Invoice, Payment, PaymentAttempt, PaymentMandate, ProviderEvent
from app.providers import ChargeResult, ProviderError
from app.providers.razorpay import RazorpayAdapter
from app.services import collections
from tests import business_factories as f
from tests.conftest import login
from tests.fake_provider import install
from tests.test_collections import NOW, autopay_invoice
from tests.test_financial_audit import (
    API,
    WH_SECRET,
    age,
    attempts_of,
    captured,
    post_razorpay,
    razorpay_attempt,
)

KEY_SECRET = "audit_key_secret"


class Stub:
    """Mock Razorpay HTTP API. Routes map (METHOD, path) -> (status, json) or a callable."""

    def __init__(self):
        self.calls: list[tuple[str, str]] = []
        self.routes: dict = {
            ("POST", "/v1/customers"): (200, {"id": "cust_1"}),
            ("POST", "/v1/orders"): (200, {"id": "order_auth"}),
            ("GET", "/v1/payments/pay_auth"): (
                200,
                {
                    "id": "pay_auth",
                    "order_id": "order_auth",
                    "token_id": "token_9",
                    "customer_id": "cust_1",
                },
            ),
            ("GET", "/v1/customers/cust_1/tokens/token_9"): (
                200,
                {
                    "id": "token_9",
                    "method": "card",
                    "recurring_details": {"status": "confirmed"},
                    "card": {"last4": "4242", "network": "Visa"},
                },
            ),
            ("GET", "/v1/orders/order_auth"): (
                200,
                {"id": "order_auth", "notes": {"purpose": "mandate", "mandate_id": "1"}},
            ),
        }

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append((request.method, request.url.path))
        route = self.routes.get((request.method, request.url.path), (404, {"error": {}}))
        status, body = route(request) if callable(route) else route
        return httpx.Response(status, json=body)

    def count(self, method: str, path: str) -> int:
        return self.calls.count((method, path))


@pytest.fixture
def rzp(monkeypatch):
    stub = Stub()
    adapter = RazorpayAdapter(
        key_id="rzp_test_audit",
        key_secret=KEY_SECRET,
        webhook_secret=WH_SECRET,
        transport=httpx.MockTransport(stub),
    )
    providers.register("razorpay", lambda: adapter)
    monkeypatch.setattr("app.routers.portal_payments.default_provider_name", lambda: "razorpay")
    yield stub
    providers.unregister("razorpay")


@pytest.fixture(name="fake")
def fake_provider(monkeypatch):
    yield from install(monkeypatch)


def checkout_sig(order: str, payment: str) -> str:
    msg = f"{order}|{payment}".encode()
    return hmac.new(KEY_SECRET.encode(), msg, hashlib.sha256).hexdigest()


def payment_event(event: str, **entity) -> dict:
    ent = {"entity": "payment", "currency": "INR", "method": "card", **entity}
    return {
        "entity": "event",
        "event": event,
        "contains": ["payment"],
        "payload": {"payment": {"entity": ent}},
        "created_at": 1761900000,
    }


def audit_count(db, action: str) -> int:
    return db.scalar(
        select(func.count()).select_from(AuditEvent).where(AuditEvent.action == action)
    )


# ============================================================================ authorisation race


def start_portal_mandate(client, db, email: str) -> dict:
    cust = f.portal_customer(db, email)
    cust.phone = "+919847030001"
    login(client, email)
    started = client.post(f"{API}/portal/payment-methods", json={"method_type": "card"})
    assert started.status_code == 201, started.text
    return started.json()


def test_confirm_works_after_the_authorisation_webhook_won_the_race(client, db, rzp) -> None:
    started = start_portal_mandate(client, db, "race3@portal.example.com")
    order = started["checkout"]["order_id"]
    hook = payment_event(
        "payment.authorized",
        id="pay_auth",
        order_id=order,
        token_id="token_9",
        status="authorized",
        amount=100,
    )
    assert post_razorpay(client, hook, "evt_auth").status_code == 200  # rewrites the mandate id
    res = client.post(
        f"{API}/portal/payment-methods/{started['mandate']['id']}/confirm",
        json={
            "provider_response": {
                "razorpay_payment_id": "pay_auth",
                "razorpay_order_id": order,
                "razorpay_signature": checkout_sig(order, "pay_auth"),
            }
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "active"


def test_confirm_still_rejects_forged_or_foreign_checkout_data(client, db, rzp) -> None:
    started = start_portal_mandate(client, db, "forge3@portal.example.com")
    order = started["checkout"]["order_id"]
    mid = started["mandate"]["id"]
    hook = payment_event(
        "payment.authorized",
        id="pay_auth",
        order_id=order,
        token_id="token_9",
        status="authorized",
        amount=100,
    )
    post_razorpay(client, hook, "e1")
    url = f"{API}/portal/payment-methods/{mid}/confirm"
    forged = client.post(
        url,
        json={
            "provider_response": {
                "razorpay_payment_id": "pay_auth",
                "razorpay_order_id": order,
                "razorpay_signature": "0" * 64,
            }
        },
    )
    assert forged.status_code == 400
    # A genuinely signed payment that belongs to a different token/order is refused.
    rzp.routes[("GET", "/v1/payments/pay_other")] = (
        200,
        {"id": "pay_other", "order_id": "order_other", "token_id": "token_other"},
    )
    foreign = client.post(
        url,
        json={
            "provider_response": {
                "razorpay_payment_id": "pay_other",
                "razorpay_order_id": "order_other",
                "razorpay_signature": checkout_sig("order_other", "pay_other"),
            }
        },
    )
    assert foreign.status_code == 400
    assert db.get(PaymentMandate, mid).status == "pending"


def test_authorisation_charge_is_not_reported_as_unapplied_money(client, db, rzp) -> None:
    started = start_portal_mandate(client, db, "auth3@portal.example.com")
    order = started["checkout"]["order_id"]
    auth = payment_event(
        "payment.authorized",
        id="pay_auth",
        order_id=order,
        token_id="token_9",
        status="authorized",
        amount=100,
    )
    post_razorpay(client, auth, "a1")
    before = audit_count(db, "payment.unapplied")
    cap = payment_event(
        "payment.captured",
        id="pay_auth",
        order_id=order,
        token_id="token_9",
        status="captured",
        amount=100,
    )
    assert post_razorpay(client, cap, "a2").status_code == 200
    stored = db.scalar(select(ProviderEvent).order_by(ProviderEvent.id.desc()))
    assert stored.status == "processed", stored.processing_error
    assert audit_count(db, "payment.unapplied") == before  # not a refund-me item
    assert audit_count(db, "mandate.authorization_payment") == 1


# ============================================================================ webhook replay


def test_replay_with_an_altered_event_id_header_is_still_a_duplicate(client, db, rzp) -> None:
    """The event-id header is not covered by the signature, so it cannot be the dedupe key."""
    invoice, attempt = razorpay_attempt(db, "order_replay")
    body = captured("order_replay", "pay_replay")
    assert post_razorpay(client, body, "evt_one").json() == {"received": 1, "duplicates": 0}
    assert post_razorpay(client, body, "evt_two").json() == {"received": 0, "duplicates": 1}
    assert post_razorpay(client, body, "evt_three").json() == {"received": 0, "duplicates": 1}
    assert db.scalar(select(func.count()).where(Payment.invoice_id == invoice.id)) == 1


def test_a_success_is_recorded_exactly_once_across_every_path(client, db, rzp) -> None:
    invoice, attempt = razorpay_attempt(db, "order_once")
    body = captured("order_once", "pay_once")
    post_razorpay(client, body, "e1")  # webhook
    post_razorpay(client, captured("order_once", "pay_once", "order.paid"), "e2")  # order.paid
    rzp.routes[("GET", "/v1/orders/order_once/payments")] = (  # reconcile sees the same capture
        200,
        {
            "items": [
                {
                    "id": "pay_once",
                    "order_id": "order_once",
                    "status": "captured",
                    "amount": 118000,
                    "currency": "INR",
                    "method": "upi",
                }
            ]
        },
    )
    collections.reconcile_pending(db, NOW + timedelta(days=1))
    post_razorpay(client, body, "e3")  # replay
    assert db.scalar(select(func.count()).where(Payment.invoice_id == invoice.id)) == 1
    db.refresh(invoice)
    assert (invoice.status, invoice.amount_paid) == ("paid", D("1180.00"))


# ============================================================================ Razorpay outcomes


def charge_routes(stub: Stub, recurring) -> None:
    stub.routes[("POST", "/v1/orders")] = (200, {"id": "order_charge"})
    stub.routes[("POST", "/v1/payments/create/recurring")] = recurring


def razorpay_autopay_invoice(db) -> Invoice:
    cust = f.customer(db)
    cust.phone = "+919847030002"
    mandate = PaymentMandate(
        customer_id=cust.id,
        provider="razorpay",
        provider_customer_id="cust_1",
        provider_mandate_id="token_9",
        status="active",
        method_type="card",
        authorized_at=datetime.now(UTC),
    )
    db.add(mandate)
    db.flush()
    sub = f.subscription(db, cust, status="active", auto_collect=True, mandate_id=mandate.id)
    return f.invoice(db, sub, total="1180.00")


@pytest.mark.parametrize("status", [500, 502, 503])
def test_5xx_on_the_charge_call_waits_and_reconciliation_settles_it(db, rzp, status) -> None:
    invoice = razorpay_autopay_invoice(db)
    charge_routes(rzp, (status, {}))
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    assert (attempt.status, attempt.provider_reference) == ("processing", "order_charge")
    # Razorpay did capture after all; reconciliation finds it by order.
    rzp.routes[("GET", "/v1/orders/order_charge/payments")] = (
        200,
        {
            "items": [
                {
                    "id": "pay_late",
                    "order_id": "order_charge",
                    "status": "captured",
                    "amount": 118000,
                    "currency": "INR",
                    "method": "card",
                }
            ]
        },
    )
    collections.reconcile_pending(db, NOW + timedelta(hours=1))
    db.refresh(invoice)
    assert (invoice.status, attempt.status) == ("paid", "succeeded")
    assert db.scalar(select(func.count()).where(Payment.invoice_id == invoice.id)) == 1


def test_network_timeout_after_order_creation_never_double_charges(db, rzp) -> None:
    invoice = razorpay_autopay_invoice(db)

    def timeout(request):
        raise httpx.ReadTimeout("slow")

    charge_routes(rzp, timeout)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    assert attempt.status == "processing"
    # collect_due/retry must not start a second charge while this one is unresolved.
    assert collections.collect_due(db, NOW) == 0
    assert collections.retry_failed(db, NOW + timedelta(days=30)) == 0
    assert rzp.count("POST", "/v1/payments/create/recurring") == 1


def test_4xx_rejection_fails_without_ever_marking_paid(db, rzp) -> None:
    invoice = razorpay_autopay_invoice(db)
    declined = {"error": {"code": "BAD_REQUEST_ERROR", "description": "Declined"}}
    charge_routes(rzp, (400, declined))
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    db.refresh(invoice)
    assert (attempt.status, attempt.failure_code, attempt.next_retry_at) == (
        "failed",
        "BAD_REQUEST_ERROR",
        None,
    )
    assert (invoice.status, invoice.amount_paid) == ("confirmed", D("0.00"))
    assert db.scalar(select(func.count()).where(Payment.invoice_id == invoice.id)) == 0


def test_failed_webhook_never_pays_an_invoice(client, db, rzp) -> None:
    invoice, attempt = razorpay_attempt(db, "order_nopay")
    failed = payment_event(
        "payment.failed",
        id="pay_f",
        order_id="order_nopay",
        status="failed",
        amount=118000,
        error_code="BAD_REQUEST_ERROR",
        error_description="x",
    )
    post_razorpay(client, failed, "f1")
    db.refresh(invoice)
    assert (attempt.status, invoice.status, invoice.amount_paid) == (
        "failed",
        "confirmed",
        D("0.00"),
    )


def test_out_of_order_capture_then_late_failure_keeps_the_money(client, db, rzp) -> None:
    invoice, attempt = razorpay_attempt(db, "order_ooo2")
    post_razorpay(client, captured("order_ooo2", "pay_ooo2"), "o1")
    late_fail = payment_event(
        "payment.failed", id="pay_ooo2", order_id="order_ooo2", status="failed", amount=118000
    )
    post_razorpay(client, late_fail, "o2")
    db.refresh(invoice)
    assert (invoice.status, attempt.status) == ("paid", "succeeded")


# ============================================================================ reconciliation


def test_persistent_lookup_errors_do_not_starve_newer_attempts(db, fake, monkeypatch) -> None:
    monkeypatch.setattr(collections, "BATCH_SIZE", 2)
    reject = ProviderError(
        "Razorpay rejected the request (400)", retryable=False, outcome_unknown=False
    )
    for _ in range(2):
        invoice, _ = autopay_invoice(db)
        bad = collections.collect_invoice(db, invoice.id, NOW)
        fake.fetch_errors[bad.provider_reference] = reject
    good_invoice, _ = autopay_invoice(db)
    good = collections.collect_invoice(db, good_invoice.id, NOW)
    fake.charge_outcomes[good.provider_reference] = ChargeResult(
        status="succeeded",
        provider_reference=good.provider_reference,
        provider_payment_id="pay_good",
        amount=D("1180.00"),
        method_type="card",
    )
    first = NOW + timedelta(hours=1)
    collections.reconcile_pending(db, first)
    collections.reconcile_pending(db, first + timedelta(minutes=1))
    assert good.status == "succeeded"


def test_attempt_that_cannot_be_looked_up_for_days_is_timed_out(db, fake) -> None:
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    fake.fetch_errors[attempt.provider_reference] = ProviderError("Razorpay unreachable")
    age(db, PaymentAttempt, attempt.id, timedelta(days=4))
    db.refresh(attempt)
    collections.reconcile_pending(db, datetime.now(UTC))
    assert (attempt.status, attempt.failure_code, attempt.next_retry_at) == (
        "failed",
        "timed_out",
        None,
    )
    db.refresh(invoice)
    assert invoice.status == "confirmed"  # never paid by a failure


def test_expired_or_revoked_mandate_is_never_charged_by_retries(db, fake) -> None:
    invoice, mandate = autopay_invoice(db)
    first = collections.collect_invoice(db, invoice.id, NOW)
    failure = ChargeResult(
        status="failed", provider_reference=first.provider_reference, failure_code="MANDATE_EXPIRED"
    )
    collections.apply_charge_result(db, first, failure, NOW)
    mandate.status = "cancelled"
    db.flush()
    assert collections.retry_failed(db, first.next_retry_at + timedelta(seconds=1)) == 0
    assert len(attempts_of(db, invoice)) == 1
    assert db.get(Invoice, invoice.id).status == "confirmed"


# =========================================================== out-of-order mandate events


def token_event(db, kind: str, token: str, at: int) -> ProviderEvent:
    body = {
        "entity": "event",
        "event": kind,
        "contains": ["token"],
        "payload": {"token": {"entity": {"id": token, "method": "upi"}}},
        "created_at": at,
    }
    ev = ProviderEvent(
        provider="razorpay", event_id=f"sha256:{token}{kind}{at}", event_type=kind, payload=body
    )
    db.add(ev)
    db.flush()
    return ev


def pending_mandate(db) -> PaymentMandate:
    mandate = PaymentMandate(
        customer_id=f.customer(db).id,
        provider="razorpay",
        provider_customer_id="cust_1",
        provider_mandate_id=f"token_{uuid.uuid4().hex[:8]}",
        status="pending",
    )
    db.add(mandate)
    db.flush()
    return mandate


@pytest.mark.parametrize(
    "history, true_state",
    [
        ([("token.confirmed", 100), ("token.paused", 200)], "paused"),
        ([("token.confirmed", 100), ("token.cancelled", 200)], "cancelled"),
        ([("token.confirmed", 100), ("token.paused", 200), ("token.cancelled", 300)], "cancelled"),
        ([("token.confirmed", 100), ("token.paused", 200), ("token.confirmed", 300)], "active"),
    ],
)
def test_every_delivery_order_ends_in_the_providers_true_state(db, rzp, history, true_state):
    for order in itertools.permutations(history):
        mandate = pending_mandate(db)
        for kind, at in order:
            collections.handle_event(db, token_event(db, kind, mandate.provider_mandate_id, at))
        assert mandate.status == true_state, f"delivered {[k for k, _ in order]}"


def test_a_stale_event_is_ignored_not_failed(db, rzp) -> None:
    mandate = pending_mandate(db)
    collections.handle_event(db, token_event(db, "token.paused", mandate.provider_mandate_id, 200))
    stale = token_event(db, "token.confirmed", mandate.provider_mandate_id, 100)
    assert collections.handle_event(db, stale) == "ignored"  # no retry storm
    assert mandate.status == "paused"


def test_events_without_a_timestamp_keep_the_old_behaviour(db, fake) -> None:
    """Providers/tests that send no timestamp are never treated as stale."""
    from tests.test_collections import event

    mandate = PaymentMandate(
        customer_id=f.customer(db).id,
        provider="fakepay",
        provider_customer_id="c",
        provider_mandate_id="tok_nots",
        status="pending",
    )
    db.add(mandate)
    db.flush()
    collections.handle_event(db, event(db, "mandate_paused", provider_mandate_id="tok_nots"))
    collections.handle_event(db, event(db, "mandate_active", provider_mandate_id="tok_nots"))
    assert mandate.status == "active"


# ======================================================= lost commit after charging


def duplicate_receipt(stub: Stub, receipt: str, existing_amount: int = 118000):
    dup = {
        "error": {
            "code": "BAD_REQUEST_ERROR",
            "description": "Duplicate request. This request has already been processed.",
        }
    }
    stub.routes[("POST", "/v1/orders")] = (400, dup)
    stub.routes[("GET", "/v1/orders")] = (
        200,
        {
            "entity": "collection",
            "items": [{"id": "order_first", "receipt": receipt, "amount": existing_amount}],
        },
    )
    stub.routes[("POST", "/v1/payments/create/recurring")] = (200, {"razorpay_payment_id": "pay_x"})


def test_duplicate_receipt_adopts_the_existing_order_instead_of_charging_again(db, rzp) -> None:
    """The DB commit was lost after Razorpay charged; the retry reuses the same receipt."""
    invoice = razorpay_autopay_invoice(db)
    duplicate_receipt(rzp, f"inv{invoice.id}-a1")
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    assert (attempt.status, attempt.provider_reference) == ("processing", "order_first")
    assert rzp.count("POST", "/v1/payments/create/recurring") == 0  # no second charge
    # The first charge's capture then settles it exactly once.
    rzp.routes[("GET", "/v1/orders/order_first/payments")] = (
        200,
        {
            "items": [
                {
                    "id": "pay_first",
                    "order_id": "order_first",
                    "status": "captured",
                    "amount": 118000,
                    "currency": "INR",
                    "method": "card",
                }
            ]
        },
    )
    collections.reconcile_pending(db, NOW + timedelta(hours=1))
    db.refresh(invoice)
    assert (invoice.status, attempt.status) == ("paid", "succeeded")
    assert db.scalar(select(func.count()).where(Payment.invoice_id == invoice.id)) == 1


def test_duplicate_receipt_with_a_different_amount_is_not_adopted(db, rzp) -> None:
    invoice = razorpay_autopay_invoice(db)
    duplicate_receipt(rzp, f"inv{invoice.id}-a1", existing_amount=5000)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    assert attempt.status == "failed"  # surfaced, never silently matched to a wrong order
    assert rzp.count("POST", "/v1/payments/create/recurring") == 0
