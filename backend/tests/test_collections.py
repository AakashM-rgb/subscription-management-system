import json
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import providers
from app.models import AuditEvent, Invoice, Payment, PaymentAttempt, PaymentMandate, ProviderEvent
from app.providers import ChargeResult, MandateUpdate, ProviderError
from app.providers.config import ProviderSettings
from app.services import collections
from tests import business_factories as f
from tests.conftest import login, make_user
from tests.fake_provider import FakeProvider, sign

API = "/api/v1"


@pytest.fixture
def fake(monkeypatch) -> FakeProvider:
    provider = FakeProvider()
    providers.register("fakepay", lambda: provider)
    monkeypatch.setattr(providers, "default_provider_name", lambda: "fakepay")
    monkeypatch.setattr("app.routers.portal_payments.default_provider_name", lambda: "fakepay")
    yield provider
    providers.unregister("fakepay")


def active_mandate(db: Session, customer, max_amount: str | None = None) -> PaymentMandate:
    mandate = PaymentMandate(
        customer_id=customer.id,
        provider="fakepay",
        provider_customer_id=f"cust_{customer.id}",
        provider_mandate_id=f"tok_{uuid.uuid4().hex[:10]}",
        status="active",
        method_type="card",
        max_amount=Decimal(max_amount) if max_amount else None,
        authorized_at=datetime.now(UTC),
    )
    db.add(mandate)
    db.flush()
    return mandate


def autopay_invoice(db: Session, total: str = "1180.00", max_amount: str | None = None):
    cust = f.customer(db)
    cust.phone = "+919847000000"
    mandate = active_mandate(db, cust, max_amount)
    sub = f.subscription(db, cust, status="active", auto_collect=True, mandate_id=mandate.id)
    return f.invoice(db, sub, total=total), mandate


def event(db: Session, kind: str, **fields) -> ProviderEvent:
    ev = ProviderEvent(
        provider="fakepay",
        event_id=uuid.uuid4().hex,
        event_type=kind,
        payload={"normalized": {"kind": kind, **fields}},
    )
    db.add(ev)
    db.flush()
    return ev


def payments_for(db: Session, invoice: Invoice) -> list[Payment]:
    return list(db.scalars(select(Payment).where(Payment.invoice_id == invoice.id)))


def audit_actions(db: Session, invoice_id: int) -> list[str]:
    return list(
        db.scalars(
            select(AuditEvent.action)
            .where(AuditEvent.entity_type == "invoice", AuditEvent.entity_id == invoice_id)
            .order_by(AuditEvent.id)
        )
    )


NOW = datetime.now(UTC)


# ----------------------------------------------------------------------------- configuration


def test_razorpay_without_keys_is_not_configured(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.providers.get_provider_settings", lambda: ProviderSettings(_env_file=None)
    )
    with pytest.raises(providers.ProviderNotConfigured) as exc:
        providers.get_adapter("razorpay")
    assert exc.value.status_code == 503
    with pytest.raises(providers.ProviderNotConfigured):
        providers.get_adapter("unknown")


def test_portal_autopay_unavailable_without_provider(client: TestClient, db: Session, monkeypatch):
    monkeypatch.setattr("app.routers.portal_payments.default_provider_name", lambda: "nopay")
    cust = f.portal_customer(db, "nopay@portal.example.com")
    cust.phone = "+919847000001"
    login(client, "nopay@portal.example.com")
    res = client.post(f"{API}/portal/payment-methods", json={"method_type": "upi"})
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "PROVIDER_NOT_CONFIGURED"


# ----------------------------------------------------------------------------- mandates


