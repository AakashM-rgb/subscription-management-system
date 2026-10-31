"""Payment-provider webhook inbox.

Flow: verify signature (provider adapter) -> store each event once in provider_events
(UNIQUE provider+event_id, so provider retries are harmless) -> dispatch to the collections
service inside a savepoint -> mark processed / ignored / failed. Failed or interrupted events
are re-dispatched by the worker; the provider always gets 200 once the event is stored.

Provider adapters and the collections service are owned by Claude 2 (app/providers,
app/services/collections.py). Until they exist, the endpoint answers 503.
"""

import importlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import ProviderEvent

log = logging.getLogger(__name__)


@dataclass
class ProviderApi:
    get_adapter: object
    not_configured: type[Exception]
    verification_error: type[Exception]
    handle_event: object


def provider_api() -> ProviderApi:
    try:
        providers = importlib.import_module("app.providers")
        collections = importlib.import_module("app.services.collections")
    except ModuleNotFoundError as exc:
        raise AppError(
            503, "PROVIDER_NOT_CONFIGURED", "Payment provider integration is not installed"
        ) from exc
    return ProviderApi(
        get_adapter=providers.get_adapter,
        not_configured=providers.ProviderNotConfigured,
        verification_error=providers.WebhookVerificationError,
        handle_event=collections.handle_event,
    )


def _dispatch(db: Session, api: ProviderApi, event: ProviderEvent) -> None:
    try:
        with db.begin_nested():
            outcome = api.handle_event(db, event)
        event.status = "ignored" if outcome == "ignored" else "processed"
        event.processing_error = None
    except Exception as exc:
        log.exception("provider event %s/%s failed", event.provider, event.event_id)
        event.status = "failed"
        event.processing_error = f"{type(exc).__name__}: {exc}"[:2000]
    event.processed_at = datetime.now(UTC)


def receive(db: Session, provider: str, headers: dict[str, str], raw_body: bytes) -> dict:
    api = provider_api()
    try:
        adapter = api.get_adapter(provider)
    except api.not_configured as exc:
        raise AppError(
            503, "PROVIDER_NOT_CONFIGURED", str(exc) or "Provider not configured"
        ) from exc
    try:
        events = adapter.verify_webhook(headers, raw_body)
    except api.verification_error as exc:
        log.warning("rejected webhook from %s: %s", provider, exc)
        raise AppError(400, "INVALID_SIGNATURE", "Webhook signature verification failed") from exc

    stored = duplicates = 0
    for incoming in events:
        event_id = db.scalar(
            insert(ProviderEvent)
            .values(
                provider=provider,
                event_id=incoming.event_id,
                event_type=incoming.event_type,
                payload=incoming.payload,
            )
            .on_conflict_do_nothing(constraint="uq_provider_events_event")
            .returning(ProviderEvent.id)
        )
        if event_id is None:
            duplicates += 1
            continue
        stored += 1
        _dispatch(db, api, db.get(ProviderEvent, event_id))
        db.commit()
    return {"received": stored, "duplicates": duplicates}


def reprocess_pending(db: Session, limit: int = 50) -> int:
    """Worker job: retry failed events and events stuck in 'received' (e.g. crash mid-request)."""
    api = provider_api()
    stale = datetime.now(UTC) - timedelta(minutes=1)
    events = db.scalars(
        select(ProviderEvent)
        .where(
            (ProviderEvent.status == "failed")
            | ((ProviderEvent.status == "received") & (ProviderEvent.received_at < stale))
        )
        .order_by(ProviderEvent.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    ).all()
    for event in events:
        _dispatch(db, api, event)
    return len(events)
