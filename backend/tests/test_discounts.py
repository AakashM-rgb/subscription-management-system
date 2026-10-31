from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Discount
from app.services.common import business_today
from tests.conftest import login, make_user

API = "/api/v1"


def product(client: TestClient, name: str = "Seat") -> int:
    body = {"name": name, "product_type": "service", "sales_price": "100", "cost_price": "10"}
    return client.post(f"{API}/products", json=body).json()["id"]


def body(**overrides) -> dict:
    data = {
        "name": "Volume 10%",
        "kind": "percentage",
        "value": "10",
        "scope": "subscription",
        "min_quantity": 10,
        "min_purchase_amount": "5000.00",
        "valid_from": "2026-01-01",
        "valid_until": "2026-12-31",
        "usage_limit": 100,
    }
    data.update(overrides)
    return data


def test_only_admin_creates_discount_rules(client: TestClient, db: Session) -> None:
    login(client, make_user(db, "staff").email)
    assert client.post(f"{API}/discounts", json=body()).status_code == 403
    assert client.get(f"{API}/discounts").status_code == 200
    login(client, make_user(db, "admin").email)
    res = client.post(f"{API}/discounts", json=body())
    assert res.status_code == 201, res.text
    d = res.json()
    assert (d["kind"], d["value"], d["usage_count"], d["products"]) == (
        "percentage",
        "10.00",
        0,
        [],
    )


def test_discount_rule_validation(admin_client: TestClient) -> None:
    pid = product(admin_client)
    cases = [
        body(value="101"),  # percentage over 100
        body(value="0"),
        body(kind="flat"),
        body(scope="product"),  # product scope without products
        body(product_ids=[pid]),  # subscription scope with products
        body(valid_until="2025-12-31"),
        body(usage_limit=0),
        body(min_quantity=0),
        body(scope="product", product_ids=[999999]),
        body(usage_count=5),  # read-only: unknown request field
    ]
    for case in cases:
        res = admin_client.post(f"{API}/discounts", json=case)
        assert res.status_code == 422, (case, res.text)
    fixed = admin_client.post(f"{API}/discounts", json=body(kind="fixed", value="2500.00"))
    assert fixed.status_code == 201


def test_product_specific_discount(admin_client: TestClient) -> None:
    seat, backup = product(admin_client, "Seat"), product(admin_client, "Backup")
    res = admin_client.post(
        f"{API}/discounts", json=body(scope="product", product_ids=[seat, backup, seat])
    )
    assert res.status_code == 201, res.text
    assert sorted(p["id"] for p in res.json()["products"]) == sorted([seat, backup])
    did = res.json()["id"]
    # Switching to whole-subscription must clear the product list explicitly.
    assert (
        admin_client.patch(f"{API}/discounts/{did}", json={"scope": "subscription"}).status_code
        == 422
    )
    res = admin_client.patch(
        f"{API}/discounts/{did}", json={"scope": "subscription", "product_ids": []}
    )
    assert res.status_code == 200 and res.json()["products"] == []


def test_state_reflects_dates_limits_and_flag(admin_client: TestClient, db: Session) -> None:
    today = business_today()
    day = timedelta(days=1)
    ids = {}
    for name, overrides in {
        "active": {"valid_from": str(today - day), "valid_until": str(today + day)},
        "scheduled": {"valid_from": str(today + day), "valid_until": None},
        "expired": {"valid_from": str(today - 10 * day), "valid_until": str(today - day)},
        "exhausted": {"valid_from": str(today - day), "valid_until": None, "usage_limit": 2},
        "inactive": {"valid_from": str(today - day), "valid_until": None},
    }.items():
        ids[name] = admin_client.post(f"{API}/discounts", json=body(name=name, **overrides)).json()[
            "id"
        ]
    # Billing consumes uses; simulate two uses having been counted.
    db.execute(update(Discount).where(Discount.id == ids["exhausted"]).values(usage_count=2))
    admin_client.patch(f"{API}/discounts/{ids['inactive']}", json={"is_active": False})

    for name, did in ids.items():
        assert admin_client.get(f"{API}/discounts/{did}").json()["state"] == name
    usable = admin_client.get(f"{API}/discounts?usable_on_date={today}").json()
    assert [d["name"] for d in usable["items"]] == ["active"]


def test_usage_limit_cannot_drop_below_uses(admin_client: TestClient, db: Session) -> None:
    did = admin_client.post(f"{API}/discounts", json=body(usage_limit=5)).json()["id"]
    db.execute(update(Discount).where(Discount.id == did).values(usage_count=3))
    res = admin_client.patch(f"{API}/discounts/{did}", json={"usage_limit": 2})
    assert res.status_code == 409
    assert admin_client.patch(f"{API}/discounts/{did}", json={"usage_limit": 3}).status_code == 200
    assert admin_client.patch(f"{API}/discounts/{did}", json={"usage_count": 0}).status_code == 422
