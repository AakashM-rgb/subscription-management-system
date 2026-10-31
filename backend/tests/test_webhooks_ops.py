import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import date

import pytest
from sqlalchemy import select

from app.models import BillingRun, ProviderEvent
from app.services import billing, webhooks

SECRET = b"whsec_test"
URL = "/api/v1/webhooks/payments/fakepay"


class NotConfigured(Exception):
    pass


class BadSignature(Exception):
    pass


@dataclass(frozen=True)
class EventIn:
    event_id: str
    event_type: str
    payload: dict


class FakeAdapter:
    def verify_webhook(self, headers, raw_body):
        expected = hmac.new(SECRET, raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, headers.get("x-signature", "")):
            raise BadSignature("bad signature")
        body = json.loads(raw_body)
        return [EventIn(body["id"], body["type"], body)]


@pytest.fixture
def handled(monkeypatch):
    calls = []

    def handle_event(db, event):
        if event.payload.get("explode"):
            raise RuntimeError("downstream failure")
        calls.append(event.event_id)
        return "ignored" if event.event_type == "unknown" else "processed"

    def get_adapter(name):
        if name != "fakepay":
            raise NotConfigured(f"{name} is not configured")
        return FakeAdapter()

    api = webhooks.ProviderApi(get_adapter, NotConfigured, BadSignature, handle_event)
    monkeypatch.setattr(webhooks, "provider_api", lambda: api)
    return calls


def post(client, body: dict, secret: bytes = SECRET, url: str = URL):
    raw = json.dumps(body).encode()
    sig = hmac.new(secret, raw, hashlib.sha256).hexdigest()
    return client.post(
        url,
        content=raw,
        headers={
            "x-signature": sig,
            "content-type": "application/json",
            "origin": "https://provider.example",
        },
    )


def test_verified_event_is_stored_once_and_processed(client, db, handled):
    body = {"id": "evt_1", "type": "payment.captured"}
    first = post(client, body)
    assert first.status_code == 200 and first.json() == {"received": 1, "duplicates": 0}
    again = post(client, body)  # provider retry
    assert again.json() == {"received": 0, "duplicates": 1}
    assert handled == ["evt_1"]
    event = db.scalar(select(ProviderEvent).where(ProviderEvent.event_id == "evt_1"))
    assert event.status == "processed" and event.processed_at is not None


def test_bad_signature_rejected_and_nothing_stored(client, db, handled):
    res = post(client, {"id": "evt_2", "type": "payment.captured"}, secret=b"wrong")
    assert res.status_code == 400 and res.json()["error"]["code"] == "INVALID_SIGNATURE"
    assert db.scalar(select(ProviderEvent).where(ProviderEvent.event_id == "evt_2")) is None


def test_unknown_provider_is_503(client, handled):
    res = post(client, {"id": "evt_3", "type": "x"}, url="/api/v1/webhooks/payments/other")
    assert res.status_code == 503 and res.json()["error"]["code"] == "PROVIDER_NOT_CONFIGURED"


def test_failed_processing_is_kept_and_retried(client, db, handled):
    res = post(client, {"id": "evt_4", "type": "payment.failed", "explode": True})
    assert res.status_code == 200  # stored: provider must not keep retrying
    event = db.scalar(select(ProviderEvent).where(ProviderEvent.event_id == "evt_4"))
    assert event.status == "failed" and "downstream failure" in event.processing_error
    event.payload = {**event.payload, "explode": False}
    db.flush()
    assert webhooks.reprocess_pending(db) == 1
    assert event.status == "processed"


def test_without_provider_package_endpoint_is_503(client):
    res = client.post(URL, content=b"{}")
    assert res.status_code == 503


def test_orphaned_running_billing_run_is_closed(db):
    orphan = BillingRun(trigger="scheduled", as_of=date(2026, 1, 1), status="running")
    db.add(orphan)
    db.flush()
    billing.run_billing(db, as_of=date(2026, 1, 1), trigger="manual")
    db.refresh(orphan)
    assert orphan.status == "failed" and "interrupted" in orphan.error


def test_request_id_is_returned(client):
    res = client.get("/api/v1/health", headers={"X-Request-ID": "abc12345-req"})
    assert res.headers["X-Request-ID"] == "abc12345-req"
    assert len(client.get("/api/v1/health").headers["X-Request-ID"]) == 32
