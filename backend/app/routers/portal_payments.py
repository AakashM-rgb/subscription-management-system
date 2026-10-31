from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DB, CurrentCustomer, Page
from app.models import Payment
from app.routers.payments import payment_page
from app.schemas import PageOut
from app.schemas.payments import PortalPaymentOut

router = APIRouter(prefix="/portal/payments", tags=["portal"])


@router.get("", response_model=PageOut[PortalPaymentOut])
def my_payments(customer: CurrentCustomer, db: DB, page: Page) -> dict:
    """The signed-in customer's own payments; the customer comes from the session only."""
    stmt = (
        select(Payment)
        .where(Payment.customer_id == customer.id)
        .order_by(Payment.payment_date.desc(), Payment.id.desc())
    )
    return payment_page(db, stmt, page)
