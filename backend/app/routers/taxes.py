from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DB, AdminUser, Page, StaffUser
from app.models import Tax
from app.pagination import paginate
from app.schemas import PageOut
from app.schemas.catalog import TaxCreateIn, TaxOut, TaxUpdateIn
from app.services.common import apply_audited, audited_add, commit_or_conflict, get_or_404

router = APIRouter(prefix="/taxes", tags=["taxes"])

DUPLICATE = "A tax with this name already exists"


@router.get("", response_model=PageOut[TaxOut])
def list_taxes(_: StaffUser, db: DB, page: Page, is_active: bool | None = None) -> dict:
    stmt = select(Tax).order_by(Tax.name, Tax.id)
    if is_active is not None:
        stmt = stmt.where(Tax.is_active.is_(is_active))
    return paginate(db, stmt, page, TaxOut)


@router.post("", response_model=TaxOut, status_code=201)
def create_tax(body: TaxCreateIn, admin: AdminUser, db: DB) -> Tax:
    tax = Tax(**body.model_dump())
    audited_add(
        db,
        tax,
        entity_type="tax",
        actor=admin,
        conflict=DUPLICATE,
        data=body.model_dump(mode="json"),
    )
    db.refresh(tax)
    return tax


@router.get("/{tax_id}", response_model=TaxOut)
def get_tax(tax_id: int, _: StaffUser, db: DB) -> Tax:
    return get_or_404(db, Tax, tax_id, "Tax")


@router.patch("/{tax_id}", response_model=TaxOut)
def update_tax(tax_id: int, body: TaxUpdateIn, admin: AdminUser, db: DB) -> Tax:
    """Issued invoices keep the rate they were created with (lines store a snapshot), so a
    rate change only affects invoices generated afterwards."""
    tax = get_or_404(db, Tax, tax_id, "Tax")
    apply_audited(db, tax, body, entity_type="tax", actor=admin)
    commit_or_conflict(db, DUPLICATE)
    db.refresh(tax)
    return tax
