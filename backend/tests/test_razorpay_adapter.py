"""Razorpay adapter against a mocked HTTP transport: request shapes, signatures, parsing."""

import base64
import hashlib
import hmac
import json
from decimal import Decimal

import httpx
import pytest

from app.providers import CustomerRef, ProviderError, WebhookVerificationError
from app.providers.razorpay import RazorpayAdapter

KEY_ID, KEY_SECRET, WH_SECRET = "rzp_test_key", "key_secret", "wh_secret"
CUSTOMER = CustomerRef(
    id=7, name="Kochi Traders", email="ap@kochi.example.com", phone="+919847000000"
)


class Recorder:
    def __init__(self, routes: dict[tuple[str, str], tuple[int, dict]]):
        self.routes = routes
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        status, body = self.routes.get((request.method, request.url.path), (404, {"error": {}}))
        return httpx.Response(status, json=body)

    def body(self, i: int) -> dict:
        return json.loads(self.requests[i].content)


def adapter(routes) -> tuple[RazorpayAdapter, Recorder]:
    rec = Recorder(routes)
    return (
        RazorpayAdapter(
            key_id=KEY_ID,
            key_secret=KEY_SECRET,
            webhook_secret=WH_SECRET,
            transport=httpx.MockTransport(rec),
        ),
        rec,
    )


def test_customer_and_authorisation_order() -> None:
    a, rec = adapter(
        {
            ("POST", "/v1/customers"): (200, {"id": "cust_1"}),
            ("POST", "/v1/orders"): (200, {"id": "order_auth"}),
        }
    )
    assert a.ensure_customer(CUSTOMER, None) == "cust_1"
    assert a.ensure_customer(CUSTOMER, "cust_existing") == "cust_existing"  # no second call
    start = a.start_authorization(
        customer=CUSTOMER,
        provider_customer_id="cust_1",
        method_type="upi",
        max_amount=Decimal("15000.00"),
        currency="INR",
        metadata={"mandate_id": 3, "receipt": "mdt-3"},
    )
    auth = rec.requests[0].headers["authorization"]
    assert auth == "Basic " + base64.b64encode(f"{KEY_ID}:{KEY_SECRET}".encode()).decode()
    assert rec.body(0)["fail_existing"] == "0" and rec.body(0)["contact"] == CUSTOMER.phone
    order = rec.body(1)
    assert order["amount"] == 100 and order["method"] == "upi" and order["customer_id"] == "cust_1"
    assert order["token"] == {"max_amount": 1500000, "frequency": "as_presented"}
    assert order["receipt"] == "mdt-3" and order["notes"]["mandate_id"] == "3"
    assert start.reference == "order_auth"
    assert start.checkout["recurring"] == "1" and start.checkout["key"] == KEY_ID
    assert len(rec.requests) == 2


def test_upi_requires_inr() -> None:
    a, _ = adapter({})
    with pytest.raises(ProviderError):
        a.start_authorization(
            customer=CUSTOMER,
            provider_customer_id="c",
            method_type="upi",
            max_amount=Decimal("1"),
            currency="USD",
            metadata={},
        )


def checkout_signature(order_id: str, payment_id: str) -> str:
    msg = f"{order_id}|{payment_id}".encode()
    return hmac.new(KEY_SECRET.encode(), msg, hashlib.sha256).hexdigest()


def test_complete_authorisation_verifies_signature_and_reads_token() -> None:
    a, rec = adapter(
        {
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
        }
    )
    with pytest.raises(WebhookVerificationError):
        a.complete_authorization(
            reference="order_auth",
            client_payload={"razorpay_payment_id": "pay_auth", "razorpay_signature": "forged"},
        )
    assert rec.requests == []  # nothing fetched for a forged signature
    update = a.complete_authorization(
        reference="order_auth",
        client_payload={
            "razorpay_payment_id": "pay_auth",
            "razorpay_signature": checkout_signature("order_auth", "pay_auth"),
        },
    )
    assert (update.status, update.provider_mandate_id, update.display_hint) == (
        "active",
        "token_9",
        "Visa **** 4242",
    )


