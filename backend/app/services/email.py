"""Transactional email outbox. Callers enqueue inside their transaction; the worker delivers."""

import logging
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import EmailOutbox

log = logging.getLogger(__name__)
RETRY_DELAYS = (
    timedelta(minutes=1),
    timedelta(minutes=5),
    timedelta(minutes=30),
    timedelta(hours=2),
    timedelta(hours=6),
)


def enqueue(db: Session, *, key: str, to: str, subject: str, template: str, context: dict) -> None:
    """Idempotent: the same key is only ever queued once."""
    db.execute(
        insert(EmailOutbox)
        .values(
            idempotency_key=key, to_email=to, subject=subject, template=template, context=context
        )
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
    )


def render(template: str, context: dict) -> str:
    company = get_settings().company_name
    if template == "password_reset":
        return (
            f"Reset your {company} password using this link (valid for 30 minutes):\n"
            f"{context['url']}\n\nIf you did not request this, ignore this email."
        )
    if template == "invite":
        return f"You have been invited to {company}. Set your password here:\n{context['url']}"
    if template == "invoice":
        return (
            f"Invoice {context['number']} for {context['currency']} {context['amount_total']}"
            f" is due on {context['due_date']}.\nView it in your portal: {context['url']}"
        )
    if template == "quotation":
        return (
            f"Your quotation {context['number']} is ready and valid until "
            f"{context['valid_until']}.\nReview and accept it here: {context['url']}"
        )
    raise ValueError(f"unknown email template {template!r}")


def _send(message: EmailMessage) -> None:
    settings = get_settings()
    if settings.email_backend == "console":
        log.info(
            "EMAIL to=%s subject=%s\n%s", message["To"], message["Subject"], message.get_content()
        )
        return
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


def deliver_pending(db: Session, limit: int = 50) -> int:
    """Send due emails; failures back off and finally go 'dead'. Returns emails sent."""
    now = datetime.now(UTC)
    rows = db.scalars(
        select(EmailOutbox)
        .where(EmailOutbox.status == "pending", EmailOutbox.next_attempt_at <= now)
        .order_by(EmailOutbox.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    ).all()
    sent = 0
    for row in rows:
        message = EmailMessage()
        message["From"] = get_settings().smtp_from
        message["To"] = row.to_email
        message["Subject"] = row.subject
        try:
            message.set_content(render(row.template, row.context))
            _send(message)
        except Exception as exc:
            row.attempts += 1
            row.last_error = f"{type(exc).__name__}: {exc}"[:2000]
            if row.attempts >= len(RETRY_DELAYS):
                row.status = "dead"
            else:
                row.next_attempt_at = now + RETRY_DELAYS[row.attempts - 1]
            log.warning("email %s failed (attempt %s): %s", row.id, row.attempts, exc)
            continue
        row.status = "sent"
        row.sent_at = now
        row.context = {k: v for k, v in row.context.items() if k != "url"}  # drop secrets
        sent += 1
    return sent
