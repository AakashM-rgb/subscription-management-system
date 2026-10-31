"""Test-only payment provider. It lives under tests/ so no production path can fake a payment."""

import hashlib
import hmac
import json
from dataclasses import dataclass, field
from decimal import Decimal
from itertools import count

from app.providers import (
    AuthorizationStart,
    ChargeResult,
    CustomerRef,
    MandateUpdate,
    NormalizedEvent,
    ProviderError,
    ProviderEventIn,
    WebhookVerificationError,
)

SECRET = b"fake-webhook-secret"


def install(monkeypatch):
    """Generator for a pytest fixture: register a fresh FakeProvider as the default provider."""
    from app import providers

    provider = FakeProvider()
    providers.register("fakepay", lambda: provider)
    monkeypatch.setattr(providers, "default_provider_name", lambda: "fakepay")
    monkeypatch.setattr("app.routers.portal_payments.default_provider_name", lambda: "fakepay")
    yield provider
    providers.unregister("fakepay")


@dataclass
class FakeProvider:
    name: str = "fakepay"
    charge_error: ProviderError | None = None
    charge_outcomes: dict[str, ChargeResult] = field(default_factory=dict)
    mandate_states: dict[str, MandateUpdate] = field(default_factory=dict)
    order_metadata: dict[str, dict] = field(default_factory=dict)
    calls: list[tuple] = field(default_factory=list)
    _ids: count = field(default_factory=lambda: count(1))

    def ensure_customer(self, customer: CustomerRef, existing_id: str | None) -> str:
        self.calls.append(("ensure_customer", customer.id, existing_id))
        return existing_id or f"cust_{customer.id}"

    def start_authorization(
        self, *, customer, provider_customer_id, method_type, max_amount, currency, metadata
    ) -> AuthorizationStart:
        ref = f"auth_{next(self._ids)}"
        self.calls.append(("start_authorization", ref, method_type, max_amount, metadata))
        return AuthorizationStart(provider_customer_id, ref, {"order_id": ref})

    def complete_authorization(self, *, reference, client_payload) -> MandateUpdate:
        if client_payload.get("signature") != f"ok:{reference}":
            raise WebhookVerificationError("bad checkout signature")
        return MandateUpdate(
            status="active",
            provider_mandate_id=f"tok_{reference}",
            method_type="card",
            display_hint="Visa **** 4242",
        )

    def fetch_mandate(self, *, provider_customer_id, provider_mandate_id):
        return self.mandate_states.get(provider_mandate_id)

    def cancel_mandate(self, *, provider_customer_id, provider_mandate_id, method_type) -> None:
        self.calls.append(("cancel_mandate", provider_mandate_id))

    def initiate_charge(
        self,
        *,
        customer,
        provider_customer_id,
        provider_mandate_id,
        amount,
        currency,
        idempotency_key,
        description,
        metadata,
    ) -> ChargeResult:
        self.calls.append(("initiate_charge", idempotency_key, amount, provider_mandate_id))
        if self.charge_error is not None:
            raise self.charge_error
        order = f"order_{idempotency_key}"
        self.order_metadata[order] = {k: str(v) for k, v in metadata.items()}
        return ChargeResult(status="processing", provider_reference=order)

    def fetch_charge(self, provider_reference: str) -> ChargeResult:
        return self.charge_outcomes.get(
            provider_reference,
            ChargeResult(status="processing", provider_reference=provider_reference),
        )

    def reference_metadata(self, provider_reference: str) -> dict:
        return self.order_metadata.get(provider_reference, {})

    def verify_webhook(self, headers, raw_body: bytes) -> list[ProviderEventIn]:
        expected = hmac.new(SECRET, raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, headers.get("x-fake-signature", "")):
            raise WebhookVerificationError()
        body = json.loads(raw_body)
        return [ProviderEventIn(body["id"], body["type"], body)]

    def parse_event(self, event_type: str, payload: dict) -> NormalizedEvent:
        data = dict(payload.get("normalized") or {"kind": "ignored"})
        if data.get("amount") is not None:
            data["amount"] = Decimal(data["amount"])
        return NormalizedEvent(**data)


def sign(raw: bytes) -> str:
    return hmac.new(SECRET, raw, hashlib.sha256).hexdigest()
