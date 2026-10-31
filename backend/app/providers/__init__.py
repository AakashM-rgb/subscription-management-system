"""Payment providers: `get_adapter(name)` returns a configured adapter or raises
ProviderNotConfigured (503). Tests register fakes with `register()`; production code never does."""

from collections.abc import Callable

from app.providers.base import (
    AuthorizationStart,
    ChargeResult,
    CustomerRef,
    MandateUpdate,
    NormalizedEvent,
    PaymentProvider,
    ProviderError,
    ProviderEventIn,
    ProviderNotConfigured,
    WebhookVerificationError,
)
from app.providers.config import get_provider_settings

__all__ = [
    "AuthorizationStart",
    "ChargeResult",
    "CustomerRef",
    "MandateUpdate",
    "NormalizedEvent",
    "PaymentProvider",
    "ProviderError",
    "ProviderEventIn",
    "ProviderNotConfigured",
    "WebhookVerificationError",
    "default_provider_name",
    "get_adapter",
    "register",
    "unregister",
]

_registry: dict[str, Callable[[], PaymentProvider]] = {}


def _razorpay() -> PaymentProvider:
    from app.providers.razorpay import RazorpayAdapter

    s = get_provider_settings()
    if not (s.razorpay_key_id and s.razorpay_key_secret and s.razorpay_webhook_secret):
        raise ProviderNotConfigured("razorpay")
    return RazorpayAdapter(
        key_id=s.razorpay_key_id,
        key_secret=s.razorpay_key_secret,
        webhook_secret=s.razorpay_webhook_secret,
        base_url=s.razorpay_base_url,
        timeout=s.razorpay_timeout_seconds,
    )


_BUILTIN: dict[str, Callable[[], PaymentProvider]] = {"razorpay": _razorpay}


def register(name: str, factory: Callable[[], PaymentProvider]) -> None:
    _registry[name] = factory


def unregister(name: str) -> None:
    _registry.pop(name, None)


def default_provider_name() -> str:
    return get_provider_settings().payment_provider


def get_adapter(name: str) -> PaymentProvider:
    factory = _registry.get(name) or _BUILTIN.get(name)
    if factory is None:
        raise ProviderNotConfigured(name)
    return factory()
