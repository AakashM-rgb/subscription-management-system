from datetime import date, timedelta
from decimal import Decimal as D

from sqlalchemy import select

from app.models import Customer, EmailOutbox, Invoice, Subscription
from app.services import billing
from app.services import invoices as invoice_svc
from tests.conftest import PASSWORD, login, make_user
from tests.test_subscriptions_billing import catalog, make_active  # noqa: F401 - fixtures

API = "/api/v1"
NEW_PASSWORD = "N3w-Secret!pw"


def latest_link(db, template: str) -> str:
    row = db.scalar(
        select(EmailOutbox).where(EmailOutbox.template == template).order_by(EmailOutbox.id.desc())
    )
    return row.context["url"].split("token=")[1]


# ------------------------------------------------------------------ password reset


def test_forgot_and_reset_password(client, db):
    user = make_user(db, "staff")
    assert client.post(f"{API}/auth/password/forgot", json={"email": user.email}).status_code == 202
    token = latest_link(db, "password_reset")
    res = client.post(f"{API}/auth/password/reset", json={"token": token, "password": NEW_PASSWORD})
    assert res.status_code == 204
    login(client, user.email, NEW_PASSWORD)
    again = client.post(
        f"{API}/auth/password/reset", json={"token": token, "password": NEW_PASSWORD}
    )
    assert again.status_code == 400 and again.json()["error"]["code"] == "INVALID_TOKEN"


def test_forgot_password_does_not_reveal_accounts_and_is_throttled(client, db):
    assert (
        client.post(f"{API}/auth/password/forgot", json={"email": "ghost@example.com"}).status_code
        == 202
    )
    assert db.scalar(select(EmailOutbox)) is None
    user = make_user(db, "staff")
    for _ in range(5):
        client.post(f"{API}/auth/password/forgot", json={"email": user.email})
    sent = db.scalars(select(EmailOutbox).where(EmailOutbox.to_email == user.email)).all()
    assert len(sent) == 3


def test_reset_password_enforces_policy(client, db):
    user = make_user(db, "staff")
    client.post(f"{API}/auth/password/forgot", json={"email": user.email})
    res = client.post(
        f"{API}/auth/password/reset",
        json={"token": latest_link(db, "password_reset"), "password": "weak"},
    )
    assert res.status_code == 422


def test_login_throttling(client, db):
    user = make_user(db, "staff")
    for _ in range(5):
        client.post(f"{API}/auth/login", json={"email": user.email, "password": "wrong"})
    res = client.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    assert res.status_code == 429 and res.json()["error"]["code"] == "RATE_LIMITED"


