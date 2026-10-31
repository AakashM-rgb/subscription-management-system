import re
import threading
import uuid
from collections.abc import Callable
from datetime import timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import AuditEvent, Invoice, Payment
from app.services import ledger
from app.services.common import business_today
from tests import business_factories as f
from tests.conftest import login, make_user

API = "/api/v1"


def pay(client: TestClient, invoice_id: int, amount: str, key: str | None = None, **extra):
    body = {
        "invoice_id": invoice_id,
        "method": "upi",
        "amount": amount,
        "payment_date": str(business_today()),
        **extra,
    }
    return client.post(
        f"{API}/payments", json=body, headers={"Idempotency-Key": key or str(uuid.uuid4())}
    )


@pytest.fixture
def invoice(db: Session) -> Invoice:
    return f.invoice(db, f.subscription(db, f.customer(db)), total="1180.00")


def test_partial_then_full_payment(staff_client: TestClient, db: Session, invoice) -> None:
    res = pay(staff_client, invoice.id, "500.00", method="cash", note="Counter receipt 17")
    assert res.status_code == 201, res.text
    first = res.json()
    assert re.fullmatch(r"PAY-\d{6}", first["number"])
    assert (first["status"], first["amount"], first["note"]) == (
        "posted",
        "500.00",
        "Counter receipt 17",
    )
    assert first["customer_id"] == invoice.customer_id
    assert first["invoice_number"] == invoice.number
    db.refresh(invoice)
    assert (invoice.status, invoice.amount_paid, invoice.amount_due) == (
        "confirmed",
        Decimal("500.00"),
        Decimal("680.00"),
    )

    assert pay(staff_client, invoice.id, "680.00", method="bank_transfer").status_code == 201
    db.refresh(invoice)
    assert (invoice.status, invoice.amount_due) == ("paid", Decimal("0.00"))
    assert invoice.paid_at is not None
    listed = staff_client.get(f"{API}/payments?invoice_id={invoice.id}").json()
    assert listed["total"] == 2


def test_overpayment_is_rejected(staff_client: TestClient, db: Session, invoice) -> None:
    pay(staff_client, invoice.id, "1000.00")
    res = pay(staff_client, invoice.id, "180.01")
    assert res.status_code == 422
    err = res.json()["error"]
    assert err["code"] == "AMOUNT_EXCEEDS_DUE"
    assert err["details"] == {"amount_due": "180.00"}
    db.refresh(invoice)
    assert invoice.amount_paid == Decimal("1000.00")


@pytest.mark.parametrize("status", ["draft", "cancelled"])
def test_only_confirmed_invoices_take_payments(
    staff_client: TestClient, db: Session, status
) -> None:
    inv = f.invoice(db, f.subscription(db, f.customer(db)), status=status)
    res = pay(staff_client, inv.id, "1.00")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "INVALID_STATE"


def test_paid_invoice_rejects_more_money(staff_client: TestClient, invoice) -> None:
    pay(staff_client, invoice.id, "1180.00")
    assert pay(staff_client, invoice.id, "0.01").status_code == 409


def test_payment_input_validation(staff_client: TestClient, invoice) -> None:
    tomorrow = str(business_today() + timedelta(days=1))
    assert pay(staff_client, invoice.id, "0").status_code == 422
    assert pay(staff_client, invoice.id, "-5").status_code == 422
    assert pay(staff_client, invoice.id, "1.001").status_code == 422
    assert pay(staff_client, invoice.id, "1", method="bitcoin").status_code == 422
    assert pay(staff_client, invoice.id, "1", payment_date=tomorrow).status_code == 422
    assert pay(staff_client, 999999, "1").status_code == 404
    body = {"invoice_id": invoice.id, "method": "cash", "amount": "1", "payment_date": "2026-01-01"}
    assert staff_client.post(f"{API}/payments", json=body).status_code == 422  # no key
    bad_key = {"Idempotency-Key": "not-a-uuid"}
    assert staff_client.post(f"{API}/payments", json=body, headers=bad_key).status_code == 422


def test_idempotent_retry_returns_original(staff_client: TestClient, db: Session, invoice) -> None:
    key = str(uuid.uuid4())
    first = pay(staff_client, invoice.id, "300.00", key=key)
    again = pay(staff_client, invoice.id, "300.00", key=key)
    assert first.status_code == again.status_code == 201
    assert first.json()["id"] == again.json()["id"]
    assert db.scalar(select(func.count()).where(Payment.invoice_id == invoice.id)) == 1
    db.refresh(invoice)
    assert invoice.amount_paid == Decimal("300.00")

    different = pay(staff_client, invoice.id, "301.00", key=key)
    assert different.status_code == 409
    assert different.json()["error"]["code"] == "DUPLICATE"


