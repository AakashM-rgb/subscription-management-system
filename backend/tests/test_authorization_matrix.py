"""Authorization matrix over EVERY route in the live OpenAPI schema.

- Unauthenticated: every route except the explicit public list answers 401 (never data, never 500).
- Customer role: every staff/admin route answers 403 (portal and account routes excepted).
- Staff and admin: every portal route answers 403 (portal data is scoped to the customer session).
New routes are covered automatically; an unexpected public route fails the first test.
"""

import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from tests.conftest import login, make_user

PREFIX = "/api/v1"
METHODS = ("get", "post", "put", "patch", "delete")

PUBLIC = {
    ("get", "/health"),
    ("get", "/health/ready"),
    ("post", "/auth/signup"),
    ("post", "/auth/login"),
    ("post", "/auth/logout"),
    ("post", "/auth/password/forgot"),
    ("post", "/auth/password/reset"),
    ("post", "/auth/invite/accept"),
    ("post", "/webhooks/payments/{provider}"),  # authenticated by provider signature instead
}


def routes() -> list[tuple[str, str]]:
    found = []
    for path, ops in app.openapi()["paths"].items():
        short = path.removeprefix(PREFIX)
        for method in METHODS:
            if method in ops:
                found.append((method, short))
    return sorted(found)


def concrete(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "1", PREFIX + path)


def call(client: TestClient, method: str, path: str):
    kwargs = {} if method == "get" else {"json": {}}
    return client.request(method.upper(), concrete(path), **kwargs)


ALL = routes()
PROTECTED = [r for r in ALL if r not in PUBLIC]
PORTAL = [r for r in PROTECTED if r[1].startswith("/portal")]
ACCOUNT = [r for r in PROTECTED if r[1].startswith("/auth")]
STAFF_ONLY = [r for r in PROTECTED if r not in PORTAL and r not in ACCOUNT]


def test_the_route_inventory_is_what_we_think_it_is() -> None:
    assert len(ALL) >= 90  # guards against the sweep silently covering nothing
    assert PUBLIC <= set(ALL)  # every declared public route really exists
    assert len(PROTECTED) == len(ALL) - len(PUBLIC)


@pytest.mark.parametrize("method, path", PROTECTED, ids=[f"{m.upper()} {p}" for m, p in PROTECTED])
def test_unauthenticated_requests_are_refused(client: TestClient, method: str, path: str) -> None:
    res = call(client, method, path)
    assert res.status_code == 401, f"{method.upper()} {path} -> {res.status_code} {res.text[:120]}"
    assert res.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.parametrize(
    "method, path", STAFF_ONLY, ids=[f"{m.upper()} {p}" for m, p in STAFF_ONLY]
)
def test_customers_cannot_reach_staff_routes(
    client: TestClient, db: Session, method: str, path: str
) -> None:
    login(client, make_user(db, "customer", email="matrix.customer@example.com").email)
    res = call(client, method, path)
    assert res.status_code == 403, f"{method.upper()} {path} -> {res.status_code} {res.text[:120]}"


@pytest.mark.parametrize("role", ["staff", "admin"])
@pytest.mark.parametrize("method, path", PORTAL, ids=[f"{m.upper()} {p}" for m, p in PORTAL])
def test_staff_and_admin_cannot_use_portal_routes(
    client: TestClient, db: Session, role: str, method: str, path: str
) -> None:
    login(client, make_user(db, role, email=f"matrix.{role}@example.com").email)
    res = call(client, method, path)
    assert res.status_code == 403, f"{method.upper()} {path} -> {res.status_code} {res.text[:120]}"
