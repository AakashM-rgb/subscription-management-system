"""Razorpay adapter for recurring card and UPI Autopay collections.

API facts used here were checked against Razorpay's official documentation (Oct 2026):
- REST base https://api.razorpay.com/v1, HTTP Basic auth key_id:key_secret, JSON bodies,
  amounts in paise.
- Mandate registration: POST /customers (fail_existing="0" returns the existing customer), then
  an authorisation order POST /orders {amount>=100, currency, customer_id, method, token{...}}.
  Checkout returns razorpay_payment_id + razorpay_signature where
  signature = hex HMAC-SHA256(key_secret, order_id + "|" + payment_id). The token id is read from
  GET /payments/{id} (`token_id`). A UPI registration can come back as a failed "dummy" payment
  (error_reason "upi_dummy_payment") that still carries a token_id: that is a success.
- Charging: POST /orders {amount, currency, payment_capture, receipt(<=40 chars, unique), notes},
  then POST /payments/create/recurring {email, contact, amount, currency, order_id, customer_id,
  token, recurring, description, notes}. Razorpay has no idempotency header, so the order receipt
  carries our attempt key and every charge is a fresh order.
- Status: GET /orders/{id}/payments lists the order's payments (created|authorized|captured|
  refunded|failed). GET /customers/{c}/tokens/{t} gives recurring_details.status
  (initiated|confirmed|rejected|cancelled|paused).
- Cancel: UPI PUT /customers/{c}/tokens/{t}/cancel; cards DELETE /customers/{c}/tokens/{t}.
- Webhooks: X-Razorpay-Signature = hex HMAC-SHA256(webhook_secret, raw body); dedupe on
  X-Razorpay-Event-Id. Payment entity at payload.payment.entity, token at payload.token.entity.
  Order notes are not guaranteed on payments, so charges are matched by order_id.
"""

import hashlib
import hmac
import json
from datetime import UTC, datetime
from decimal import Decimal

import httpx

from app.providers.base import (
    AuthorizationStart,
    ChargeResult,
    CustomerRef,
    MandateUpdate,
    NormalizedEvent,
    ProviderError,
    ProviderEventIn,
    WebhookVerificationError,
)

PAISE = Decimal(100)
AUTH_AMOUNT_PAISE = 100  # Razorpay's minimum authorisation amount (INR 1.00)
TOKEN_STATUS = {
    "initiated": "pending",
    "confirmed": "active",
    "rejected": "failed",
    "cancelled": "cancelled",
    "paused": "paused",
}
TOKEN_EVENTS = {
    "token.confirmed": "mandate_active",
    "token.rejected": "mandate_failed",
    "token.cancelled": "mandate_cancelled",
    "token.paused": "mandate_paused",
}


def to_paise(amount: Decimal) -> int:
    paise = amount * PAISE
    if paise != paise.to_integral_value():
        raise ProviderError("Amounts must have at most 2 decimals", retryable=False)
    return int(paise)


def from_paise(value: int | None) -> Decimal | None:
    return None if value is None else (Decimal(value) / PAISE).quantize(Decimal("0.01"))


def _notes(metadata: dict) -> dict:
    # Razorpay notes: at most 15 string pairs of up to 256 characters.
    return {str(k)[:256]: str(v)[:256] for k, v in list(metadata.items())[:15]}


def _as_dict(notes: object) -> dict:
    return notes if isinstance(notes, dict) else {}  # empty notes arrive as []


def _ts(value: int | None) -> datetime | None:
    return datetime.fromtimestamp(value, UTC) if value else None


def _display_hint(token: dict) -> str | None:
    card = token.get("card") or {}
    if card.get("last4"):
        return f"{card.get('network') or 'Card'} **** {card['last4']}"
    vpa = token.get("vpa") or {}
    if vpa.get("username"):
        return f"UPI {vpa['username']}@{vpa.get('handle') or ''}".rstrip("@")
    return None