def test_customer_authorises_autopay(client: TestClient, db: Session, fake) -> None:
    cust = f.portal_customer(db, "auto@portal.example.com")
    sub = f.subscription(db, cust, status="active")
    login(client, "auto@portal.example.com")

    res = client.post(f"{API}/portal/payment-methods", json={"method_type": "card"})
    assert res.status_code == 422  # phone needed for recurring charges
    cust.phone = "+919847000002"
    db.flush()

    res = client.post(
        f"{API}/portal/payment-methods", json={"method_type": "card", "max_amount": "5000.00"}
    )
    assert res.status_code == 201, res.text
    started = res.json()
    assert started["mandate"]["status"] == "pending"
    ref = started["checkout"]["order_id"]
    mandate_id = started["mandate"]["id"]

    bad = client.post(
        f"{API}/portal/payment-methods/{mandate_id}/confirm",
        json={"provider_response": {"signature": "forged"}},
    )
    assert bad.status_code == 400
    res = client.post(
        f"{API}/portal/payment-methods/{mandate_id}/confirm",
        json={"provider_response": {"signature": f"ok:{ref}"}},
    )
    assert res.status_code == 200, res.text
    assert (res.json()["status"], res.json()["display_hint"]) == ("active", "Visa **** 4242")
    db.refresh(sub)
    assert sub.auto_collect is True and sub.mandate_id == mandate_id

    listed = client.get(f"{API}/portal/payment-methods").json()
    assert [m["id"] for m in listed] == [mandate_id]
    res = client.delete(f"{API}/portal/payment-methods/{mandate_id}")
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    db.refresh(sub)
    assert (sub.auto_collect, sub.mandate_id) == (False, None)
    assert ("cancel_mandate", f"tok_{ref}") in fake.calls
    assert client.get(f"{API}/portal/payment-methods").json() == []


def test_customers_cannot_touch_each_others_mandates(client: TestClient, db: Session, fake):
    other = f.customer(db)
    theirs = active_mandate(db, other)
    f.portal_customer(db, "snoop@portal.example.com")
    login(client, "snoop@portal.example.com")
    assert client.delete(f"{API}/portal/payment-methods/{theirs.id}").status_code == 404
    assert client.get(f"{API}/mandates").status_code == 403


def test_staff_sees_mandates(staff_client: TestClient, db: Session) -> None:
    cust = f.customer(db)
    active_mandate(db, cust)
    res = staff_client.get(f"{API}/mandates?customer_id={cust.id}")
    assert res.status_code == 200 and res.json()["total"] == 1
    assert "provider_mandate_id" not in res.json()["items"][0]


def test_token_events_drive_mandate_status(db: Session, fake) -> None:
    cust = f.customer(db)
    sub = f.subscription(db, cust, status="active")
    mandate = PaymentMandate(
        customer_id=cust.id,
        provider="fakepay",
        provider_customer_id="c",
        provider_mandate_id="auth_9",
        status="pending",
    )
    db.add(mandate)
    db.flush()
    # Authorisation payment reveals the real mandate id; it is still pending until confirmed.
    ev = event(db, "payment_failed", authorization_reference="auth_9", provider_mandate_id="tok_9")
    assert collections.handle_event(db, ev) == "processed"
    assert (mandate.provider_mandate_id, mandate.status) == ("tok_9", "pending")
    assert (
        collections.handle_event(db, event(db, "mandate_active", provider_mandate_id="tok_9"))
        == "processed"
    )
    assert mandate.status == "active"
    db.refresh(sub)
    assert sub.auto_collect is True
    assert (
        collections.handle_event(db, event(db, "mandate_active", provider_mandate_id="tok_9"))
        == "ignored"
    )
    collections.handle_event(db, event(db, "mandate_cancelled", provider_mandate_id="tok_9"))
    assert mandate.status == "cancelled"
    # Final states never reopen.
    collections.handle_event(db, event(db, "mandate_active", provider_mandate_id="tok_9"))
    assert mandate.status == "cancelled"


# ----------------------------------------------------------------------------- charging


def test_collect_due_charges_once(db: Session, fake) -> None:
    invoice, mandate = autopay_invoice(db)
    assert collections.collect_due(db, NOW) >= 1
    attempts = list(
        db.scalars(select(PaymentAttempt).where(PaymentAttempt.invoice_id == invoice.id))
    )
    assert len(attempts) == 1
    a = attempts[0]
    assert (a.status, a.amount, a.attempt_number, a.provider_reference) == (
        "processing",
        Decimal("1180.00"),
        1,
        f"order_inv{invoice.id}-a1",
    )
    collections.collect_due(db, NOW)  # second run: already has an attempt
    assert db.scalar(select(func.count()).where(PaymentAttempt.invoice_id == invoice.id)) == 1
    assert payments_for(db, invoice) == []  # no money until the provider confirms


