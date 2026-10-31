from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class ProviderSettings(BaseSettings):
    """Payment-provider settings, read from the same backend/.env as app.config.

    Leaving the keys empty disables automatic collection: provider endpoints answer
    503 PROVIDER_NOT_CONFIGURED and manual payments keep working.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    payment_provider: str = "razorpay"
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_base_url: str = "https://api.razorpay.com/v1"
    razorpay_timeout_seconds: float = 15.0
    # Upper bound a customer authorises per charge when they do not choose one.
    default_mandate_max_amount: str = "100000.00"
    # Failed charge -> retry after these many hours; one retry per entry, then give up.
    collection_retry_hours: str = "24,72,168"
    # Attempts still pending after this many minutes are checked with the provider.
    reconcile_after_minutes: int = 15
    # A charge the provider still reports as pending after this long is given up on (no
    # automatic retry, so it cannot double-charge); a late success is still recorded.
    pending_timeout_hours: int = 72
    # Unfinished payment-method setups a customer may have at once.
    max_pending_mandates: int = 3

    @property
    def retry_delays_hours(self) -> list[int]:
        return [int(h) for h in self.collection_retry_hours.split(",") if h.strip()]


@lru_cache
def get_provider_settings() -> ProviderSettings:
    return ProviderSettings()
