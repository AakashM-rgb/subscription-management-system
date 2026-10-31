"""Approved rule: invoices of subscriptions with an active, customer-authorised autopay mandate
are confirmed automatically at billing; everything else stays Draft for staff review."""

from datetime import date
from decimal import Decimal as D

import pytest
from sqlalchemy import select

from app.models import AuditEvent, Customer, Invoice, PaymentMandate
from app.services import billing
from tests.test_subscriptions_billing import catalog, make_active  # noqa: F401 - fixtures

START = date(2026, 1, 1)


def mandate(db, customer_id, status="active", max_amount=None, ref="mdt_1"):
    m = PaymentMandate(
        customer_id=customer_id,
        provider="razorpay",
        provider_mandate_id=ref,
        status=status,
        max_amount=max_amount,
        display_hint="UPI - te***@okbank",
    )
    db.add(m)
    db.flush()
    return m


def bill(db, sub):
    billing.run_billing(db, as_of=START, trigger="scheduled")
    return db.scalar(select(Invoice).where(Invoice.subscription_id == sub.id))


def audit_actions(db, invoice):
    return [
        e.action
        for e in db.scalars(
            select(AuditEvent)
            .where(AuditEvent.entity_type == "invoice", AuditEvent.entity_id == invoice.id)
            .order_by(AuditEvent.id)
        )
    ]


def test_authorised_autopay_invoice_is_confirmed(db, catalog):  # noqa: F811
    sub = make_active(db, catalog, START)
    sub.auto_collect, sub.mandate_id = True, mandate(db, catalog["customer"].id).id
    inv = bill(db, sub)
    assert inv.status == "confirmed" and inv.number.startswith("INV/2026/")
    assert "invoice.autopay_confirmed" in audit_actions(db, inv)


def test_without_autopay_invoice_stays_draft(db, catalog):  # noqa: F811
    sub = make_active(db, catalog, START)
    inv = bill(db, sub)
    assert inv.status == "draft" and inv.number is None
    assert "invoice.autopay_skipped" not in audit_actions(db, inv)


@pytest.mark.parametrize(
    ("status", "max_amount", "reason"),
    [
        ("pending", None, "mandate_not_active"),  # customer never finished authorising
        ("cancelled", None, "mandate_not_active"),  # authorisation withdrawn
        ("active", D("1000.00"), "exceeds_mandate_limit"),  # invoice is 11,788.20
    ],
)
def test_invalid_authorisation_keeps_draft_and_records_why(db, catalog, status, max_amount, reason):  # noqa: F811
    sub = make_active(db, catalog, START)
    sub.auto_collect = True
    sub.mandate_id = mandate(db, catalog["customer"].id, status, max_amount).id
    inv = bill(db, sub)
    assert inv.status == "draft"
    skipped = db.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "invoice.autopay_skipped", AuditEvent.entity_id == inv.id
        )
    )
    assert skipped.data["reason"] == reason


def test_another_customers_mandate_is_never_used(db, catalog):  # noqa: F811
    stranger = Customer(name="Stranger", email="stranger@example.com")
    db.add(stranger)
    db.flush()
    sub = make_active(db, catalog, START)
    sub.auto_collect, sub.mandate_id = True, mandate(db, stranger.id, ref="mdt_x").id
    inv = bill(db, sub)
    assert inv.status == "draft"
    assert "invoice.autopay_skipped" in audit_actions(db, inv)