def test_success_event_posts_payment_once(db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    ref = attempt.provider_reference
    ok = {
        "provider_reference": ref,
        "provider_payment_id": "pay_1",
        "amount": "1180.00",
        "method_type": "upi",
    }
    assert collections.handle_event(db, event(db, "payment_succeeded", **ok)) == "processed"
    assert collections.handle_event(db, event(db, "payment_succeeded", **ok)) == "ignored"
    db.refresh(invoice)
    assert (invoice.status, invoice.amount_due) == ("paid", Decimal("0.00"))
    [payment] = payments_for(db, invoice)
    assert (payment.method, payment.provider, payment.provider_payment_id) == (
        "upi",
        "fakepay",
        "pay_1",
    )
    assert payment.payment_attempt_id == attempt.id
    assert attempt.status == "succeeded"


def test_failure_schedules_retry_and_retry_charges_again(db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db)
    first = collections.collect_invoice(db, invoice.id, NOW)
    collections.handle_event(
        db,
        event(
            db,
            "payment_failed",
            provider_reference=first.provider_reference,
            failure_code="BAD_REQUEST_ERROR",
            failure_message="Insufficient funds",
        ),
    )
    assert first.status == "failed" and first.failure_message == "Insufficient funds"
    assert first.next_retry_at is not None
    assert collections.retry_failed(db, NOW) == 0  # not yet due
    later = first.next_retry_at + timedelta(minutes=1)
    assert collections.retry_failed(db, later) == 1
    second = db.scalar(
        select(PaymentAttempt).where(
            PaymentAttempt.invoice_id == invoice.id, PaymentAttempt.attempt_number == 2
        )
    )
    assert second.status == "processing" and first.next_retry_at is None


def test_retries_stop_after_schedule(db: Session, fake, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.collections.get_provider_settings",
        lambda: ProviderSettings(_env_file=None, collection_retry_hours="1"),
    )
    invoice, _ = autopay_invoice(db)
    for _ in range(2):
        attempt = collections.collect_invoice(db, invoice.id, NOW)
        collections.handle_event(
            db, event(db, "payment_failed", provider_reference=attempt.provider_reference)
        )
    assert attempt.attempt_number == 2 and attempt.next_retry_at is None


def test_late_success_after_failure_is_honoured(db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    ref = attempt.provider_reference
    collections.handle_event(db, event(db, "payment_failed", provider_reference=ref))
    collections.handle_event(
        db,
        event(
            db,
            "payment_succeeded",
            provider_reference=ref,
            provider_payment_id="pay_x",
            amount="1180.00",
        ),
    )
    db.refresh(invoice)
    assert invoice.status == "paid" and attempt.status == "succeeded"
    assert attempt.next_retry_at is None


def test_unapplicable_money_is_audited_not_lost(db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    # Provider reports more than is due (e.g. amount changed on its side).
    outcome = collections.handle_event(
        db,
        event(
            db,
            "payment_succeeded",
            provider_reference=attempt.provider_reference,
            provider_payment_id="pay_big",
            amount="2000.00",
        ),
    )
    assert outcome == "processed"  # never left failing for endless retries
    assert payments_for(db, invoice) == []
    assert attempt.status == "succeeded"
    unapplied = db.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "payment.unapplied", AuditEvent.entity_id == invoice.id
        )
    )
    assert unapplied.data["provider_payment_id"] == "pay_big"
    assert unapplied.data["amount"] == "2000.00"
    assert "exceeds" in unapplied.data["reason"]


def test_staff_can_list_unapplied_money(client: TestClient, db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    collections.handle_event(
        db,
        event(
            db,
            "payment_succeeded",
            provider_reference=attempt.provider_reference,
            provider_payment_id="pay_refund_me",
            amount="9999.00",
        ),
    )
    login(client, make_user(db, "staff").email)
    rows = client.get(f"{API}/reports/unapplied-payments").json()["items"]
    row = next(r for r in rows if r["provider_payment_id"] == "pay_refund_me")
    assert (row["amount"], row["invoice_id"], row["provider"]) == ("9999.00", invoice.id, "fakepay")
    f.portal_customer(db, "nosy@portal.example.com")
    login(client, "nosy@portal.example.com")
    assert client.get(f"{API}/reports/unapplied-payments").status_code == 403


def test_orphan_provider_payment_is_matched_by_metadata(db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db)
    fake.order_metadata["order_lost"] = {"invoice_id": str(invoice.id)}
    outcome = collections.handle_event(
        db,
        event(
            db,
            "payment_succeeded",
            provider_reference="order_lost",
            provider_payment_id="pay_orphan",
            amount="1180.00",
        ),
    )
    assert outcome == "processed"
    db.refresh(invoice)
    assert invoice.status == "paid"
    fake.order_metadata["order_unknown"] = {}
    collections.handle_event(
        db,
        event(
            db,
            "payment_succeeded",
            provider_reference="order_unknown",
            provider_payment_id="pay_nowhere",
            amount="5.00",
        ),
    )
    assert (
        db.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(
                AuditEvent.action == "payment.unapplied", AuditEvent.entity_type == "provider_event"
            )
        )
        >= 1
    )


def test_reconcile_settles_stuck_attempts(db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    fake.charge_outcomes[attempt.provider_reference] = ChargeResult(
        status="succeeded",
        provider_reference=attempt.provider_reference,
        provider_payment_id="pay_rec",
        amount=Decimal("1180.00"),
        method_type="card",
    )
    assert collections.reconcile_pending(db, NOW) == 0  # too recent to chase
    assert collections.reconcile_pending(db, NOW + timedelta(hours=1)) >= 1
    db.refresh(invoice)
    assert invoice.status == "paid" and attempt.status == "succeeded"


def test_reconcile_fails_never_submitted_attempt(db: Session, fake) -> None:
    invoice, mandate = autopay_invoice(db)
    stuck = PaymentAttempt(
        invoice_id=invoice.id,
        mandate_id=mandate.id,
        provider="fakepay",
        idempotency_key=f"stuck-{invoice.id}",
        amount=Decimal("1180.00"),
    )
    db.add(stuck)
    db.flush()
    collections.reconcile_pending(db, NOW + timedelta(hours=1))
    assert (stuck.status, stuck.failure_code) == ("failed", "not_submitted")
    assert stuck.next_retry_at is not None


def test_reconcile_activates_pending_mandate(db: Session, fake) -> None:
    cust = f.customer(db)
    mandate = PaymentMandate(
        customer_id=cust.id,
        provider="fakepay",
        provider_customer_id="c",
        provider_mandate_id="tok_pending",
        status="pending",
    )
    db.add(mandate)
    db.flush()
    fake.mandate_states["tok_pending"] = MandateUpdate(status="active", display_hint="UPI a@b")
    collections.reconcile_pending(db, NOW + timedelta(hours=1))
    assert mandate.status == "active" and mandate.display_hint == "UPI a@b"


def test_provider_error_before_order_fails_attempt(db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db)
    fake.charge_error = ProviderError("Razorpay unreachable")
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    assert (attempt.status, attempt.failure_code) == ("failed", "provider_error")
    assert attempt.next_retry_at is not None


def test_provider_error_after_order_waits_for_reconcile(db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db)
    fake.charge_error = ProviderError("timeout", reference="order_half")
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    assert (attempt.status, attempt.provider_reference) == ("processing", "order_half")


# ----------------------------------------------------------------------------- staff API


def test_staff_collect_endpoint_and_manual_payment_guard(client: TestClient, db: Session, fake):
    invoice, _ = autopay_invoice(db)
    login(client, make_user(db, "staff").email)
    res = client.post(f"{API}/invoices/{invoice.id}/collect")
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "processing"
    again = client.post(f"{API}/invoices/{invoice.id}/collect")
    assert again.status_code == 409
    manual = client.post(
        f"{API}/payments",
        json={
            "invoice_id": invoice.id,
            "method": "cash",
            "amount": "10.00",
            "payment_date": str(datetime.now(UTC).date() - timedelta(days=1)),
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert manual.status_code == 409  # would race the in-flight provider charge
    attempts = client.get(f"{API}/invoices/{invoice.id}/payment-attempts").json()
    assert [a["status"] for a in attempts] == ["processing"]


def test_collect_respects_mandate_limit(staff_client: TestClient, db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db, total="1180.00", max_amount="1000.00")
    res = staff_client.post(f"{API}/invoices/{invoice.id}/collect")
    assert res.status_code == 409 and "limit" in res.json()["error"]["message"]


def test_collect_needs_a_mandate(staff_client: TestClient, db: Session, fake) -> None:
    invoice = f.invoice(db, f.subscription(db, f.customer(db)))
    assert staff_client.post(f"{API}/invoices/{invoice.id}/collect").status_code == 409


def test_signed_webhook_end_to_end(client: TestClient, db: Session, fake) -> None:
    """Through Claude 1's inbox: verify -> store once -> handle_event -> ledger."""
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    body = {
        "id": "evt_e2e",
        "type": "payment_succeeded",
        "normalized": {
            "kind": "payment_succeeded",
            "provider_reference": attempt.provider_reference,
            "provider_payment_id": "pay_e2e",
            "amount": "1180.00",
            "method_type": "card",
        },
    }
    raw = json.dumps(body).encode()
    res = client.post(
        f"{API}/webhooks/payments/fakepay",
        content=raw,
        headers={"x-fake-signature": sign(raw), "content-type": "application/json"},
    )
    assert res.status_code == 200, res.text
    stored = db.scalar(select(ProviderEvent).where(ProviderEvent.event_id == "evt_e2e"))
    assert stored.status == "processed", stored.processing_error
    db.refresh(invoice)
    assert invoice.status == "paid"
    tampered = client.post(
        f"{API}/webhooks/payments/fakepay", content=raw, headers={"x-fake-signature": "0" * 64}
    )
    assert tampered.status_code == 400


def test_confirm_is_idempotent_after_webhook(client: TestClient, db: Session, fake) -> None:
    cust = f.portal_customer(db, "race@portal.example.com")
    cust.phone = "+919847000003"
    login(client, "race@portal.example.com")
    started = client.post(f"{API}/portal/payment-methods", json={"method_type": "card"}).json()
    mandate = db.get(PaymentMandate, started["mandate"]["id"])
    # The provider's webhook wins the race and activates the mandate first.
    collections.apply_mandate_update(
        db, mandate, MandateUpdate(status="active", provider_mandate_id="tok_race")
    )
    res = client.post(
        f"{API}/portal/payment-methods/{mandate.id}/confirm",
        json={"provider_response": {"signature": "anything"}},
    )
    assert res.status_code == 200 and res.json()["status"] == "active"


def test_abandoned_authorisation_expires(db: Session, fake) -> None:
    cust = f.customer(db)
    old = PaymentMandate(
        customer_id=cust.id,
        provider="fakepay",
        provider_customer_id="c",
        provider_mandate_id="auth_old",
        status="pending",
    )
    fresh = PaymentMandate(
        customer_id=cust.id,
        provider="fakepay",
        provider_customer_id="c",
        provider_mandate_id="auth_fresh",
        status="pending",
    )
    db.add_all([old, fresh])
    db.flush()
    db.execute(
        PaymentMandate.__table__.update()
        .where(PaymentMandate.id == old.id)
        .values(created_at=NOW - timedelta(days=2), updated_at=NOW - timedelta(days=2))
    )
    db.refresh(old)
    collections.reconcile_pending(db, NOW + timedelta(hours=1))
    assert old.status == "failed"
    assert fresh.status == "pending"
    assert fresh.updated_at > NOW  # checked and rotated, not re-polled first next time


def test_slow_charges_rotate_instead_of_blocking(db: Session, fake) -> None:
    invoice, _ = autopay_invoice(db)
    attempt = collections.collect_invoice(db, invoice.id, NOW)
    later = NOW + timedelta(hours=1)
    assert collections.reconcile_pending(db, later) == 0  # provider still processing
    assert attempt.status == "processing" and attempt.updated_at == later
