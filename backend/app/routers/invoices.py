from typing import Literal

from fastapi import APIRouter
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.deps import DB, Page, StaffUser
from app.errors import AppError, not_found
from app.models import Invoice
from app.presenters import apply_sort, fetch_page, invoice_list, invoice_out, page_out
from app.schemas import PageOut
from app.schemas.invoices import (
    BulkConfirmIn,
    BulkConfirmOut,
    CancelIn,
    InvoiceListItem,
    InvoiceOut,
)
from app.services import invoices as svc
from app.services.periods import business_today

router = APIRouter(prefix="/invoices", tags=["invoices"])

SORTABLE = {
    "created_at": Invoice.created_at,
    "number": Invoice.number,
    "invoice_date": Invoice.invoice_date,
    "due_date": Invoice.due_date,
    "amount_total": Invoice.amount_total,
    "amount_due": Invoice.amount_due,
}


@router.get("", response_model=PageOut[InvoiceListItem])
def list_invoices(
    _: StaffUser,
    db: DB,
    page: Page,
    status: Literal["draft", "confirmed", "paid", "cancelled"] | None = None,
    customer_id: int | None = None,
    subscription_id: int | None = None,
    overdue: bool | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    q: str | None = None,
    sort: str | None = None,
) -> dict:
    today = business_today()
    stmt = select(Invoice).options(selectinload(Invoice.subscription))
    if status:
        stmt = stmt.where(Invoice.status == status)
    if customer_id:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if subscription_id:
        stmt = stmt.where(Invoice.subscription_id == subscription_id)
    if overdue is not None:
        cond = (
            (Invoice.status == "confirmed") & (Invoice.amount_due > 0) & (Invoice.due_date < today)
        )
        stmt = stmt.where(cond if overdue else ~cond)
    if date_from:
        stmt = stmt.where(Invoice.invoice_date >= date_from)
    if date_to:
        stmt = stmt.where(Invoice.invoice_date <= date_to)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Invoice.number.ilike(like), Invoice.bill_to_name.ilike(like)))
    stmt = apply_sort(stmt, sort, SORTABLE, Invoice.id.desc())
    rows, total = fetch_page(db, stmt, page)
    return page_out(invoice_list(db, rows, today), total, page)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int, user: StaffUser, db: DB) -> InvoiceOut:
    inv = db.get(Invoice, invoice_id)
    if inv is None:
        raise not_found("Invoice")
    return invoice_out(db, inv, user.role, business_today())


@router.post("/bulk-confirm", response_model=BulkConfirmOut)
def bulk_confirm(body: BulkConfirmIn, user: StaffUser, db: DB) -> dict:
    confirmed, errors = [], []
    for invoice_id in sorted(set(body.invoice_ids)):
        try:
            with db.begin_nested():
                svc.confirm(db, svc.lock_invoice(db, invoice_id), user)
            confirmed.append(invoice_id)
        except AppError as exc:
            errors.append({"id": invoice_id, "code": exc.code, "message": exc.message})
    db.commit()
    return {"confirmed": confirmed, "errors": errors}


@router.post("/{invoice_id}/confirm", response_model=InvoiceOut)
def confirm(invoice_id: int, user: StaffUser, db: DB) -> InvoiceOut:
    inv = svc.confirm(db, svc.lock_invoice(db, invoice_id), user)
    db.commit()
    return invoice_out(db, inv, user.role, business_today())


@router.post("/{invoice_id}/cancel", response_model=InvoiceOut)
def cancel(invoice_id: int, body: CancelIn, user: StaffUser, db: DB) -> InvoiceOut:
    today = business_today()
    inv, _replacement = svc.cancel(
        db, svc.lock_invoice(db, invoice_id), user, body.reason, body.reissue, today
    )
    db.commit()
    return invoice_out(db, inv, user.role, today)


@router.post("/{invoice_id}/send", response_model=InvoiceOut)
def send(invoice_id: int, user: StaffUser, db: DB) -> InvoiceOut:
    inv = svc.send(db, svc.lock_invoice(db, invoice_id), user)
    db.commit()
    return invoice_out(db, inv, user.role, business_today())
