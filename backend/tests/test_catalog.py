from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests import business_factories as f
from tests.conftest import login, make_user

API = "/api/v1"


# ----------------------------------------------------------------------------- permissions


def test_staff_reads_catalog_but_cannot_write(client: TestClient, db: Session) -> None:
    login(client, make_user(db, "staff").email)
    assert client.get(f"{API}/taxes").status_code == 200
    assert client.get(f"{API}/products").status_code == 200
    assert client.get(f"{API}/plans").status_code == 200
    assert client.post(f"{API}/taxes", json={"name": "X", "rate": "5"}).status_code == 403
    product = {"name": "P", "product_type": "service", "sales_price": "1", "cost_price": "1"}
    assert client.post(f"{API}/products", json=product).status_code == 403
    plan = {"name": "P", "price": "1", "billing_period": "monthly", "available_from": "2026-01-01"}
    assert client.post(f"{API}/plans", json=plan).status_code == 403


def test_customers_and_anonymous_cannot_read_catalog(client: TestClient, db: Session) -> None:
    assert client.get(f"{API}/products").status_code == 401
    login(client, make_user(db, "customer").email)
    assert client.get(f"{API}/products").status_code == 403
    assert client.get(f"{API}/taxes").status_code == 403


# ----------------------------------------------------------------------------- taxes & terms


def test_tax_crud_and_duplicate_name(admin_client: TestClient) -> None:
    res = admin_client.post(f"{API}/taxes", json={"name": "GST 5%", "rate": "5"})
    assert res.status_code == 201, res.text
    tax = res.json()
    assert tax["rate"] == "5.000"
    dup = admin_client.post(f"{API}/taxes", json={"name": "GST 5%", "rate": "5"})
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "DUPLICATE"
    res = admin_client.patch(f"{API}/taxes/{tax['id']}", json={"is_active": False})
    assert res.json()["is_active"] is False
    assert admin_client.get(f"{API}/taxes?is_active=true").json()["total"] == 0


def test_tax_rate_bounds_and_null_fields(admin_client: TestClient) -> None:
    assert (
        admin_client.post(f"{API}/taxes", json={"name": "Bad", "rate": "100.5"}).status_code == 422
    )
    assert admin_client.post(f"{API}/taxes", json={"name": "Bad", "rate": "-1"}).status_code == 422
    tax = admin_client.post(f"{API}/taxes", json={"name": "GST 12%", "rate": "12"}).json()
    res = admin_client.patch(f"{API}/taxes/{tax['id']}", json={"name": None})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


def test_payment_terms(admin_client: TestClient) -> None:
    res = admin_client.post(f"{API}/payment-terms", json={"name": "Net 45", "due_days": 45})
    assert res.status_code == 201
    term_id = res.json()["id"]
    assert (
        admin_client.post(f"{API}/payment-terms", json={"name": "Bad", "due_days": -1}).status_code
        == 422
    )
    res = admin_client.patch(f"{API}/payment-terms/{term_id}", json={"due_days": 60})
    assert res.json()["due_days"] == 60


# ----------------------------------------------------------------------------- products


def test_product_with_variant_extra_price(admin_client: TestClient, basics: dict) -> None:
    body = {
        "name": "Accounting Suite",
        "product_type": "service",
        "sales_price": "1000.00",
        "cost_price": "400.00",
        "notes": "Billed per seat",
        "tax_id": basics["tax"].id,
        "variants": [{"attribute": "Brand", "value": "Odoo", "extra_price": "560.00"}],
    }
    res = admin_client.post(f"{API}/products", json=body)
    assert res.status_code == 201, res.text
    product = res.json()
    assert product["sales_price"] == "1000.00"
    assert product["tax"]["name"] == "GST 18%"
    assert product["variants"][0]["extra_price"] == "560.00"

    res = admin_client.post(
        f"{API}/products/{product['id']}/variants",
        json={"attribute": "Brand", "value": "Odoo", "extra_price": "1"},
    )
    assert res.status_code == 409
    res = admin_client.post(
        f"{API}/products/{product['id']}/variants",
        json={"attribute": "Brand", "value": "Generic"},
    )
    assert res.status_code == 201
    assert res.json()["extra_price"] == "0.00"
    detail = admin_client.get(f"{API}/products/{product['id']}").json()
    assert [v["value"] for v in detail["variants"]] == ["Odoo", "Generic"]


