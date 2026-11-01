"""Automatic collection of confirmed invoices through customer-authorised mandates.

Lifecycle of money taken by a provider:
  collect_due / collect_invoice -> PaymentAttempt(created) -> provider charge -> processing
  -> webhook (handle_event) or reconcile_pending -> succeeded (ledger posts a Payment)
                                                 -> failed (retry_failed tries again later)

Safety rules:
- Nothing here commits; the webhook inbox or the worker owns the transaction.
- Only one attempt per invoice can be in flight (unique partial index), and the ledger refuses
  manual payments while one is, so a charge and a manual payment cannot overpay together.
- Money a provider has taken is never dropped. If it cannot be applied (invoice already paid,
  cancelled, or the amount exceeds what is due) it is written to the audit log as
  "payment.unapplied" for staff to refund, and the event still counts as processed.
- Exceptions escape only for transient failures (database, provider unreachable), which the
  inbox and worker retry.
"""

import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import AppError, not_found
from app.models import (
    Customer,
    Invoice,
    PaymentAttempt,
    PaymentMandate,
    ProviderEvent,
    Subscription,
    User,
)
from app.money import ZERO, money
from app.providers import (
    ChargeResult,
    CustomerRef,
    MandateUpdate,
    PaymentProvider,
    ProviderError,
    get_adapter,
)
from app.providers.config import get_provider_settings
from app.services import audit, ledger
from app.services.periods import business_today

log = logging.getLogger(__name__)

BATCH_SIZE = 25
# Providers expire unfinished checkouts (Razorpay: the authorisation order must be completed
# the same day), so a mandate still unauthorised after this long is abandoned.
AUTHORIZATION_TIMEOUT = timedelta(hours=24)
INFLIGHT = ("created", "processing")
LIVE_SUBSCRIPTIONS = ("confirmed", "active")
MANDATE_TRANSITIONS = {
    "pending": {"active", "paused", "failed", "cancelled"},
    "active": {"paused", "cancelled", "failed"},
    "paused": {"active", "cancelled", "failed"},
    "failed": set(),
    "cancelled": set(),
}
PROVIDER_METHOD_TO_PAYMENT_METHOD = {
    "card": "card",
    "upi": "upi",
    "emandate": "bank_transfer",
    "nach": "bank_transfer",
    "netbanking": "bank_transfer",
}


# ----------------------------------------------------------------------------- helpers


def customer_ref(customer: Customer) -> CustomerRef:
    return CustomerRef(
        id=customer.id, name=customer.name, email=customer.email, phone=customer.phone
    )