def test_signature_for_another_order_is_rejected() -> None:
    a, _ = adapter(
        {
            ("GET", "/v1/payments/pay_x"): (
                200,
                {"id": "pay_x", "order_id": "order_other", "token_id": "t"},
            )
        }
    )
    with pytest.raises(WebhookVerificationError):
        a.complete_authorization(
            reference="order_auth",
            client_payload={
                "razorpay_payment_id": "pay_x",
                "razorpay_signature": checkout_signature("order_auth", "pay_x"),
            },
        )


def test_recurring_charge_creates_order_then_payment() -> None:
    a, rec = adapter(
        {
            ("POST", "/v1/orders"): (200, {"id": "order_c1"}),
            ("POST", "/v1/payments/create/recurring"): (200, {"razorpay_payment_id": "pay_c1"}),
        }
    )
    result = a.initiate_charge(
        customer=CUSTOMER,
        provider_customer_id="cust_1",
        provider_mandate_id="token_9",
        amount=Decimal("1180.50"),
        currency="INR",
        idempotency_key="inv12-a1",
        description="Invoice INV/2026/000012",
        metadata={"invoice_id": 12},
    )
    order, pay = rec.body(0), rec.body(1)
    assert order == {
        "amount": 118050,
        "currency": "INR",
        "payment_capture": True,
        "receipt": "inv12-a1",
        "notes": {"invoice_id": "12"},
    }
    assert pay["order_id"] == "order_c1" and pay["token"] == "token_9"
    assert pay["customer_id"] == "cust_1" and pay["recurring"] is True and pay["amount"] == 118050
    assert (pay["email"], pay["contact"]) == (CUSTOMER.email, CUSTOMER.phone)
    assert (result.status, result.provider_reference, result.provider_payment_id) == (
        "processing",
        "order_c1",
        "pay_c1",
    )


def test_charge_failure_after_order_keeps_reference() -> None:
    a, _ = adapter(
        {
            ("POST", "/v1/orders"): (200, {"id": "order_c2"}),
            ("POST", "/v1/payments/create/recurring"): (
                400,
                {"error": {"description": "Amount exceeds maximum amount allowed"}},
            ),
        }
    )
    with pytest.raises(ProviderError) as exc:
        a.initiate_charge(
            customer=CUSTOMER,
            provider_customer_id="c",
            provider_mandate_id="token_9",
            amount=Decimal("1"),
            currency="INR",
            idempotency_key="k",
            description="d",
            metadata={},
        )
    assert exc.value.reference == "order_c2" and exc.value.retryable is False
    assert exc.value.outcome_unknown is False
    assert "maximum amount" in exc.value.message


def test_transport_errors_are_retryable() -> None:
    def boom(request):
        raise httpx.ConnectTimeout("timeout")

    a = RazorpayAdapter(
        key_id="k", key_secret="s", webhook_secret="w", transport=httpx.MockTransport(boom)
    )
    with pytest.raises(ProviderError) as exc:
        a.fetch_charge("order_1")
    assert exc.value.retryable is True and exc.value.reference is None
    assert exc.value.outcome_unknown is True
    a5, _ = adapter({("GET", "/v1/orders/order_1/payments"): (503, {})})
    with pytest.raises(ProviderError) as exc:
        a5.fetch_charge("order_1")
    assert exc.value.retryable is True


def test_fetch_charge_reads_order_payments() -> None:
    items = [
        {
            "id": "pay_f",
            "order_id": "order_1",
            "status": "failed",
            "amount": 1000,
            "error_code": "BAD_REQUEST_ERROR",
            "error_description": "Insufficient balance",
            "created_at": 1,
        },
        {
            "id": "pay_ok",
            "order_id": "order_1",
            "status": "captured",
            "amount": 118000,
            "method": "upi",
            "created_at": 2,
        },
    ]
    a, _ = adapter(
        {("GET", "/v1/orders/order_1/payments"): (200, {"entity": "collection", "items": items})}
    )
    r = a.fetch_charge("order_1")
    assert (r.status, r.provider_payment_id, r.amount, r.method_type) == (
        "succeeded",
        "pay_ok",
        Decimal("1180.00"),
        "upi",
    )
    a, _ = adapter({("GET", "/v1/orders/order_1/payments"): (200, {"items": items[:1]})})
    r = a.fetch_charge("order_1")
    assert (r.status, r.failure_message) == ("failed", "Insufficient balance")
    a, _ = adapter({("GET", "/v1/orders/order_1/payments"): (200, {"items": []})})
    assert a.fetch_charge("order_1").status == "processing"


