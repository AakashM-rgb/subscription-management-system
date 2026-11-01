"""Catalog and customer changes leave an append-only audit trail (who, what, old -> new)."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent, User
from tests.test_catalog import plan_body

API = "/api/v1"


def events(db: Session, entity_type: str, entity_id: int) -> list[AuditEvent]:
    return list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.entity_type == entity_type, AuditEvent.entity_id == entity_id)
            .order_by(AuditEvent.id)
        )
    )


def actor_email(db: Session, event: AuditEvent) -> str:
    return db.get(User, event.actor_user_id).email


def test_tax_changes_are_traceable(admin_client: TestClient, db: Session) -> None:
    tax = admin_client.post(f"{API}/taxes", json={"name": "GST 12%", "rate": "12"}).json()
    admin_client.patch(f"{API}/taxes/{tax['id']}", json={"rate": "18"})
    created, updated = events(db, "tax", tax["id"])
    assert (created.action, created.actor_type) == ("tax.created", "user")
    assert created.data["name"] == "GST 12%"
    assert updated.action == "tax.updated"
    assert updated.data["changes"] == {"rate": {"from": "12.000", "to": "18.000"}}
    assert actor_email(db, updated) == "admin@example.com"


def test_no_op_patch_writes_no_event(admin_client: TestClient, db: Session) -> None:
    tax = admin_client.post(f"{API}/taxes", json={"name": "GST 5%", "rate": "5"}).json()
    admin_client.patch(f"{API}/taxes/{tax['id']}", json={"rate": "5.000", "name": "GST 5%"})
    assert [e.action for e in events(db, "tax", tax["id"])] == ["tax.created"]


def test_product_price_and_variant_changes(admin_client: TestClient, db: Session) -> None:
    body = {"name": "CRM", "product_type": "service", "sales_price": "1000", "cost_price": "400"}
    product = admin_client.post(f"{API}/products", json=body).json()
    admin_client.patch(f"{API}/products/{product['id']}", json={"sales_price": "1250.50"})
    variant = admin_client.post(
        f"{API}/products/{product['id']}/variants",
        json={"attribute": "Brand", "value": "Odoo", "extra_price": "560"},
    ).json()
    admin_client.patch(
        f"{API}/products/{product['id']}/variants/{variant['id']}", json={"extra_price": "600"}
    )
    changes = [e for e in events(db, "product", product["id"]) if e.action == "product.updated"]
    assert changes[0].data["changes"] == {"sales_price": {"from": "1000.00", "to": "1250.50"}}
    v_events = events(db, "product_variant", variant["id"])
    assert [e.action for e in v_events] == ["product_variant.created", "product_variant.updated"]
    assert v_events[1].data["changes"] == {"extra_price": {"from": "560.00", "to": "600.00"}}


def test_plan_price_and_flags(admin_client: TestClient, db: Session) -> None:
    plan = admin_client.post(f"{API}/plans", json=plan_body()).json()
    admin_client.patch(
        f"{API}/plans/{plan['id']}",
        json={"price": "1500", "pausable": False, "available_until": "2027-06-30"},
    )
    _, updated = events(db, "plan", plan["id"])
    assert updated.data["changes"] == {
        "price": {"from": "1200.00", "to": "1500.00"},
        "pausable": {"from": True, "to": False},
        "available_until": {"from": "2026-12-31", "to": "2027-06-30"},
    }


def test_discount_rule_changes_include_product_list(admin_client: TestClient, db: Session) -> None:
    base = {"product_type": "service", "sales_price": "10", "cost_price": "5"}
    a = admin_client.post(f"{API}/products", json={**base, "name": "A"}).json()["id"]
    b = admin_client.post(f"{API}/products", json={**base, "name": "B"}).json()["id"]
    rule = admin_client.post(
        f"{API}/discounts",
        json={
            "name": "Promo",
            "kind": "fixed",
            "value": "50",
            "scope": "product",
            "product_ids": [a],
            "valid_from": str(date(2026, 1, 1)),
        },
    ).json()
    admin_client.patch(
        f"{API}/discounts/{rule['id']}",
        json={"value": "75", "product_ids": [a, b], "is_active": False},
    )
    _, updated = events(db, "discount", rule["id"])
    assert updated.data["changes"] == {
        "value": {"from": "50.00", "to": "75.00"},
        "is_active": {"from": True, "to": False},
        "product_ids": {"from": [a], "to": sorted([a, b])},
    }


def test_customer_events_hold_no_personal_data(staff_client: TestClient, db: Session) -> None:
    body = {"name": "Kochi Traders", "email": "pii@kochi.example.com", "phone": "+919847000000"}
    cust = staff_client.post(f"{API}/customers", json=body).json()
    staff_client.patch(
        f"{API}/customers/{cust['id']}",
        json={"phone": "+919847111111", "address": "12 MG Road", "is_active": False},
    )
    created, updated = events(db, "customer", cust["id"])
    assert created.action == "customer.created" and created.data == {}
    assert updated.data == {"fields": ["address", "is_active", "phone"]}
    dump = str([created.data, updated.data])
    for secret in ("pii@kochi", "+9198471", "MG Road", "Kochi Traders"):
        assert secret not in dump
    assert actor_email(db, updated) == "staff@example.com"


def test_failed_write_leaves_no_event(admin_client: TestClient, db: Session) -> None:
    admin_client.post(f"{API}/taxes", json={"name": "Dup", "rate": "1"})
    before = db.scalar(select(AuditEvent.id).order_by(AuditEvent.id.desc()).limit(1))
    assert admin_client.post(f"{API}/taxes", json={"name": "Dup", "rate": "2"}).status_code == 409
    assert admin_client.patch(f"{API}/taxes/999999", json={"rate": "3"}).status_code == 404
    assert db.scalar(select(AuditEvent.id).order_by(AuditEvent.id.desc()).limit(1)) == before


def test_payment_term_changes(admin_client: TestClient, db: Session) -> None:
    term = admin_client.post(f"{API}/payment-terms", json={"name": "Net 45", "due_days": 45}).json()
    admin_client.patch(f"{API}/payment-terms/{term['id']}", json={"due_days": 60})
    _, updated = events(db, "payment_term", term["id"])
    assert updated.data["changes"] == {"due_days": {"from": 45, "to": 60}}


@pytest.mark.parametrize("path", ["/taxes", "/plans", "/discounts", "/payment-terms", "/products"])
def test_staff_cannot_change_catalog_so_no_event_is_written(
    staff_client: TestClient, db: Session, path: str
) -> None:
    before = db.scalar(select(AuditEvent.id).order_by(AuditEvent.id.desc()).limit(1))
    assert staff_client.post(f"{API}{path}", json={}).status_code == 403
    assert db.scalar(select(AuditEvent.id).order_by(AuditEvent.id.desc()).limit(1)) == before