def _lock_invoice(db: Session, invoice_id: int) -> Invoice:
    invoice = db.scalar(
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if invoice is None:
        raise not_found("Invoice")
    return invoice


def _lock_attempt(db: Session, attempt_id: int) -> PaymentAttempt:
    return db.scalar(
        select(PaymentAttempt)
        .where(PaymentAttempt.id == attempt_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def _payment_date(occurred_at: datetime | None):
    today = business_today()
    if occurred_at is None:
        return today
    local = occurred_at.astimezone(ZoneInfo(get_settings().business_timezone)).date()
    return min(local, today)


def _retry_at(attempt_number: int, now: datetime) -> datetime | None:
    delays = get_provider_settings().retry_delays_hours
    if attempt_number > len(delays):
        return None  # out of retries: the invoice stays outstanding for staff to chase
    return now + timedelta(hours=delays[attempt_number - 1])


# ----------------------------------------------------------------------------- mandates


def start_mandate(
    db: Session,
    *,
    customer: Customer,
    method_type: str,
    max_amount: Decimal | None,
    provider: str,
    actor: User | None,
) -> tuple[PaymentMandate, dict]:
    """Begin a customer authorisation. Returns the pending mandate and the checkout payload
    the customer's browser hands to the provider."""
    adapter = get_adapter(provider)
    if not customer.phone:
        raise AppError(
            422, "VALIDATION_ERROR", "Add a phone number to the profile before enabling autopay"
        )
    settings = get_provider_settings()
    pending = db.scalar(
        select(func.count())
        .select_from(PaymentMandate)
        .where(PaymentMandate.customer_id == customer.id, PaymentMandate.status == "pending")
    )
    if pending >= settings.max_pending_mandates:
        raise AppError(
            409,
            "INVALID_STATE",
            "Finish or remove the payment methods already being set up before adding another",
        )
    limit = money(max_amount or Decimal(settings.default_mandate_max_amount))
    existing_customer_id = db.scalar(
        select(PaymentMandate.provider_customer_id).where(
            PaymentMandate.customer_id == customer.id,
            PaymentMandate.provider == provider,
            PaymentMandate.provider_customer_id.is_not(None),
        )
    )
    provider_customer_id = adapter.ensure_customer(customer_ref(customer), existing_customer_id)
    mandate = PaymentMandate(
        customer_id=customer.id,
        provider=provider,
        provider_customer_id=provider_customer_id,
        # Provisional unique placeholder until the provider returns its reference below.
        provider_mandate_id=f"pending:{customer.id}:{datetime.now(UTC).timestamp()}",
        status="pending",
        method_type=method_type,
        max_amount=limit,
    )
    db.add(mandate)
    db.flush()
    start = adapter.start_authorization(
        customer=customer_ref(customer),
        provider_customer_id=provider_customer_id,
        method_type=method_type,
        max_amount=limit,
        currency=get_settings().currency,
        metadata={"purpose": "mandate", "mandate_id": mandate.id, "receipt": f"mdt-{mandate.id}"},
    )
    mandate.provider_mandate_id = start.reference
    db.flush()
    audit.record(
        db,
        action="mandate.started",
        entity_type="customer",
        entity_id=customer.id,
        actor=actor,
        data={"mandate_id": mandate.id, "provider": provider, "method_type": method_type},
    )
    return mandate, start.checkout


def _attach_to_subscriptions(db: Session, mandate: PaymentMandate) -> None:
    subs = db.scalars(
        select(Subscription).where(
            Subscription.customer_id == mandate.customer_id,
            Subscription.status.in_(LIVE_SUBSCRIPTIONS),
            Subscription.mandate_id.is_(None),
        )
    )
    for sub in subs:
        sub.mandate_id = mandate.id
        sub.auto_collect = True


def _detach_from_subscriptions(db: Session, mandate: PaymentMandate) -> None:
    for sub in db.scalars(select(Subscription).where(Subscription.mandate_id == mandate.id)):
        sub.mandate_id = None
        sub.auto_collect = False


def apply_mandate_update(
    db: Session,
    mandate: PaymentMandate,
    update: MandateUpdate,
    *,
    actor: User | None = None,
    actor_type: str | None = None,
) -> bool:
    """Apply the provider's view of a mandate. Returns True if anything changed."""
    changed = False
    if update.provider_mandate_id and update.provider_mandate_id != mandate.provider_mandate_id:
        owner = db.scalar(
            select(PaymentMandate.id).where(
                PaymentMandate.provider == mandate.provider,
                PaymentMandate.provider_mandate_id == update.provider_mandate_id,
                PaymentMandate.id != mandate.id,
            )
        )
        if owner is not None:
            raise AppError(
                409,
                "DUPLICATE",
                "The provider reported a mandate that already belongs to another payment method",
                {"mandate_id": owner},
            )
        mandate.provider_mandate_id = update.provider_mandate_id
        changed = True
    if update.method_type and not mandate.method_type:
        mandate.method_type = update.method_type
    if update.display_hint:
        mandate.display_hint = update.display_hint
    if update.status != mandate.status:
        if update.status not in MANDATE_TRANSITIONS[mandate.status]:
            log.info("ignoring mandate %s %s -> %s", mandate.id, mandate.status, update.status)
            return changed
        previous, mandate.status = mandate.status, update.status
        now = datetime.now(UTC)
        if update.status == "active":
            mandate.authorized_at = mandate.authorized_at or now
            _attach_to_subscriptions(db, mandate)
        elif update.status in ("cancelled", "failed"):
            mandate.cancelled_at = now
            _detach_from_subscriptions(db, mandate)
        audit.record(
            db,
            action=f"mandate.{update.status}",
            entity_type="customer",
            entity_id=mandate.customer_id,
            actor=actor,
            actor_type=actor_type,
            data={
                "mandate_id": mandate.id,
                "from": previous,
                "reason": update.failure_message,
            },
        )
        changed = True
    db.flush()
    return changed


def complete_mandate(
    db: Session, *, mandate: PaymentMandate, client_payload: dict, actor: User | None
) -> PaymentMandate:
    """The customer finished the provider checkout; verify it server-side and record the
    resulting mandate. Webhooks would get there too; this makes the portal immediate.
    Idempotent: if a webhook already settled the mandate, its current state is returned."""
    if mandate.status != "pending":
        return mandate
    adapter = get_adapter(mandate.provider)
    update = adapter.complete_authorization(
        reference=mandate.provider_mandate_id, client_payload=client_payload
    )
    apply_mandate_update(db, mandate, update, actor=actor)
    return mandate


def cancel_mandate(db: Session, *, mandate: PaymentMandate, actor: User | None) -> PaymentMandate:
    if mandate.status in ("cancelled", "failed"):
        raise AppError(409, "INVALID_STATE", f"This payment method is already {mandate.status}")
    adapter = get_adapter(mandate.provider)
    adapter.cancel_mandate(
        provider_customer_id=mandate.provider_customer_id,
        provider_mandate_id=mandate.provider_mandate_id,
        method_type=mandate.method_type,
    )
    apply_mandate_update(db, mandate, MandateUpdate(status="cancelled"), actor=actor)
    return mandate


# ----------------------------------------------------------------------------- charging


def _mandate_for(db: Session, invoice: Invoice, manual: bool) -> PaymentMandate | None:
    sub = db.get(Subscription, invoice.subscription_id)
    if not manual and (sub is None or sub.status not in LIVE_SUBSCRIPTIONS):
        # Automatic charges stop when the subscription is closed; staff can still collect
        # an outstanding invoice deliberately (manual=True), which is audited.
        return None
    if sub is not None and sub.mandate_id is not None and (sub.auto_collect or manual):
        mandate = db.get(PaymentMandate, sub.mandate_id)
        if (
            mandate is not None
            and mandate.status == "active"
            and mandate.customer_id == invoice.customer_id  # only the payer's own authorisation
        ):
            return mandate
    if not manual:
        return None
    # Staff-initiated: fall back to the customer's most recent active mandate.
    return db.scalar(
        select(PaymentMandate)
        .where(PaymentMandate.customer_id == invoice.customer_id, PaymentMandate.status == "active")
        .order_by(PaymentMandate.authorized_at.desc().nulls_last(), PaymentMandate.id.desc())
        .limit(1)
    )


def collect_invoice(
    db: Session, invoice_id: int, now: datetime, *, actor: User | None = None, manual: bool = False
) -> PaymentAttempt:
    """Charge the amount due on one confirmed invoice through its mandate."""
    invoice = _lock_invoice(db, invoice_id)
    if invoice.status != "confirmed" or invoice.amount_total - invoice.amount_paid <= ZERO:
        raise AppError(
            409, "INVALID_STATE", "Only confirmed invoices with an amount due can be collected"
        )
    mandate = _mandate_for(db, invoice, manual)
    if mandate is None:
        raise AppError(409, "INVALID_STATE", "The customer has no active payment mandate")
    amount_due = invoice.amount_total - invoice.amount_paid
    if mandate.max_amount is not None and amount_due > mandate.max_amount:
        raise AppError(
            409,
            "INVALID_STATE",
            f"Amount due {amount_due} exceeds the mandate limit {mandate.max_amount}",
        )
    previous = db.scalar(
        select(func.count())
        .select_from(PaymentAttempt)
        .where(PaymentAttempt.invoice_id == invoice.id)
    )
    attempt = PaymentAttempt(
        invoice_id=invoice.id,
        mandate_id=mandate.id,
        provider=mandate.provider,
        idempotency_key=f"inv{invoice.id}-a{previous + 1}",
        amount=amount_due,
        status="created",
        attempt_number=previous + 1,
    )
    try:
        with db.begin_nested():
            db.add(attempt)
            db.flush()
    except IntegrityError as exc:
        raise AppError(
            409, "INVALID_STATE", "A collection for this invoice is already in progress"
        ) from exc

    customer = db.get(Customer, invoice.customer_id)
    adapter = get_adapter(mandate.provider)
    try:
        result = adapter.initiate_charge(
            customer=customer_ref(customer),
            provider_customer_id=mandate.provider_customer_id,
            provider_mandate_id=mandate.provider_mandate_id,
            amount=amount_due,
            currency=invoice.currency,
            idempotency_key=attempt.idempotency_key,
            description=f"Invoice {invoice.number}",
            metadata={
                "invoice_id": invoice.id,
                "attempt_key": attempt.idempotency_key,
                "invoice_number": invoice.number,
            },
        )
    except ProviderError as exc:
        attempt.provider_reference = exc.reference
        if exc.reference is not None and exc.outcome_unknown:
            # The provider may have acted (timeout, 5xx): unknown until reconciled.
            attempt.status = "processing"
            attempt.failure_message = exc.message
        else:
            # Never reached the provider, or explicitly rejected: nothing was charged.
            attempt.status = "failed"
            attempt.failure_code = exc.provider_code or "provider_error"
            attempt.failure_message = exc.message
            attempt.next_retry_at = (
                _retry_at(attempt.attempt_number, now) if exc.retryable else None
            )
        db.flush()
        audit.record(
            db,
            action="collection.error",
            entity_type="invoice",
            entity_id=invoice.id,
            actor=actor,
            data={"attempt_id": attempt.id, "error": exc.message},
        )
        return attempt

    attempt.provider_reference = result.provider_reference
    attempt.status = "processing"
    db.flush()
    audit.record(
        db,
        action="collection.initiated",
        entity_type="invoice",
        entity_id=invoice.id,
        actor=actor,
        data={"attempt_id": attempt.id, "amount": str(amount_due), "provider": mandate.provider},
    )
    if result.status != "processing":
        apply_charge_result(db, attempt, result, now)
    return attempt


def apply_charge_result(
    db: Session, attempt: PaymentAttempt, result: ChargeResult, now: datetime
) -> str:
    """Bring an attempt in line with the provider's outcome. Idempotent."""
    if result.status == "processing":
        return "ignored"
    invoice = _lock_invoice(db, attempt.invoice_id)
    attempt = _lock_attempt(db, attempt.id)
    if result.status == "failed":
        if attempt.status not in INFLIGHT:
            return "ignored"  # late or duplicate failure (a success may already be recorded)
        attempt.status = "failed"
        attempt.failure_code = result.failure_code
        attempt.failure_message = result.failure_message
        attempt.next_retry_at = _retry_at(attempt.attempt_number, now)
        db.flush()
        audit.record(
            db,
            action="collection.failed",
            entity_type="invoice",
            entity_id=invoice.id,
            actor_type="provider",
            data={
                "attempt_id": attempt.id,
                "code": result.failure_code,
                "reason": result.failure_message,
            },
        )
        return "processed"

    # Succeeded. Delivery order is not guaranteed: a success can follow a failure.
    if attempt.status == "succeeded":
        return "ignored"
    attempt.status = "succeeded"
    attempt.next_retry_at = None
    attempt.failure_code = attempt.failure_message = None
    db.flush()
    amount = result.amount if result.amount is not None else attempt.amount
    if amount != attempt.amount:
        # Record what was actually taken; staff see why the invoice is not fully paid.
        audit.record(
            db,
            action="collection.amount_mismatch",
            entity_type="invoice",
            entity_id=invoice.id,
            actor_type="provider",
            data={
                "attempt_id": attempt.id,
                "requested": str(attempt.amount),
                "taken": str(amount),
            },
        )
    _post_provider_payment(
        db,
        invoice=invoice,
        amount=amount,
        currency=result.currency,
        provider=attempt.provider,
        provider_payment_id=result.provider_payment_id or result.provider_reference,
        method_type=result.method_type,
        occurred_at=result.occurred_at,
        attempt_id=attempt.id,
    )
    return "processed"


def _post_provider_payment(
    db: Session,
    *,
    invoice: Invoice,
    amount: Decimal,
    currency: str | None,
    provider: str,
    provider_payment_id: str,
    method_type: str | None,
    occurred_at: datetime | None,
    attempt_id: int | None,
) -> None:
    """Record money the provider has taken. Never raises for business-rule conflicts."""
    try:
        if currency is not None and currency.upper() != invoice.currency.upper():
            raise AppError(
                422,
                "CURRENCY_MISMATCH",
                f"A payment in {currency} cannot settle an invoice in {invoice.currency}",
            )
        with db.begin_nested():
            ledger.record_payment(
                db,
                invoice_id=invoice.id,
                method=PROVIDER_METHOD_TO_PAYMENT_METHOD.get(method_type or "", "other"),
                amount=amount,
                payment_date=_payment_date(occurred_at),
                note=f"Automatic collection via {provider}",
                provider=provider,
                provider_payment_id=provider_payment_id,
                payment_attempt_id=attempt_id,
            )
    except AppError as exc:
        audit.record(
            db,
            action="payment.unapplied",
            entity_type="invoice",
            entity_id=invoice.id,
            actor_type="provider",
            data={
                "provider": provider,
                "provider_payment_id": provider_payment_id,
                "amount": str(amount),
                "invoice_id": invoice.id,
                "attempt_id": attempt_id,
                "reason": exc.message,
            },
        )
        log.warning(
            "unapplied %s payment %s on invoice %s: %s",
            provider,
            provider_payment_id,
            invoice.id,
            exc.message,
        )


def _eligible_invoice_ids(db: Session, today) -> list[int]:
    any_attempt = exists().where(PaymentAttempt.invoice_id == Invoice.id)
    return list(
        db.scalars(
            select(Invoice.id)
            .join(Subscription, Subscription.id == Invoice.subscription_id)
            .join(
                PaymentMandate,
                and_(
                    PaymentMandate.id == Subscription.mandate_id,
                    PaymentMandate.status == "active",
                ),
            )
            .where(
                Invoice.status == "confirmed",
                Invoice.amount_total > Invoice.amount_paid,
                Invoice.invoice_date <= today,
                Subscription.auto_collect.is_(True),
                Subscription.status.in_(LIVE_SUBSCRIPTIONS),
                or_(
                    PaymentMandate.max_amount.is_(None),
                    Invoice.amount_total - Invoice.amount_paid <= PaymentMandate.max_amount,
                ),
                ~any_attempt,
            )
            .order_by(Invoice.due_date, Invoice.id)
            .limit(BATCH_SIZE)
        )
    )


def _run_each(db: Session, ids: list[int], fn, label: str) -> int:
    done = 0
    for item_id in ids:
        try:
            with db.begin_nested():
                fn(item_id)
            done += 1
        except AppError as exc:
            log.info("%s skipped %s: %s", label, item_id, exc.message)
    return done


def collect_due(db: Session, now: datetime) -> int:
    """Worker job: start the first collection for newly confirmed invoices with autopay on."""
    ids = _eligible_invoice_ids(db, business_today())
    return _run_each(db, ids, lambda i: collect_invoice(db, i, now), "collect_due")


def retry_failed(db: Session, now: datetime) -> int:
    """Worker job: try failed collections again on their retry schedule."""
    due = db.scalars(
        select(PaymentAttempt)
        .where(
            PaymentAttempt.status == "failed",
            PaymentAttempt.next_retry_at.is_not(None),
            PaymentAttempt.next_retry_at <= now,
        )
        .order_by(PaymentAttempt.next_retry_at)
        .limit(BATCH_SIZE)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    ).all()
    for attempt in due:
        attempt.next_retry_at = None  # consumed, whether or not the retry can run
    db.flush()
    return _run_each(
        db, [a.invoice_id for a in due], lambda i: collect_invoice(db, i, now), "retry"
    )


def reconcile_pending(db: Session, now: datetime) -> int:
    """Worker job: ask the provider about attempts and mandates whose outcome never arrived."""
    stale = now - timedelta(minutes=get_provider_settings().reconcile_after_minutes)
    attempts = db.scalars(
        select(PaymentAttempt)
        .where(PaymentAttempt.status.in_(INFLIGHT), PaymentAttempt.updated_at < stale)
        .order_by(PaymentAttempt.updated_at, PaymentAttempt.id)
        .limit(BATCH_SIZE)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    ).all()
    handled = 0
    for attempt in attempts:
        try:
            with db.begin_nested():
                handled += _reconcile_attempt(db, attempt, now)
        except ProviderError as exc:
            log.warning("reconcile attempt %s: %s", attempt.id, exc.message)

    mandates = db.scalars(
        select(PaymentMandate)
        .where(PaymentMandate.status == "pending", PaymentMandate.updated_at < stale)
        .order_by(PaymentMandate.updated_at, PaymentMandate.id)
        .limit(BATCH_SIZE)
        .with_for_update(skip_locked=True)
    ).all()
    for mandate in mandates:
        try:
            with db.begin_nested():
                update = get_adapter(mandate.provider).fetch_mandate(
                    provider_customer_id=mandate.provider_customer_id,
                    provider_mandate_id=mandate.provider_mandate_id,
                )
                if update is None and mandate.created_at < now - AUTHORIZATION_TIMEOUT:
                    update = MandateUpdate(
                        status="failed", failure_message="Authorisation was not completed"
                    )
                if update is not None and apply_mandate_update(
                    db, mandate, update, actor_type="provider"
                ):
                    handled += 1
                else:
                    mandate.updated_at = now  # checked: rotate to the back of the queue
        except ProviderError as exc:
            log.warning("reconcile mandate %s: %s", mandate.id, exc.message)
    return handled


def _reconcile_attempt(db: Session, attempt: PaymentAttempt, now: datetime) -> int:
    if attempt.provider_reference is None:
        # The charge never reached the provider (crash before the call): safe to fail it.
        result = ChargeResult(
            status="failed",
            provider_reference="",
            failure_code="not_submitted",
            failure_message="The charge was never submitted to the provider",
        )
    else:
        result = get_adapter(attempt.provider).fetch_charge(attempt.provider_reference)
        timeout = timedelta(hours=get_provider_settings().pending_timeout_hours)
        if result.status == "processing" and attempt.created_at < now - timeout:
            # Give up so the invoice can be paid another way. No automatic retry: the
            # provider might still capture this charge, and a late success is still recorded.
            apply_charge_result(
                db,
                attempt,
                ChargeResult(
                    status="failed",
                    provider_reference=attempt.provider_reference,
                    failure_code="timed_out",
                    failure_message="The provider did not confirm the charge in time",
                ),
                now,
            )
            attempt.next_retry_at = None
            db.flush()
            return 1
    if apply_charge_result(db, attempt, result, now) == "ignored":
        # Still pending at the provider (UPI can take 24-36h): rotate to the back of the queue
        # so a backlog of slow charges cannot starve newer ones.
        attempt.updated_at = now
        return 0
    return 1


# ----------------------------------------------------------------------------- webhooks


def _mandate_by_reference(db: Session, provider: str, *refs: str | None) -> PaymentMandate | None:
    refs = tuple(r for r in refs if r)
    if not refs:
        return None
    return db.scalar(
        select(PaymentMandate)
        .where(PaymentMandate.provider == provider, PaymentMandate.provider_mandate_id.in_(refs))
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def handle_event(db: Session, event: ProviderEvent) -> str:
    """Process one stored provider event. Returns "processed" or "ignored"."""
    adapter: PaymentProvider = get_adapter(event.provider)
    ev = adapter.parse_event(event.event_type, event.payload)
    now = datetime.now(UTC)
    if ev.kind == "ignored":
        return "ignored"

    if ev.kind.startswith("mandate_"):
        mandate = _mandate_by_reference(db, event.provider, ev.provider_mandate_id)
        if mandate is None:
            return "ignored"
        status = ev.kind.removeprefix("mandate_")
        changed = apply_mandate_update(
            db,
            mandate,
            MandateUpdate(
                status=status,
                method_type=ev.method_type,
                display_hint=ev.display_hint,
                failure_message=ev.failure_message,
            ),
            actor_type="provider",
        )
        return "processed" if changed else "ignored"

    # Payment events: first, is this the authorisation payment of a pending mandate?
    mandate = _mandate_by_reference(db, event.provider, ev.authorization_reference)
    if mandate is not None:
        if ev.provider_mandate_id:
            # The provider issued the mandate (even a UPI "dummy" failed payment carries one);
            # it becomes active on the provider's confirmation (event or reconcile).
            try:
                with db.begin_nested():
                    apply_mandate_update(
                        db,
                        mandate,
                        MandateUpdate(
                            status=mandate.status, provider_mandate_id=ev.provider_mandate_id
                        ),
                        actor_type="provider",
                    )
            except AppError as exc:
                # A permanent conflict: retrying the event can never succeed. Record it.
                audit.record(
                    db,
                    action="mandate.conflict",
                    entity_type="customer",
                    entity_id=mandate.customer_id,
                    actor_type="provider",
                    data={
                        "mandate_id": mandate.id,
                        "provider_mandate_id": ev.provider_mandate_id,
                        "reason": exc.message,
                    },
                )
                return "ignored"
            return "processed"
        if ev.kind == "payment_failed":
            apply_mandate_update(
                db,
                mandate,
                MandateUpdate(status="failed", failure_message=ev.failure_message),
                actor_type="provider",
            )
            return "processed"
        return "ignored"

    if ev.kind == "payment_authorized" or not ev.provider_reference:
        return "ignored"  # charges are captured automatically; captured/failed settle them

    result = ChargeResult(
        status="succeeded" if ev.kind == "payment_succeeded" else "failed",
        provider_reference=ev.provider_reference,
        provider_payment_id=ev.provider_payment_id,
        amount=ev.amount,
        currency=ev.currency,
        method_type=ev.method_type,
        failure_code=ev.failure_code,
        failure_message=ev.failure_message,
        occurred_at=ev.occurred_at,
    )
    attempt = db.scalar(
        select(PaymentAttempt).where(
            PaymentAttempt.provider == event.provider,
            PaymentAttempt.provider_reference == ev.provider_reference,
        )
    )
    if attempt is not None:
        return apply_charge_result(db, attempt, result, now)

    # No local attempt (e.g. the worker crashed before committing it). Money must still land.
    if result.status != "succeeded":
        return "ignored"
    meta = adapter.reference_metadata(ev.provider_reference)
    invoice_id = meta.get("invoice_id")
    if not str(invoice_id or "").isdigit() or db.get(Invoice, int(invoice_id)) is None:
        audit.record(
            db,
            action="payment.unapplied",
            entity_type="provider_event",
            entity_id=event.id,
            actor_type="provider",
            data={
                "provider": event.provider,
                "provider_payment_id": result.provider_payment_id,
                "amount": str(result.amount),
                "invoice_id": None,
                "reason": "No invoice matches this provider payment",
            },
        )
        return "processed"
    invoice = _lock_invoice(db, int(invoice_id))
    _post_provider_payment(
        db,
        invoice=invoice,
        amount=result.amount or ZERO,
        currency=result.currency,
        provider=event.provider,
        provider_payment_id=result.provider_payment_id or result.provider_reference,
        method_type=result.method_type,
        occurred_at=result.occurred_at,
        attempt_id=None,
    )
    return "processed"