def test_cancel_uses_method_specific_endpoint() -> None:
    a, rec = adapter(
        {
            ("PUT", "/v1/customers/c1/tokens/token_u/cancel"): (
                200,
                {"status": "cancellation_initiated"},
            ),
            ("DELETE", "/v1/customers/c1/tokens/token_c"): (200, {"deleted": True}),
        }
    )
    a.cancel_mandate(provider_customer_id="c1", provider_mandate_id="token_u", method_type="upi")
    a.cancel_mandate(provider_customer_id="c1", provider_mandate_id="token_c", method_type="card")
    a.cancel_mandate(
        provider_customer_id="c1", provider_mandate_id="order_never", method_type="card"
    )
    assert [(r.method, r.url.path) for r in rec.requests] == [
        ("PUT", "/v1/customers/c1/tokens/token_u/cancel"),
        ("DELETE", "/v1/customers/c1/tokens/token_c"),
    ]


def test_webhook_signature_and_event_id() -> None:
    a, _ = adapter({})
    raw = json.dumps({"event": "payment.captured", "payload": {}}).encode()
    sig = hmac.new(WH_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    [ev] = a.verify_webhook({"x-razorpay-signature": sig, "x-razorpay-event-id": "evt_1"}, raw)
    assert (ev.event_id, ev.event_type) == ("evt_1", "payment.captured")
    with pytest.raises(WebhookVerificationError):
        a.verify_webhook({"x-razorpay-signature": sig}, raw + b" ")
    with pytest.raises(WebhookVerificationError):
        a.verify_webhook({}, raw)


def payment_event(event: str, **entity) -> dict:
    return {
        "entity": "event",
        "event": event,
        "contains": ["payment"],
        "payload": {"payment": {"entity": entity}},
        "created_at": 1761900000,
    }


def test_parse_payment_events() -> None:
    a, _ = adapter({})
    ev = a.parse_event(
        "payment.captured",
        payment_event(
            "payment.captured",
            id="pay_1",
            order_id="order_1",
            amount=118000,
            status="captured",
            method="card",
            notes=[],
        ),
    )
    assert (ev.kind, ev.provider_reference, ev.provider_payment_id, ev.amount) == (
        "payment_succeeded",
        "order_1",
        "pay_1",
        Decimal("1180.00"),
    )
    failed = a.parse_event(
        "payment.failed",
        payment_event(
            "payment.failed",
            id="pay_2",
            order_id="order_2",
            amount=100,
            status="failed",
            token_id="token_u",
            error_reason="upi_dummy_payment",
            error_description="Payment was a dummy payment for one time mandate registration.",
        ),
    )
    assert failed.kind == "payment_failed" and failed.provider_mandate_id == "token_u"
    not_captured = a.parse_event(
        "order.paid", payment_event("order.paid", id="p", order_id="o", status="authorized")
    )
    assert not_captured.kind == "ignored"
    assert a.parse_event("refund.created", {}).kind == "ignored"


def test_parse_token_events() -> None:
    a, _ = adapter({})
    payload = {
        "event": "token.confirmed",
        "contains": ["token"],
        "payload": {
            "token": {
                "entity": {
                    "id": "token_9",
                    "method": "upi",
                    "vpa": {"username": "ravi", "handle": "okaxis"},
                }
            }
        },
    }
    ev = a.parse_event("token.confirmed", payload)
    assert (ev.kind, ev.provider_mandate_id, ev.display_hint) == (
        "mandate_active",
        "token_9",
        "UPI ravi@okaxis",
    )
    rejected = a.parse_event(
        "token.rejected",
        {
            "payload": {
                "token": {
                    "entity": {
                        "id": "token_9",
                        "recurring_details": {"failure_reason": "Rejected by bank"},
                    }
                }
            }
        },
    )
    assert (rejected.kind, rejected.failure_message) == ("mandate_failed", "Rejected by bank")