def test_product_validation(admin_client: TestClient) -> None:
    base = {"name": "X", "product_type": "service", "sales_price": "10", "cost_price": "5"}
    assert (
        admin_client.post(f"{API}/products", json={**base, "sales_price": "-1"}).status_code == 422
    )
    assert (
        admin_client.post(f"{API}/products", json={**base, "sales_price": "1.005"}).status_code
        == 422
    )
    assert (
        admin_client.post(f"{API}/products", json={**base, "product_type": "x"}).status_code == 422
    )
    assert admin_client.post(f"{API}/products", json={**base, "tax_id": 999999}).status_code == 422
    assert admin_client.post(f"{API}/products", json={**base, "owner": "me"}).status_code == 422
    dup_variants = [{"attribute": "Size", "value": "L"}, {"attribute": "size", "value": "l"}]
    assert (
        admin_client.post(f"{API}/products", json={**base, "variants": dup_variants}).status_code
        == 409
    )


def test_variant_must_belong_to_product(admin_client: TestClient) -> None:
    base = {"name": "A", "product_type": "goods", "sales_price": "10", "cost_price": "5"}
    a = admin_client.post(
        f"{API}/products", json={**base, "variants": [{"attribute": "C", "value": "1"}]}
    ).json()
    b = admin_client.post(f"{API}/products", json={**base, "name": "B"}).json()
    vid = a["variants"][0]["id"]
    assert (
        admin_client.patch(
            f"{API}/products/{b['id']}/variants/{vid}", json={"extra_price": "1"}
        ).status_code
        == 404
    )
    res = admin_client.patch(f"{API}/products/{a['id']}/variants/{vid}", json={"is_active": False})
    assert res.status_code == 200 and res.json()["is_active"] is False


def test_product_search_and_archive(admin_client: TestClient) -> None:
    base = {"product_type": "service", "sales_price": "10", "cost_price": "5"}
    admin_client.post(f"{API}/products", json={**base, "name": "CRM Seat"})
    p = admin_client.post(f"{API}/products", json={**base, "name": "Backup Add-on"}).json()
    admin_client.patch(f"{API}/products/{p['id']}", json={"is_active": False})
    res = admin_client.get(f"{API}/products?q=crm").json()
    assert [i["name"] for i in res["items"]] == ["CRM Seat"]
    assert admin_client.get(f"{API}/products?is_active=false").json()["total"] == 1


# ----------------------------------------------------------------------------- plans


def plan_body(**overrides) -> dict:
    body = {
        "name": "Business Monthly",
        "price": "1200.00",
        "billing_period": "monthly",
        "min_quantity": 5,
        "available_from": "2026-01-01",
        "available_until": "2026-12-31",
        "auto_close": True,
        "closable": True,
        "pausable": True,
        "renewable": False,
    }
    body.update(overrides)
    return body


def test_plan_create_with_options(admin_client: TestClient) -> None:
    res = admin_client.post(f"{API}/plans", json=plan_body())
    assert res.status_code == 201, res.text
    plan = res.json()
    assert (plan["auto_close"], plan["pausable"], plan["renewable"]) == (True, True, False)
    assert plan["min_quantity"] == 5
    for period in ("daily", "weekly", "yearly"):
        assert (
            admin_client.post(f"{API}/plans", json=plan_body(billing_period=period)).status_code
            == 201
        )
    assert (
        admin_client.post(f"{API}/plans", json=plan_body(billing_period="hourly")).status_code
        == 422
    )
    assert admin_client.post(f"{API}/plans", json=plan_body(min_quantity=0)).status_code == 422


def test_plan_availability_window(admin_client: TestClient) -> None:
    bad = plan_body(available_from="2026-06-01", available_until="2026-05-31")
    assert admin_client.post(f"{API}/plans", json=bad).status_code == 422
    plan = admin_client.post(f"{API}/plans", json=plan_body()).json()
    res = admin_client.patch(f"{API}/plans/{plan['id']}", json={"available_until": "2025-12-31"})
    assert res.status_code == 422
    assert admin_client.get(f"{API}/plans?available_on=2026-07-01").json()["total"] == 1
    assert admin_client.get(f"{API}/plans?available_on=2027-01-01").json()["total"] == 0


def test_plan_billing_period_locked_while_in_use(admin_client: TestClient, db: Session) -> None:
    plan = admin_client.post(f"{API}/plans", json=plan_body()).json()
    res = admin_client.patch(f"{API}/plans/{plan['id']}", json={"billing_period": "yearly"})
    assert res.status_code == 200  # unused plan: allowed

    from app.models import Plan

    f.subscription(db, f.customer(db), db.get(Plan, plan["id"]), status="active")
    res = admin_client.patch(f"{API}/plans/{plan['id']}", json={"billing_period": "monthly"})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "INVALID_STATE"
    # Price changes stay allowed: subscription lines keep the price they were sold at.
    assert (
        admin_client.patch(f"{API}/plans/{plan['id']}", json={"price": "1300"}).status_code == 200
    )
