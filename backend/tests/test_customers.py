from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.common import business_today
from tests import business_factories as f
from tests.conftest import login, make_user

API = "/api/v1"


def test_staff_manages_customers(staff_client: TestClient) -> None:
    body = {"name": "Kochi Traders", "email": "Accounts@Kochi.Example.com", "phone": "+91 98470"}
    res = staff_client.post(f"{API}/customers", json=body)
    assert res.status_code == 201, res.text
    cust = res.json()
    assert cust["email"] == "accounts@kochi.example.com"
    assert cust["user_id"] is None

    res = staff_client.patch(f"{API}/customers/{cust['id']}", json={"company_name": "KT Pvt Ltd"})
    assert res.json()["company_name"] == "KT Pvt Ltd"
    assert staff_client.get(f"{API}/customers?q=kochi").json()["total"] == 1
    assert staff_client.get(f"{API}/customers?q=nobody").json()["total"] == 0
    assert (
        staff_client.patch(f"{API}/customers/{cust['id']}", json={"name": None}).status_code == 422
    )
    assert staff_client.post(f"{API}/customers", json={**body, "email": "bad"}).status_code == 422
    assert staff_client.get(f"{API}/customers/999999").status_code == 404


def test_customer_role_cannot_list_customers(client: TestClient, db: Session) -> None:
    f.portal_customer(db, "me@portal.example.com")
    login(client, "me@portal.example.com")
    assert client.get(f"{API}/customers").status_code == 403


def test_portal_linked_email_is_owned_by_the_login(staff_client: TestClient, db: Session) -> None:
    cust = f.portal_customer(db, "owner@portal.example.com")
    res = staff_client.patch(f"{API}/customers/{cust.id}", json={"email": "other@x.example.com"})
    assert res.status_code == 409
    res = staff_client.patch(f"{API}/customers/{cust.id}", json={"phone": "123"})
    assert res.status_code == 200


def test_balance_counts_only_confirmed_unpaid(staff_client: TestClient, db: Session) -> None:
    cust = f.customer(db)
    sub = f.subscription(db, cust)
    today = business_today()
    f.invoice(db, sub, total="1180.00")  # due in 15 days
    f.invoice(db, sub, total="590.00", invoice_date=today - timedelta(days=40))  # 25 days late
    f.invoice(db, sub, total="100.00", status="draft")
    f.invoice(db, sub, total="200.00", status="cancelled")
    res = staff_client.get(f"{API}/customers/{cust.id}/balance")
    assert res.status_code == 200
    assert res.json() == {
        "customer_id": cust.id,
        "outstanding_amount": "1770.00",
        "open_invoice_count": 2,
        "overdue_amount": "590.00",
        "overdue_count": 1,
    }


def test_admin_can_also_manage_customers(client: TestClient, db: Session) -> None:
    login(client, make_user(db, "admin").email)
    res = client.post(f"{API}/customers", json={"name": "A", "email": "a@a.example.com"})
    assert res.status_code == 201