def test_void_requires_admin_and_restores_balance(client: TestClient, db: Session, invoice) -> None:
    login(client, make_user(db, "staff").email)
    payment_id = pay(client, invoice.id, "1180.00").json()["id"]
    db.refresh(invoice)
    assert invoice.status == "paid"
    assert (
        client.post(f"{API}/payments/{payment_id}/void", json={"reason": "Bounced"}).status_code
        == 403
    )

    login(client, make_user(db, "admin").email)
    assert client.post(f"{API}/payments/{payment_id}/void", json={"reason": "x"}).status_code == 422
    res = client.post(f"{API}/payments/{payment_id}/void", json={"reason": "Cheque bounced"})
    assert res.status_code == 200, res.text
    voided = res.json()
    assert (voided["status"], voided["void_reason"]) == ("voided", "Cheque bounced")
    assert voided["voided_by"] is not None
    db.refresh(invoice)
    assert (invoice.status, invoice.amount_paid, invoice.amount_due) == (
        "confirmed",
        Decimal("0.00"),
        Decimal("1180.00"),
    )
    assert invoice.paid_at is None
    again = client.post(f"{API}/payments/{payment_id}/void", json={"reason": "again"})
    assert again.status_code == 409
    # The invoice can be paid again after the void.
    assert pay(client, invoice.id, "1180.00").status_code == 201


def test_financial_actions_are_audited(admin_client: TestClient, db: Session, invoice) -> None:
    payment_id = pay(admin_client, invoice.id, "100.00").json()["id"]
    admin_client.post(f"{API}/payments/{payment_id}/void", json={"reason": "Entered twice"})
    actions = db.scalars(
        select(AuditEvent.action)
        .where(AuditEvent.entity_type == "invoice", AuditEvent.entity_id == invoice.id)
        .order_by(AuditEvent.id)
    ).all()
    assert actions == ["payment.recorded", "payment.voided"]


def test_payment_filters(staff_client: TestClient, db: Session, invoice) -> None:
    pay(staff_client, invoice.id, "100.00", method="cash")
    pay(staff_client, invoice.id, "200.00", method="card")
    base = f"{API}/payments?customer_id={invoice.customer_id}"
    assert staff_client.get(f"{base}&method=card").json()["total"] == 1
    assert staff_client.get(f"{base}&status=voided").json()["total"] == 0
    tomorrow = business_today() + timedelta(days=1)
    assert staff_client.get(f"{base}&date_from={tomorrow}").json()["total"] == 0


def test_portal_shows_only_own_payments(client: TestClient, db: Session) -> None:
    mine = f.portal_customer(db, "mine@portal.example.com")
    theirs = f.customer(db)
    my_inv = f.invoice(db, f.subscription(db, mine))
    their_inv = f.invoice(db, f.subscription(db, theirs))
    login(client, make_user(db, "staff", email="desk@example.com").email)
    pay(client, my_inv.id, "10.00")
    pay(client, their_inv.id, "20.00")

    login(client, "mine@portal.example.com")
    res = client.get(f"{API}/portal/payments")
    assert res.status_code == 200
    items = res.json()["items"]
    assert [i["amount"] for i in items] == ["10.00"]
    assert "recorded_by" not in items[0] and "void_reason" not in items[0]
    assert pay(client, my_inv.id, "1.00").status_code == 403
    assert client.get(f"{API}/payments").status_code == 403


# ----------------------------------------------------------------------------- concurrency
# These use real, separately committed connections: the guarantees come from row locks.


def _committed_invoice(engine: Engine, total: str) -> int:
    with Session(engine) as s:
        inv = f.invoice(s, f.subscription(s, f.customer(s, "Concurrency")), total=total)
        s.commit()
        return inv.id


def _race(engine: Engine, calls: list[Callable[[Session], Payment]]) -> list[object]:
    """Run each call in its own session/thread, released at the same instant."""
    barrier = threading.Barrier(len(calls))
    results: list[object] = [None] * len(calls)

    def run(i: int) -> None:
        with Session(engine) as s:
            barrier.wait()
            try:
                results[i] = calls[i](s).id
                s.commit()
            except AppError as exc:
                s.rollback()
                results[i] = exc

    threads = [threading.Thread(target=run, args=(i,)) for i in range(len(calls))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    return results


def test_concurrent_payments_never_exceed_amount_due(engine: Engine) -> None:
    invoice_id = _committed_invoice(engine, "1000.00")
    today = business_today()

    def full_payment(s: Session) -> Payment:
        return ledger.record_payment(
            s, invoice_id=invoice_id, method="card", amount=Decimal("1000.00"), payment_date=today
        )

    results = _race(engine, [full_payment] * 4)
    assert sum(isinstance(r, int) for r in results) == 1
    assert all(isinstance(r, int) or r.status_code in (409, 422) for r in results)
    with Session(engine) as s:
        inv = s.get(Invoice, invoice_id)
        assert (inv.status, inv.amount_paid) == ("paid", Decimal("1000.00"))
        posted = s.scalar(select(func.count()).where(Payment.invoice_id == invoice_id))
        assert posted == 1


def test_concurrent_retries_with_one_key_post_once(engine: Engine) -> None:
    invoice_id = _committed_invoice(engine, "500.00")
    key = str(uuid.uuid4())
    today = business_today()

    def retry(s: Session) -> Payment:
        return ledger.record_payment(
            s,
            invoice_id=invoice_id,
            method="upi",
            amount=Decimal("200.00"),
            payment_date=today,
            idempotency_key=key,
        )

    results = _race(engine, [retry] * 3)
    assert all(isinstance(r, int) for r in results), results
    assert len(set(results)) == 1
    with Session(engine) as s:
        assert s.get(Invoice, invoice_id).amount_paid == Decimal("200.00")
