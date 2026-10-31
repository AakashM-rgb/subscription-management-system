from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DB, Page, StaffUser
from app.models import Invoice, PaymentAttempt, PaymentMandate
from app.pagination import paginate
from app.schemas import PageOut
from app.schemas.payments import MandateOut, PaymentAttemptOut
from app.services import collections
from app.services.common import get_or_404

router = APIRouter(tags=["collections"])


@router.get("/mandates", response_model=PageOut[MandateOut])
def list_mandates(
    _: StaffUser,
    db: DB,
    page: Page,
    customer_id: int | None = None,
    status: Literal["pending", "active", "paused", "cancelled", "failed"] | None = None,
) -> dict:
    """Customer-authorised payment mandates. Only provider references and a display hint are
    stored; card or bank details never reach this system."""
    stmt = select(PaymentMandate).order_by(PaymentMandate.id.desc())
    if customer_id is not None:
        stmt = stmt.where(PaymentMandate.customer_id == customer_id)
    if status:
        stmt = stmt.where(PaymentMandate.status == status)
    return paginate(db, stmt, page, MandateOut)


@router.get("/invoices/{invoice_id}/payment-attempts", response_model=list[PaymentAttemptOut])
def list_attempts(invoice_id: int, _: StaffUser, db: DB) -> list[PaymentAttempt]:
    get_or_404(db, Invoice, invoice_id, "Invoice")
    return list(
        db.scalars(
            select(PaymentAttempt)
            .where(PaymentAttempt.invoice_id == invoice_id)
            .order_by(PaymentAttempt.id)
        )
    )


@router.post("/invoices/{invoice_id}/collect", response_model=PaymentAttemptOut, status_code=201)
def collect(invoice_id: int, user: StaffUser, db: DB) -> PaymentAttempt:
    """Charge the amount due now through the customer's active mandate. The result arrives
    asynchronously (status processing -> succeeded/failed); a payment exists only on success."""
    attempt = collections.collect_invoice(
        db, invoice_id, datetime.now(UTC), actor=user, manual=True
    )
    db.commit()
    db.refresh(attempt)
    return attempt
