from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DB, AdminUser, Page, StaffUser
from app.errors import not_found
from app.models import BillingRun
from app.presenters import fetch_page, page_out
from app.schemas import PageOut
from app.schemas.invoices import BillingRunDetailOut, BillingRunIn, BillingRunOut
from app.services import billing
from app.services.periods import business_today

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/runs", response_model=BillingRunOut, status_code=201)
def start_run(user: AdminUser, db: DB, body: BillingRunIn | None = None) -> BillingRun:
    """Run billing now. Idempotent: periods already billed are never billed again."""
    as_of = (body.as_of if body else None) or business_today()
    return billing.run_billing(db, as_of=as_of, trigger="manual", actor=user)


@router.get("/runs", response_model=PageOut[BillingRunOut])
def list_runs(_: StaffUser, db: DB, page: Page) -> dict:
    rows, total = fetch_page(db, select(BillingRun).order_by(BillingRun.id.desc()), page)
    return page_out([BillingRunOut.model_validate(r) for r in rows], total, page)


@router.get("/runs/{run_id}", response_model=BillingRunDetailOut)
def get_run(run_id: int, _: StaffUser, db: DB) -> BillingRun:
    run = db.get(BillingRun, run_id)
    if run is None:
        raise not_found("Billing run")
    return run