class RazorpayAdapter:
    name = "razorpay"

    def __init__(
        self,
        *,
        key_id: str,
        key_secret: str,
        webhook_secret: str,
        base_url: str = "https://api.razorpay.com/v1",
        timeout: float = 15.0,
        transport: httpx.BaseTransport | None = None,
    ):
        self.key_id = key_id
        self._key_secret = key_secret
        self._webhook_secret = webhook_secret
        self._client = httpx.Client(
            base_url=base_url,
            auth=(key_id, key_secret),
            timeout=timeout,
            transport=transport,
            headers={"Content-Type": "application/json"},
        )

    # ------------------------------------------------------------------ http

    def _call(self, method: str, path: str, body: dict | None = None) -> dict:
        try:
            res = self._client.request(method, path, json=body)
        except httpx.HTTPError as exc:
            raise ProviderError(f"Razorpay unreachable: {type(exc).__name__}") from exc
        if res.status_code >= 500:
            raise ProviderError(f"Razorpay error {res.status_code}")
        try:
            data = res.json()
        except ValueError as exc:
            raise ProviderError(f"Razorpay returned non-JSON ({res.status_code})") from exc
        if res.status_code >= 400:
            err = data.get("error") or {}
            # An explicit rejection: Razorpay did not act on the request.
            raise ProviderError(
                err.get("description") or f"Razorpay rejected the request ({res.status_code})",
                retryable=res.status_code == 429,
                outcome_unknown=False,
                code=err.get("code"),
            )
        return data

    # ------------------------------------------------------------------ mandates

    def ensure_customer(self, customer: CustomerRef, existing_id: str | None) -> str:
        if existing_id:
            return existing_id
        body = {
            "name": customer.name[:50],
            "email": customer.email,
            "fail_existing": "0",
            "notes": _notes({"customer_id": customer.id}),
        }
        if customer.phone:
            body["contact"] = customer.phone
        return self._call("POST", "/customers", body)["id"]

    def start_authorization(
        self,
        *,
        customer: CustomerRef,
        provider_customer_id: str,
        method_type: str,
        max_amount: Decimal,
        currency: str,
        metadata: dict,
    ) -> AuthorizationStart:
        if method_type not in ("card", "upi"):
            raise ProviderError("Razorpay mandates support card or upi", retryable=False)
        if method_type == "upi" and currency != "INR":
            raise ProviderError("UPI Autopay is only available in INR", retryable=False)
        body = {
            "amount": AUTH_AMOUNT_PAISE,
            "currency": currency,
            "customer_id": provider_customer_id,
            "method": method_type,
            "notes": _notes(metadata),
            "token": {"max_amount": to_paise(max_amount), "frequency": "as_presented"},
        }
        if metadata.get("receipt"):
            body["receipt"] = str(metadata["receipt"])[:40]
        order = self._call("POST", "/orders", body)
        return AuthorizationStart(
            provider_customer_id=provider_customer_id,
            reference=order["id"],
            checkout={
                "provider": self.name,
                "key": self.key_id,
                "order_id": order["id"],
                "customer_id": provider_customer_id,
                "recurring": "1" if method_type == "upi" else True,
                "amount": AUTH_AMOUNT_PAISE,
                "currency": currency,
                "prefill": {
                    "name": customer.name,
                    "email": customer.email,
                    "contact": customer.phone or "",
                },
            },
        )

    def complete_authorization(self, *, reference: str, client_payload: dict) -> MandateUpdate:
        payment_id = str(client_payload.get("razorpay_payment_id") or "")
        signature = str(client_payload.get("razorpay_signature") or "")
        # `reference` is our authorisation order id until a webhook replaces it with the token
        # id. The order id then comes from the browser, which is safe only because the
        # signature plus the token check below bind the payment to this mandate.
        by_token = reference.startswith("token_")
        order_id = str(client_payload.get("razorpay_order_id") or "") if by_token else reference
        expected = hmac.new(
            self._key_secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
        ).hexdigest()
        if not payment_id or not order_id or not hmac.compare_digest(expected, signature):
            raise WebhookVerificationError("Checkout signature verification failed")
        payment = self._call("GET", f"/payments/{payment_id}")
        if payment.get("order_id") != order_id or (
            by_token and payment.get("token_id") != reference
        ):
            raise WebhookVerificationError("Checkout payment does not belong to this mandate")
        token_id = payment.get("token_id")
        if not token_id:
            return MandateUpdate(status="failed", failure_message=payment.get("error_description"))
        update = self.fetch_mandate(
            provider_customer_id=payment.get("customer_id"), provider_mandate_id=token_id
        )
        return update or MandateUpdate(status="pending", provider_mandate_id=token_id)

    def fetch_mandate(
        self, *, provider_customer_id: str | None, provider_mandate_id: str
    ) -> MandateUpdate | None:
        if not provider_mandate_id.startswith("token_") or not provider_customer_id:
            return None
        token = self._call("GET", f"/customers/{provider_customer_id}/tokens/{provider_mandate_id}")
        details = token.get("recurring_details") or {}
        return MandateUpdate(
            status=TOKEN_STATUS.get(details.get("status"), "pending"),
            provider_mandate_id=token["id"],
            method_type=token.get("method"),
            display_hint=_display_hint(token),
            failure_message=details.get("failure_reason"),
        )

    def cancel_mandate(
        self, *, provider_customer_id: str | None, provider_mandate_id: str, method_type: str | None
    ) -> None:
        if not provider_mandate_id.startswith("token_") or not provider_customer_id:
            return  # authorisation never completed: nothing exists to cancel
        path = f"/customers/{provider_customer_id}/tokens/{provider_mandate_id}"
        if method_type == "upi":
            self._call("PUT", f"{path}/cancel")
        else:
            self._call("DELETE", path)

    # ------------------------------------------------------------------ charges

    def initiate_charge(
        self,
        *,
        customer: CustomerRef,
        provider_customer_id: str | None,
        provider_mandate_id: str,
        amount: Decimal,
        currency: str,
        idempotency_key: str,
        description: str,
        metadata: dict,
    ) -> ChargeResult:
        if not customer.phone:
            raise ProviderError("Recurring charges need the customer's phone", retryable=False)
        paise = to_paise(amount)
        order = self._call(
            "POST",
            "/orders",
            {
                "amount": paise,
                "currency": currency,
                "payment_capture": True,
                "receipt": idempotency_key[:40],
                "notes": _notes(metadata),
            },
        )
        try:
            res = self._call(
                "POST",
                "/payments/create/recurring",
                {
                    "email": customer.email,
                    "contact": customer.phone,
                    "amount": paise,
                    "currency": currency,
                    "order_id": order["id"],
                    "customer_id": provider_customer_id,
                    "token": provider_mandate_id,
                    "recurring": True,
                    "description": description[:255],
                    "notes": _notes(metadata),
                },
            )
        except ProviderError as exc:
            # The order exists; reconciliation will look at it if the outcome is unknown.
            exc.reference = order["id"]
            raise
        return ChargeResult(
            status="processing",
            provider_reference=order["id"],
            provider_payment_id=res.get("razorpay_payment_id"),
            amount=amount,
        )

    def fetch_charge(self, provider_reference: str) -> ChargeResult:
        payments = self._call("GET", f"/orders/{provider_reference}/payments").get("items", [])
        captured = next((p for p in payments if p.get("status") == "captured"), None)
        if captured is not None:
            return self._charge_from_payment(captured, "succeeded")
        if any(p.get("status") in ("created", "authorized") for p in payments):
            return ChargeResult(status="processing", provider_reference=provider_reference)
        failed = [p for p in payments if p.get("status") == "failed"]
        if failed:
            return self._charge_from_payment(
                max(failed, key=lambda p: p.get("created_at", 0)), "failed"
            )
        return ChargeResult(status="processing", provider_reference=provider_reference)

    def reference_metadata(self, provider_reference: str) -> dict:
        order = self._call("GET", f"/orders/{provider_reference}")
        meta = _as_dict(order.get("notes"))
        if order.get("receipt"):
            meta.setdefault("receipt", order["receipt"])
        return meta

    def _charge_from_payment(self, payment: dict, status: str) -> ChargeResult:
        return ChargeResult(
            status=status,
            provider_reference=payment.get("order_id"),
            provider_payment_id=payment.get("id"),
            amount=from_paise(payment.get("amount")),
            currency=payment.get("currency"),
            method_type=payment.get("method"),
            failure_code=payment.get("error_code") or None,
            failure_message=payment.get("error_description") or None,
            occurred_at=_ts(payment.get("created_at")),
        )

    # ------------------------------------------------------------------ webhooks

    def verify_webhook(self, headers: dict[str, str], raw_body: bytes) -> list[ProviderEventIn]:
        signature = headers.get("x-razorpay-signature", "")
        expected = hmac.new(self._webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if not signature or not hmac.compare_digest(expected, signature):
            raise WebhookVerificationError()
        try:
            body = json.loads(raw_body)
        except ValueError as exc:
            raise WebhookVerificationError("Webhook body is not JSON") from exc
        # Dedupe on the signed body, not on X-Razorpay-Event-Id: the header is not covered by
        # the signature, so a replayed body with an edited header would look like a new event.
        # Razorpay's redeliveries are byte-identical, so they still collapse to one event.
        event_id = "sha256:" + hashlib.sha256(raw_body).hexdigest()
        return [ProviderEventIn(event_id=event_id, event_type=str(body.get("event")), payload=body)]

    def parse_event(self, event_type: str, payload: dict) -> NormalizedEvent:
        inner = payload.get("payload") or {}
        if event_type in TOKEN_EVENTS:
            token = (inner.get("token") or {}).get("entity") or {}
            details = token.get("recurring_details") or {}
            return NormalizedEvent(
                kind=TOKEN_EVENTS[event_type],
                provider_mandate_id=token.get("id"),
                method_type=token.get("method"),
                display_hint=_display_hint(token),
                failure_message=details.get("failure_reason"),
                occurred_at=_ts(payload.get("created_at")),
            )
        if event_type not in (
            "payment.authorized",
            "payment.captured",
            "payment.failed",
            "order.paid",
        ):
            return NormalizedEvent(kind="ignored")
        payment = (inner.get("payment") or {}).get("entity") or {}
        order = (inner.get("order") or {}).get("entity") or {}
        kind = {
            "payment.authorized": "payment_authorized",
            "payment.captured": "payment_succeeded",
            "order.paid": "payment_succeeded",
            "payment.failed": "payment_failed",
        }[event_type]
        if kind == "payment_succeeded" and payment.get("status") not in (None, "captured"):
            kind = "ignored"  # order.paid for a payment that is not captured yet
        return NormalizedEvent(
            kind=kind,
            provider_mandate_id=payment.get("token_id"),
            authorization_reference=payment.get("order_id"),
            provider_reference=payment.get("order_id"),
            provider_payment_id=payment.get("id"),
            amount=from_paise(payment.get("amount")),
            currency=payment.get("currency"),
            method_type=payment.get("method"),
            failure_code=payment.get("error_code") or None,
            failure_message=payment.get("error_description") or None,
            occurred_at=_ts(payment.get("created_at") or payload.get("created_at")),
            metadata={**_as_dict(payment.get("notes")), **_as_dict(order.get("notes"))},
        )