def test_change_password_keeps_current_session(client, db):
    user = make_user(db, "staff")
    login(client, user.email)
    res = client.post(
        f"{API}/auth/password/change",
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert res.status_code == 204
    assert client.get(f"{API}/auth/me").status_code == 200


# ------------------------------------------------------------------ portal invites


def test_staff_invites_customer_to_portal(client, db):
    customer = Customer(name="Big Corp", email="finance@bigcorp.example.com")
    db.add(customer)
    db.flush()
    login(client, make_user(db, "staff").email)
    assert client.post(f"{API}/customers/{customer.id}/portal-invite").status_code == 202
    client.post(f"{API}/auth/logout")
    res = client.post(
        f"{API}/auth/invite/accept",
        json={"token": latest_link(db, "invite"), "password": NEW_PASSWORD},
    )
    assert res.status_code == 200, res.text
    assert res.json()["role"] == "customer" and res.json()["customer_id"] == customer.id


def test_invite_refuses_email_owned_by_another_account(client, db):
    make_user(db, "staff", email="taken@example.com")
    customer = Customer(name="Clash", email="TAKEN@example.com")
    db.add(customer)
    db.flush()
    login(client, make_user(db, "admin").email)
    assert client.post(f"{API}/customers/{customer.id}/portal-invite").status_code == 409


# ------------------------------------------------------------------ quotation templates


def test_template_to_quotation(client, db, catalog):  # noqa: F811
    login(client, make_user(db, "staff").email)
    tpl = client.post(
        f"{API}/quotation-templates",
        json={
            "name": "Enterprise starter",
            "plan_id": catalog["monthly"].id,
            "plan_quantity": 20,
            "payment_term_id": catalog["term"].id,
            "term_periods": 12,
            "validity_days": 14,
            "lines": [
                {"product_id": catalog["crm"].id, "variant_id": catalog["odoo"].id, "quantity": 2}
            ],
        },
    )
    assert tpl.status_code == 201, tpl.text
    sub = client.post(
        f"{API}/subscriptions",
        json={
            "customer_id": catalog["customer"].id,
            "template_id": tpl.json()["id"],
            "start_date": date.today().isoformat(),
        },
    ).json()
    assert [line["quantity"] for line in sub["lines"]] == [20, 2]
    assert sub["template_id"] == tpl.json()["id"] and sub["term_periods"] == 12
    quote = client.post(f"{API}/subscriptions/{sub['id']}/send-quotation").json()
    assert quote["quotation_valid_until"] == (date.today() + timedelta(days=14)).isoformat()


def test_template_rejects_quantity_below_plan_minimum(client, db, catalog):  # noqa: F811
    login(client, make_user(db, "admin").email)
    res = client.post(
        f"{API}/quotation-templates",
        json={
            "name": "Too small",
            "plan_id": catalog["monthly"].id,
            "plan_quantity": 1,
            "validity_days": 7,
        },
    )
    assert res.status_code == 422


# ------------------------------------------------------------------ portal


def portal_customer(client, db, customer):
    user = make_user(db, "customer", email=f"{customer.id}@portal.example.com")
    customer.user_id = user.id
    db.flush()
    login(client, user.email)
    return user


def test_portal_isolation_and_self_service(client, db, catalog):  # noqa: F811
    mine = make_active(db, catalog, date(2026, 1, 1))
    other_customer = Customer(name="Someone Else", email="else@example.com")
    db.add(other_customer)
    db.flush()
    billing.run_billing(db, as_of=date(2026, 1, 1), trigger="manual")
    inv = db.scalar(select(Invoice).where(Invoice.subscription_id == mine.id))
    invoice_svc.confirm(db, inv, None)
    db.flush()

    portal_customer(client, db, catalog["customer"])
    subs = client.get(f"{API}/portal/subscriptions").json()
    assert [s["id"] for s in subs["items"]] == [mine.id]
    detail = client.get(f"{API}/portal/subscriptions/{mine.id}").json()
    assert "bill_now" not in detail["available_actions"] and "pause" in detail["available_actions"]
    paused = client.post(f"{API}/portal/subscriptions/{mine.id}/pause")
    assert paused.status_code == 200 and paused.json()["is_paused"] is True
    invoices = client.get(f"{API}/portal/invoices").json()["items"]
    assert [i["id"] for i in invoices] == [inv.id]
    summary = client.get(f"{API}/portal/summary").json()
    assert summary["active_subscriptions"] == 1 and D(summary["outstanding_amount"]) > 0
    assert client.get(f"{API}/subscriptions").status_code == 403  # staff API is off-limits

    portal_customer(client, db, other_customer)
    assert client.get(f"{API}/portal/subscriptions/{mine.id}").status_code == 404
    assert client.get(f"{API}/portal/invoices/{inv.id}").status_code == 404
    assert client.post(f"{API}/portal/subscriptions/{mine.id}/resume").status_code == 404
    assert client.get(f"{API}/portal/subscriptions").json()["total"] == 0


def test_customer_accepts_quotation_but_never_sees_drafts(client, db, catalog):  # noqa: F811
    login(client, make_user(db, "staff").email)
    body = {
        "customer_id": catalog["customer"].id,
        "plan_id": catalog["monthly"].id,
        "plan_quantity": 10,
        "start_date": date.today().isoformat(),
        "term_periods": 12,
        "payment_term_id": catalog["term"].id,
    }
    draft = client.post(f"{API}/subscriptions", json=body).json()
    quote = client.post(f"{API}/subscriptions", json=body).json()
    client.post(f"{API}/subscriptions/{quote['id']}/send-quotation")

    portal_customer(client, db, catalog["customer"])
    visible = [s["id"] for s in client.get(f"{API}/portal/subscriptions").json()["items"]]
    assert visible == [quote["id"]]
    assert client.get(f"{API}/portal/subscriptions/{draft['id']}").status_code == 404
    accepted = client.post(f"{API}/portal/subscriptions/{quote['id']}/accept")
    assert accepted.status_code == 200 and accepted.json()["status"] == "active"
    assert db.get(Subscription, quote["id"]).status == "active"


def test_portal_profile_update(client, db, catalog):  # noqa: F811
    portal_customer(client, db, catalog["customer"])
    res = client.patch(f"{API}/portal/profile", json={"phone": "+91 98470 00000"})
    assert res.status_code == 200 and res.json()["phone"] == "+91 98470 00000"
    assert client.patch(f"{API}/portal/profile", json={"email": "x@y.z"}).status_code == 422
