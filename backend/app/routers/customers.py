from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

from app.deps import DB, Page, StaffUser
from app.errors import AppError
from app.models import Customer, Invoice
from app.money import money
from app.pagination import paginate
from app.schemas import PageOut
from app.schemas.customers import (
    CustomerBalanceOut,
    CustomerCreateIn,
    CustomerOut,
    CustomerUpdateIn,
)
from app.services.common import apply_audited, audited_add, business_today, get_or_404

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=PageOut[CustomerOut])
def list_customers(
    _: StaffUser,
    db: DB,
    page: Page,
    q: str | None = Query(default=None, max_length=100),
    is_active: bool | None = None,
) -> dict:
    stmt = select(Customer).order_by(Customer.name, Customer.id)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Customer.name.ilike(pattern),
                Customer.email.ilike(pattern),
                Customer.company_name.ilike(pattern),
            )
        )
    if is_active is not None:
        stmt = stmt.where(Customer.is_active.is_(is_active))
    return paginate(db, stmt, page, CustomerOut)


@router.post("", response_model=CustomerOut, status_code=201)
def create_customer(body: CustomerCreateIn, user: StaffUser, db: DB) -> Customer:
    """Customers added by staff have no login; self-signup creates its own customer record."""
    customer = Customer(**body.model_dump())
    customer.email = customer.email.lower()
    # Personal data stays out of the append-only audit trail: the event records only who and when.
    audited_add(
        db, customer, entity_type="customer", actor=user, conflict="Could not create the customer"
    )
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, _: StaffUser, db: DB) -> Customer:
    return get_or_404(db, Customer, customer_id, "Customer")


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, body: CustomerUpdateIn, user: StaffUser, db: DB) -> Customer:
    customer = get_or_404(db, Customer, customer_id, "Customer")
    if customer.user_id is not None and body.email is not None:
        if body.email.lower() != customer.email.lower():
            # The portal login email belongs to the user account (auth module).
            raise AppError(
                409, "INVALID_STATE", "This customer has a portal login; its email cannot change"
            )
    apply_audited(db, customer, body, entity_type="customer", actor=user, redact=True)
    customer.email = customer.email.lower()
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}/balance", response_model=CustomerBalanceOut)
def customer_balance(customer_id: int, _: StaffUser, db: DB) -> CustomerBalanceOut:
    """Outstanding = confirmed invoices not yet fully paid; overdue = those past their due date."""
    get_or_404(db, Customer, customer_id, "Customer")
    today = business_today()
    is_overdue = Invoice.due_date < today
    row = db.execute(
        select(
            func.coalesce(func.sum(Invoice.amount_due), 0),
            func.count(),
            func.coalesce(func.sum(Invoice.amount_due).filter(is_overdue), 0),
            func.count().filter(is_overdue),
        ).where(Invoice.customer_id == customer_id, Invoice.status == "confirmed")
    ).one()
    return CustomerBalanceOut(
        customer_id=customer_id,
        outstanding_amount=money(row[0]),
        open_invoice_count=row[1],
        overdue_amount=money(row[2]),
        overdue_count=row[3],
    )
