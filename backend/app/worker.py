"""Background worker: scheduled billing, email delivery, payment collection and webhook retries.

Run (from backend/):  uv run python -m app.worker

Safe to restart at any time: billing commits per batch and holds a PostgreSQL advisory lock
that the server releases automatically if this process dies; every job is idempotent.
"""

import importlib
import logging
import signal
import sys
from datetime import UTC, datetime
from pathlib import Path
from tempfile import gettempdir

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.config import get_settings
from app.db import SessionLocal
from app.errors import AppError
from app.logging_setup import configure_logging
from app.services import billing, email, webhooks
from app.services.periods import business_today

log = logging.getLogger("app.worker")
HEARTBEAT_FILE = Path(gettempdir()) / "brightloop-worker.heartbeat"


def job_billing() -> None:
    with SessionLocal() as db:
        try:
            run = billing.run_billing(db, as_of=business_today(), trigger="scheduled")
        except AppError as exc:
            if exc.code != "BILLING_RUN_IN_PROGRESS":
                raise
            log.info("billing run skipped: another run is in progress")
            return
    if run.invoices_created:
        job_collections()  # start autopay collection for auto-confirmed invoices right away


def job_emails() -> None:
    with SessionLocal() as db:
        sent = email.deliver_pending(db)
        db.commit()
        if sent:
            log.info("delivered %s emails", sent)


def job_collections() -> None:
    """Automatic collection (Claude 2's service): charge due invoices, retry, reconcile."""
    try:
        collections = importlib.import_module("app.services.collections")
    except ModuleNotFoundError:
        return  # provider integration not installed yet
    now = datetime.now(UTC)
    for name in ("collect_due", "retry_failed", "reconcile_pending"):
        with SessionLocal() as db:
            try:
                count = getattr(collections, name)(db, now)
                db.commit()
                if count:
                    log.info("collections.%s handled %s", name, count)
            except Exception:
                db.rollback()
                log.exception("collections.%s failed", name)


def job_webhook_retries() -> None:
    with SessionLocal() as db:
        try:
            count = webhooks.reprocess_pending(db)
        except AppError:
            return  # provider integration not installed yet
        db.commit()
        if count:
            log.info("reprocessed %s provider events", count)


def job_heartbeat() -> None:
    HEARTBEAT_FILE.write_text(datetime.now(UTC).isoformat())


def build_scheduler() -> BlockingScheduler:
    settings = get_settings()
    scheduler = BlockingScheduler(timezone=settings.business_timezone)
    common = {"max_instances": 1, "coalesce": True, "misfire_grace_time": 3600}
    scheduler.add_job(
        job_billing,
        CronTrigger(hour=settings.billing_hour, minute=settings.billing_minute),
        id="billing_daily",
        **common,
    )
    # Hourly catch-up: a no-op when nothing is due, recovers from missed/failed runs.
    scheduler.add_job(job_billing, IntervalTrigger(hours=1), id="billing_catch_up", **common)
    scheduler.add_job(job_emails, IntervalTrigger(seconds=15), id="emails", **common)
    scheduler.add_job(job_collections, IntervalTrigger(minutes=5), id="collections", **common)
    scheduler.add_job(job_webhook_retries, IntervalTrigger(minutes=2), id="webhooks", **common)
    scheduler.add_job(job_heartbeat, IntervalTrigger(seconds=30), id="heartbeat", **common)
    return scheduler


def main() -> None:
    configure_logging()
    scheduler = build_scheduler()

    def stop(*_args) -> None:
        log.info("worker stopping")
        scheduler.shutdown(wait=True)
        sys.exit(0)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    job_heartbeat()
    log.info("worker started: jobs=%s", [job.id for job in scheduler.get_jobs()])
    job_billing()  # catch up immediately on start
    scheduler.start()


if __name__ == "__main__":
    main()
