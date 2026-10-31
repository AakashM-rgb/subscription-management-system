"""Provider-independent contract for recurring collections.

An adapter turns one payment provider's API into these calls and value objects. The rest of the
system (collections service, webhook inbox, routers) only ever sees this module's types, so a
second provider is a new adapter, not a change to billing code.

Money crosses this boundary as Decimal in major units (rupees); adapters convert to the
provider's minor units. Adapters never touch the database.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Literal, Protocol

from app.errors import AppError

ChargeStatus = Literal["processing", "succeeded", "failed"]
MandateStatus = Literal["pending", "active", "paused", "cancelled", "failed"]
EventKind = Literal[
    "mandate_active",
    "mandate_paused",
    "mandate_failed",
    "mandate_cancelled",
    "payment_authorized",
    "payment_succeeded",
    "payment_failed",
    "ignored",
]


class ProviderNotConfigured(AppError):
    def __init__(self, name: str):
        super().__init__(
            503, "PROVIDER_NOT_CONFIGURED", f"Payment provider '{name}' is not configured"
        )


class WebhookVerificationError(AppError):
    def __init__(self, message: str = "Webhook signature verification failed"):
        super().__init__(400, "INVALID_SIGNATURE", message)


class ProviderError(AppError):
    """The provider rejected a call or could not be reached. `reference` is set when the call
    got far enough to create something on the provider side (so reconciliation can find it)."""

    def __init__(self, message: str, reference: str | None = None, retryable: bool = True):
        super().__init__(502, "PROVIDER_ERROR", message)
        self.reference = reference
        self.retryable = retryable


@dataclass(frozen=True)
class ProviderEventIn:
    """A verified webhook event, as stored once in provider_events."""

    event_id: str
    event_type: str
    payload: dict


@dataclass(frozen=True)
class CustomerRef:
    id: int
    name: str
    email: str
    phone: str | None = None


@dataclass(frozen=True)
class AuthorizationStart:
    """What the customer's browser needs to authorise a mandate with the provider.

    `reference` is a provisional provider id (echoed back by the provider's events) stored as the
    mandate's provider_mandate_id until the provider confirms the real mandate id.
    """

    provider_customer_id: str
    reference: str
    checkout: dict


@dataclass(frozen=True)
class ChargeResult:
    status: ChargeStatus
    provider_reference: str  # the provider object our attempt tracks (e.g. an order id)
    provider_payment_id: str | None = None
    amount: Decimal | None = None
    method_type: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None
    occurred_at: datetime | None = None


@dataclass(frozen=True)
class MandateUpdate:
    """Provider's view of a mandate. `provider_mandate_id` replaces the provisional reference
    once the provider has issued the real mandate (e.g. a Razorpay token id)."""

    status: MandateStatus
    provider_mandate_id: str | None = None
    method_type: str | None = None
    display_hint: str | None = None
    failure_message: str | None = None


@dataclass(frozen=True)
class NormalizedEvent:
    kind: EventKind
    provider_mandate_id: str | None = None
    authorization_reference: str | None = None
    provider_reference: str | None = None
    provider_payment_id: str | None = None
    amount: Decimal | None = None
    method_type: str | None = None
    display_hint: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None
    occurred_at: datetime | None = None
    metadata: dict = field(default_factory=dict)


class PaymentProvider(Protocol):
    name: str

    def ensure_customer(self, customer: CustomerRef, existing_id: str | None) -> str: ...

    def start_authorization(
        self,
        *,
        customer: CustomerRef,
        provider_customer_id: str,
        method_type: str,
        max_amount: Decimal,
        currency: str,
        metadata: dict,
    ) -> AuthorizationStart: ...

    def complete_authorization(self, *, reference: str, client_payload: dict) -> MandateUpdate:
        """Verify what the provider's checkout returned to the customer's browser."""
        ...

    def fetch_mandate(
        self, *, provider_customer_id: str | None, provider_mandate_id: str
    ) -> MandateUpdate | None:
        """Current mandate state, or None while only the provisional reference is known."""
        ...

    def cancel_mandate(
        self, *, provider_customer_id: str | None, provider_mandate_id: str, method_type: str | None
    ) -> None: ...

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
    ) -> ChargeResult: ...

    def fetch_charge(self, provider_reference: str) -> ChargeResult: ...

    def reference_metadata(self, provider_reference: str) -> dict:
        """Metadata we attached when creating `provider_reference` (used to match a charge
        whose local attempt row was lost)."""
        ...

    def verify_webhook(self, headers: dict[str, str], raw_body: bytes) -> list[ProviderEventIn]: ...

    def parse_event(self, event_type: str, payload: dict) -> NormalizedEvent: ...
