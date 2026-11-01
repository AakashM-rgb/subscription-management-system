from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DB, AdminUser, Page, StaffUser
from app.models import PaymentTerm
from app.pagination import paginate
from app.schemas import PageOut
from app.schemas.catalog import PaymentTermCreateIn, PaymentTermOut, PaymentTermUpdateIn
from app.services.common import apply_audited, audited_add, commit_or_conflict, get_or_404

router = APIRouter(prefix="/payment-terms", tags=["payment terms"])

DUPLICATE = "A payment term with this name already exists"


@router.get("", response_model=PageOut[PaymentTermOut])
def list_payment_terms(_: StaffUser, db: DB, page: Page, is_active: bool | None = None) -> dict:
    stmt = select(PaymentTerm).order_by(PaymentTerm.due_days, PaymentTerm.id)
    if is_active is not None:
        stmt = stmt.where(PaymentTerm.is_active.is_(is_active))
    return paginate(db, stmt, page, PaymentTermOut)


@router.post("", response_model=PaymentTermOut, status_code=201)
def create_payment_term(body: PaymentTermCreateIn, admin: AdminUser, db: DB) -> PaymentTerm:
    term = PaymentTerm(**body.model_dump())
    audited_add(
        db,
        term,
        entity_type="payment_term",
        actor=admin,
        conflict=DUPLICATE,
        data=body.model_dump(mode="json"),
    )
    db.refresh(term)
    return term


@router.get("/{term_id}", response_model=PaymentTermOut)
def get_payment_term(term_id: int, _: StaffUser, db: DB) -> PaymentTerm:
    return get_or_404(db, PaymentTerm, term_id, "Payment term")


@router.patch("/{term_id}", response_model=PaymentTermOut)
def update_payment_term(
    term_id: int, body: PaymentTermUpdateIn, admin: AdminUser, db: DB
) -> PaymentTerm:
    """Due dates are fixed on each invoice when it is issued, so edits only affect new ones."""
    term = get_or_404(db, PaymentTerm, term_id, "Payment term")
    apply_audited(db, term, body, entity_type="payment_term", actor=admin)
    commit_or_conflict(db, DUPLICATE)
    db.refresh(term)
    return term
