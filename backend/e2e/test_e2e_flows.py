"""Write-enabled end-to-end flows against a RUNNING backend and a disposable *_e2e database.

Black-box over HTTP with real cookie sessions per role. Direct SQL is used only to stand in for
steps that need Razorpay's servers (a customer completing mandate authorisation, and the
charge request being accepted); all webhooks are signed exactly like Razorpay signs them.

Run via e2e/run_e2e.sh, or manually:
  E2E_BASE_URL=http://127.0.0.1:8200 E2E_DATABASE_URL=postgresql+psycopg://...sms_e2e \
  E2E_WEBHOOK_SECRET=... uv run pytest e2e -o addopts="" -p no:cacheprovider -k "not worker"
"""

import calendar
import hashlib
import hmac
import json
import os
import time
import uuid
from datetime import date, timedelta
from decimal import Decimal as D
from pathlib import Path

import httpx
import pytest
from sqlalchemy import create_engine, make_url, text

BASE = os.environ.get("E2E_BASE_URL", "http://127.0.0.1:8200") + "/api/v1"
DB_URL = os.environ.get("E2E_DATABASE_URL", "")
SECRET = os.environ.get("E2E_WEBHOOK_SECRET", "")
ADMIN = (
    os.environ.get("E2E_ADMIN_EMAIL", "admin@brightloop.example.com"),
    os.environ.get("E2E_ADMIN_PASSWORD", "Admin@12345"),
)
STATE_FILE = Path(os.environ.get("E2E_STATE_FILE", ".e2e_state.json"))
PASSWORD = "E2e-Passw0rd!"
RUN = uuid.uuid4().hex[:8]
TODAY = date.today()
START = TODAY

pytestmark = pytest.mark.skipif(not DB_URL, reason="E2E_DATABASE_URL not set")
S: dict = {}  # state shared by the ordered tests in this module


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    year, month = d.year + y, m + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def client() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=30)


def ok(res: httpx.Response, status: int = 200) -> dict:
    assert res.status_code == status, f"{res.request.method} {res.request.url}: {res.text}"
    return res.json() if res.content else {}


def login(c: httpx.Client, email: str, password: str) -> dict:
    return ok(c.post("/auth/login", json={"email": email, "password": password}))


def db():
    assert make_url(DB_URL).database.endswith("_e2e"), "E2E only runs on a disposable *_e2e DB"
    return create_engine(DB_URL)


def sub_invoices(c, sub_id) -> list[dict]:
    return sorted(
        ok(c.get(f"/subscriptions/{sub_id}/invoices", params={"page_size": 100}))["items"],
        key=lambda i: i["period_start"],
    )


def run_billing(as_of: date) -> dict:
    return ok(S["admin"].post("/billing/runs", json={"as_of": as_of.isoformat()}), 201)


def signed_webhook(body: dict, event_id: str, secret: str = SECRET) -> httpx.Response:
    raw = json.dumps(body).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return httpx.post(
        f"{BASE}/webhooks/payments/razorpay",
        content=raw,
        timeout=30,
        headers={
            "content-type": "application/json",
            "x-razorpay-signature": sig,
            "x-razorpay-event-id": event_id,
        },
    )


# ----------------------------------------------------------------------------- 1. accounts


def test_01_customer_signup_and_login():
    S["admin"] = client()
    login(S["admin"], *ADMIN)
    anon = client()
    assert anon.get("/auth/me").status_code == 401
    weak = anon.post(
        "/auth/signup",
        json={"email": f"a-{RUN}@shop.example.com", "full_name": "Shop A", "password": "Short!1a"},
    )
    assert weak.status_code == 422  # exactly 8 chars: must be MORE than eight
    for key, name in (("a", "Shop A"), ("b", "Shop B")):
        c = client()
        me = ok(
            c.post(
                "/auth/signup",
                json={
                    "email": f"{key}-{RUN}@shop.example.com",
                    "full_name": f"{name} {RUN}",
                    "password": PASSWORD,
                },
            ),
            201,
        )
        assert me["role"] == "customer" and me["customer_id"]
        S[f"cust_{key}"], S[f"cust_{key}_id"] = c, me["customer_id"]
    dup = anon.post(
        "/auth/signup",
        json={"email": f"A-{RUN}@SHOP.example.com", "full_name": "Dup", "password": PASSWORD},
    )
    assert dup.status_code == 409
    fresh = client()
    assert login(fresh, f"a-{RUN}@shop.example.com", PASSWORD)["customer_id"] == S["cust_a_id"]


def test_02_staff_creation_and_permissions():
    staff_email = f"rep-{RUN}@brightloop.example.com"
    ok(
        S["admin"].post(
            "/users/staff",
            json={"email": staff_email, "full_name": "Sales Rep", "password": PASSWORD},
        ),
        201,
    )
    S["staff"] = client()
    login(S["staff"], staff_email, PASSWORD)
    staff, cust = S["staff"], S["cust_a"]
    assert (
        staff.post(
            "/users/staff",
            json={"email": f"x-{RUN}@example.com", "full_name": "X", "password": PASSWORD},
        ).status_code
        == 403
    )
    assert staff.post("/taxes", json={"name": "Nope", "rate": "5"}).status_code == 403
    assert (
        staff.post(
            "/discounts",
            json={
                "name": "Nope",
                "kind": "fixed",
                "value": "1",
                "scope": "subscription",
                "valid_from": TODAY.isoformat(),
            },
        ).status_code
        == 403
    )
    assert cust.get("/subscriptions").status_code == 403
    assert cust.get("/users").status_code == 403
    assert staff.get("/users").status_code == 403


# ----------------------------------------------------------------------------- 2. catalog


def test_03_catalog_setup_by_admin():
    a = S["admin"]
    tax = ok(a.post("/taxes", json={"name": f"GST 18% {RUN}", "rate": "18"}), 201)
    term = ok(a.post("/payment-terms", json={"name": f"Net 15 {RUN}", "due_days": 15}), 201)
    product = ok(
        a.post(
            "/products",
            json={
                "name": f"CRM Suite {RUN}",
                "product_type": "service",
                "sales_price": "1000.00",
                "cost_price": "400.00",
                "tax_id": tax["id"],
            },
        ),
        201,
    )
    variant = ok(
        a.post(
            f"/products/{product['id']}/variants",
            json={"attribute": "Brand", "value": "Odoo", "extra_price": "560.00"},
        ),
        201,
    )
    common = {"available_from": (TODAY - timedelta(days=400)).isoformat(), "tax_id": tax["id"]}
    monthly = ok(
        a.post(
            "/plans",
            json={
                **common,
                "name": f"Team Monthly {RUN}",
                "price": "999.00",
                "billing_period": "monthly",
                "min_quantity": 5,
                "auto_close": True,
                "closable": True,
                "pausable": True,
                "renewable": True,
            },
        ),
        201,
    )
    yearly = ok(
        a.post(
            "/plans",
            json={
                **common,
                "name": f"Enterprise Yearly {RUN}",
                "price": "50000.00",
                "billing_period": "yearly",
                "min_quantity": 1,
                "auto_close": False,
                "closable": False,
                "pausable": False,
                "renewable": True,
            },
        ),
        201,
    )
    discount = ok(
        a.post(
            "/discounts",
            json={
                "name": f"10 seats 10% {RUN}",
                "kind": "percentage",
                "value": "10",
                "scope": "subscription",
                "min_quantity": 10,
                "usage_limit": 2,
                "valid_from": TODAY.isoformat(),
            },
        ),
        201,
    )
    S.update(
        tax=tax,
        term=term,
        product=product,
        variant=variant,
        monthly=monthly,
        yearly=yearly,
        discount=discount,
    )
    products = ok(S["staff"].get("/products", params={"q": RUN}))["items"]
    assert [p["id"] for p in products] == [product["id"]]  # staff can read the catalog


# ----------------------------------------------------------------------------- 3. quotation


def test_04_quotation_acceptance_activates_subscription():
    staff = S["staff"]
    tpl = ok(
        staff.post(
            "/quotation-templates",
            json={
                "name": f"Starter {RUN}",
                "plan_id": S["monthly"]["id"],
                "plan_quantity": 10,
                "payment_term_id": S["term"]["id"],
                "term_periods": 12,
                "validity_days": 14,
                "lines": [
                    {
                        "product_id": S["product"]["id"],
                        "variant_id": S["variant"]["id"],
                        "quantity": 1,
                    }
                ],
            },
        ),
        201,
    )
    sub = ok(
        staff.post(
            "/subscriptions",
            json={
                "customer_id": S["cust_a_id"],
                "template_id": tpl["id"],
                "start_date": START.isoformat(),
            },
        ),
        201,
    )
    assert sub["status"] == "draft"
    assert sub["lines"][1]["unit_price"] == "1560.00"  # 1000 + Odoo variant 560
    assert sub["amount_total"] == "13629.00"  # (9990 + 1560) + 18% GST
    assert sub["id"] not in [s["id"] for s in ok(S["cust_a"].get("/portal/subscriptions"))["items"]]
    quote = ok(staff.post(f"/subscriptions/{sub['id']}/send-quotation"))
    assert quote["status"] == "quotation"
    portal = ok(S["cust_a"].get(f"/portal/subscriptions/{sub['id']}"))
    assert portal["available_actions"] == ["accept"]
    active = ok(S["cust_a"].post(f"/portal/subscriptions/{sub['id']}/accept"))
    assert active["status"] == "active" and active["next_invoice_date"] == START.isoformat()
    S["sub_a"] = sub["id"]


# ----------------------------------------------------------------------------- 4. billing


def test_05_automatic_invoice_at_due_date_and_no_duplicates():
    run_billing(START)
    first = sub_invoices(S["staff"], S["sub_a"])
    assert len(first) == 1 and first[0]["status"] == "draft"  # manual invoices stay Draft
    assert first[0]["amount_total"] == "13629.00"
    rerun = run_billing(START)
    assert rerun["status"] == "succeeded"
    assert len(sub_invoices(S["staff"], S["sub_a"])) == 1  # same day again: nothing new
    run_billing(add_months(START, 2))  # two more periods are due: catch-up, none skipped
    invoices = sub_invoices(S["staff"], S["sub_a"])
    assert [i["period_start"] for i in invoices] == [
        START.isoformat(),
        add_months(START, 1).isoformat(),
        add_months(START, 2).isoformat(),
    ]
    S["inv_ids"] = [i["id"] for i in invoices]


def test_06_bulk_invoice_confirmation():
    res = ok(
        S["staff"].post("/invoices/bulk-confirm", json={"invoice_ids": [*S["inv_ids"], 999999999]})
    )
    assert sorted(res["confirmed"]) == sorted(S["inv_ids"])
    assert res["errors"][0]["code"] == "NOT_FOUND"
    for inv_id in S["inv_ids"]:
        inv = ok(S["staff"].get(f"/invoices/{inv_id}"))
        assert inv["status"] == "confirmed" and inv["number"].startswith(
            f"INV/{inv['invoice_date'][:4]}/"
        )


# ----------------------------------------------------------------------------- 5. payments


def test_07_partial_payment_overpayment_void_and_reconciliation():
    staff, admin, inv_id = S["staff"], S["admin"], S["inv_ids"][0]
    total = D(ok(staff.get(f"/invoices/{inv_id}"))["amount_total"])
    key = str(uuid.uuid4())
    body = {
        "invoice_id": inv_id,
        "method": "upi",
        "amount": "5000.00",
        "payment_date": TODAY.isoformat(),
        "note": "first instalment",
    }
    first = ok(staff.post("/payments", json=body, headers={"Idempotency-Key": key}), 201)
    replay = staff.post("/payments", json=body, headers={"Idempotency-Key": key})
    assert replay.status_code in (200, 201) and replay.json()["id"] == first["id"]
    inv = ok(staff.get(f"/invoices/{inv_id}"))
    assert inv["payment_state"] == "partially_paid" and D(inv["amount_due"]) == total - D("5000")

    over = staff.post(
        "/payments",
        headers={"Idempotency-Key": str(uuid.uuid4())},
        json={**body, "amount": str(total)},
    )
    assert over.status_code == 422 and over.json()["error"]["code"] == "AMOUNT_EXCEEDS_DUE"

    rest = ok(
        staff.post(
            "/payments",
            headers={"Idempotency-Key": str(uuid.uuid4())},
            json={
                **body,
                "amount": str(total - D("5000")),
                "method": "bank_transfer",
                "note": "balance",
            },
        ),
        201,
    )
    assert ok(staff.get(f"/invoices/{inv_id}"))["status"] == "paid"

    assert staff.post(f"/payments/{rest['id']}/void", json={"reason": "x"}).status_code == 403
    ok(admin.post(f"/payments/{rest['id']}/void", json={"reason": "entered against wrong invoice"}))
    inv = ok(staff.get(f"/invoices/{inv_id}"))
    assert inv["status"] == "confirmed" and D(inv["amount_paid"]) == D("5000.00")

    balance = ok(staff.get(f"/customers/{S['cust_a_id']}/balance"))
    assert json.dumps(balance)  # reconciliation view is served
    summary = ok(staff.get("/reports/summary"))
    assert summary
    portal_payments = ok(S["cust_a"].get("/portal/payments"))["items"]
    assert {p["id"] for p in portal_payments} >= {first["id"], rest["id"]}
    S["payment_a"] = first["id"]


def test_08_discount_appears_automatically_until_limit():
    staff = S["staff"]
    ok(
        staff.put(
            f"/subscriptions/{S['sub_a']}/discount", json={"discount_id": S["discount"]["id"]}
        )
    )
    run_billing(add_months(START, 4))  # periods 3 and 4
    invoices = sub_invoices(staff, S["sub_a"])
    new = invoices[3:]
    assert [D(ok(staff.get(f"/invoices/{i['id']}"))["amount_discount"]) for i in new] == [
        D("1155.00"),
        D("1155.00"),
    ]  # 10% of (9990 + 1560); usage limit 2 now reached
    run_billing(add_months(START, 5))
    last = ok(staff.get(f"/invoices/{sub_invoices(staff, S['sub_a'])[-1]['id']}"))
    assert D(last["amount_discount"]) == D("0.00")  # runs out after 2 uses


# ----------------------------------------------------------------------------- 6. lifecycle


def test_09_pause_resume_renew_close_and_expiry():
    staff = S["staff"]
    paused = ok(staff.post(f"/subscriptions/{S['sub_a']}/pause"))
    assert paused["is_paused"] and "resume" in paused["available_actions"]
    before = len(sub_invoices(staff, S["sub_a"]))
    run_billing(add_months(START, 7))
    assert len(sub_invoices(staff, S["sub_a"])) == before  # not billed while paused
    resumed = ok(staff.post(f"/subscriptions/{S['sub_a']}/resume"))
    assert not resumed["is_paused"]
    old_end = resumed["end_date"]
    renewed = ok(staff.post(f"/subscriptions/{S['sub_a']}/renew"))
    assert renewed["end_date"] > old_end
    events = [e["action"] for e in ok(staff.get(f"/subscriptions/{S['sub_a']}/events"))["items"]]
    assert {"subscription.paused", "subscription.resumed", "subscription.renewed"} <= set(events)

    yearly = ok(
        staff.post(
            "/subscriptions",
            json={
                "customer_id": S["cust_b_id"],
                "plan_id": S["yearly"]["id"],
                "plan_quantity": 1,
                "start_date": START.isoformat(),
                "term_periods": 1,
                "payment_term_id": S["term"]["id"],
            },
        ),
        201,
    )
    ok(staff.post(f"/subscriptions/{yearly['id']}/confirm"))
    early = staff.post(f"/subscriptions/{yearly['id']}/close", json={"reason": "early"})
    assert early.status_code == 409  # plan does not allow early closure

    short = ok(
        staff.post(
            "/subscriptions",
            json={
                "customer_id": S["cust_b_id"],
                "plan_id": S["monthly"]["id"],
                "plan_quantity": 5,
                "start_date": START.isoformat(),
                "term_periods": 1,
                "payment_term_id": S["term"]["id"],
            },
        ),
        201,
    )
    ok(staff.post(f"/subscriptions/{short['id']}/confirm"))
    run_billing(add_months(START, 1) + timedelta(days=1))  # past expiry of the 1-month term
    expired = ok(staff.get(f"/subscriptions/{short['id']}"))
    assert expired["status"] == "closed" and expired["close_reason"] == "expired"
    assert len(sub_invoices(staff, short["id"])) == 1  # its one period was billed first

    closable = ok(staff.post(f"/subscriptions/{S['sub_a']}/close", json={"reason": "downgrade"}))
    assert closable["status"] == "closed" and closable["close_reason"] == "downgrade"
    S["sub_b_yearly"] = yearly["id"]


# ----------------------------------------------------------------------------- 7. autopay


def _autopay_subscription() -> tuple[int, str]:
    staff = S["staff"]
    sub = ok(
        staff.post(
            "/subscriptions",
            json={
                "customer_id": S["cust_a_id"],
                "plan_id": S["monthly"]["id"],
                "plan_quantity": 5,
                "start_date": START.isoformat(),
                "term_periods": 12,
                "payment_term_id": S["term"]["id"],
            },
        ),
        201,
    )
    ok(staff.post(f"/subscriptions/{sub['id']}/confirm"))
    token = f"token_e2e_{RUN}"
    with db().begin() as conn:  # stands in for: customer completed Razorpay authorisation
        mandate_id = conn.execute(
            text("""
            INSERT INTO payment_mandates (customer_id, provider, provider_mandate_id, status,
                method_type, display_hint, max_amount, authorized_at)
            VALUES (:c, 'razorpay', :t, 'active', 'upi', 'UPI - e2***@okbank', 100000, now())
            RETURNING id"""),
            {"c": S["cust_a_id"], "t": token},
        ).scalar()
        conn.execute(
            text("UPDATE subscriptions SET auto_collect = true, mandate_id = :m WHERE id = :s"),
            {"m": mandate_id, "s": sub["id"]},
        )
    S["mandate_id"] = mandate_id
    return sub["id"], token


def _attempt(invoice: dict, order_id: str) -> None:
    with db().begin() as conn:  # stands in for: Razorpay accepted the recurring charge request
        conn.execute(
            text("""
            INSERT INTO payment_attempts (invoice_id, mandate_id, provider, provider_reference,
                idempotency_key, amount, status, attempt_number)
            VALUES (:i, :m, 'razorpay', :o, :k, :a, 'processing', 1)"""),
            {
                "i": invoice["id"],
                "m": S["mandate_id"],
                "o": order_id,
                "k": f"e2e:{order_id}",
                "a": invoice["amount_due"],
            },
        )


def _payment_event(event: str, order_id: str, amount: str, token: str, **extra) -> dict:
    entity = {
        "id": f"pay_{order_id}",
        "entity": "payment",
        "order_id": order_id,
        "amount": int(D(amount) * 100),
        "currency": "INR",
        "method": "upi",
        "token_id": token,
        "created_at": int(time.time()),
        "status": "captured" if event == "payment.captured" else "failed",
        **extra,
    }
    return {
        "entity": "event",
        "event": event,
        "contains": ["payment"],
        "payload": {"payment": {"entity": entity}},
        "created_at": int(time.time()),
    }


def test_10_autopay_success_failure_and_webhook_verification():
    staff = S["staff"]
    sub_id, token = _autopay_subscription()
    run_billing(START)
    inv = sub_invoices(staff, sub_id)[0]
    inv = ok(staff.get(f"/invoices/{inv['id']}"))
    assert inv["status"] == "confirmed"  # authorised autopay => confirmed automatically

    ok_order = f"order_ok_{RUN}"
    _attempt(inv, ok_order)
    captured = _payment_event("payment.captured", ok_order, inv["amount_due"], token)
    res = signed_webhook(captured, f"evt_ok_{RUN}")
    assert res.status_code == 200 and res.json() == {"received": 1, "duplicates": 0}
    paid = ok(staff.get(f"/invoices/{inv['id']}"))
    assert paid["status"] == "paid" and paid["collection_status"] == "succeeded"
    assert any(p["provider"] == "razorpay" for p in paid["payments"])
    replay = signed_webhook(captured, f"evt_ok_{RUN}")
    assert replay.json() == {"received": 0, "duplicates": 1}  # provider retry is harmless
    forged = signed_webhook(captured, f"evt_forged_{RUN}", secret="not-the-secret")
    assert forged.status_code == 400 and forged.json()["error"]["code"] == "INVALID_SIGNATURE"

    run_billing(add_months(START, 1))
    second = ok(staff.get(f"/invoices/{sub_invoices(staff, sub_id)[1]['id']}"))
    assert second["status"] == "confirmed"
    fail_order = f"order_fail_{RUN}"
    _attempt(second, fail_order)
    failed = _payment_event(
        "payment.failed",
        fail_order,
        second["amount_due"],
        token,
        error_code="BAD_REQUEST_ERROR",
        error_description="Payment failed due to insufficient funds",
    )
    assert signed_webhook(failed, f"evt_fail_{RUN}").status_code == 200
    still_open = ok(staff.get(f"/invoices/{second['id']}"))
    assert still_open["status"] == "confirmed" and still_open["collection_status"] == "failed"
    attempts = ok(staff.get(f"/invoices/{second['id']}/payment-attempts"))
    items = attempts["items"] if isinstance(attempts, dict) else attempts
    assert items[0]["status"] == "failed" and items[0]["next_retry_at"]  # controlled retry
    assert "insufficient funds" in (items[0]["failure_message"] or "")
    S["autopay_inv"] = second["id"]


# ----------------------------------------------------------------------------- 8. isolation


def test_11_customer_data_isolation():
    a, b = S["cust_a"], S["cust_b"]
    a_inv = S["inv_ids"][0]
    assert b.get(f"/portal/subscriptions/{S['sub_a']}").status_code == 404
    assert b.get(f"/portal/invoices/{a_inv}").status_code == 404
    assert b.post(f"/portal/subscriptions/{S['sub_a']}/renew").status_code == 404
    b_payments = ok(b.get("/portal/payments"))["items"]
    assert S["payment_a"] not in {p["id"] for p in b_payments}
    b_subs = {s["id"] for s in ok(b.get("/portal/subscriptions"))["items"]}
    assert S["sub_a"] not in b_subs and S["sub_b_yearly"] in b_subs
    assert a.get(f"/portal/invoices/{a_inv}").status_code == 200
    assert a.get(f"/invoices/{a_inv}").status_code == 403  # staff API closed to customers
    assert b.get("/portal/payment-methods").status_code in (200, 503)


def test_12_prepare_worker_check():
    """Create a subscription that is due today but has NOT been billed; the worker must bill it."""
    staff = S["staff"]
    sub = ok(
        staff.post(
            "/subscriptions",
            json={
                "customer_id": S["cust_b_id"],
                "plan_id": S["monthly"]["id"],
                "plan_quantity": 5,
                "start_date": TODAY.isoformat(),
                "term_periods": 3,
                "payment_term_id": S["term"]["id"],
            },
        ),
        201,
    )
    active = ok(staff.post(f"/subscriptions/{sub['id']}/confirm"))
    assert active["status"] == "active" and sub_invoices(staff, sub["id"]) == []
    STATE_FILE.write_text(json.dumps({"worker_sub": sub["id"]}))


def test_worker_billed_due_subscription():
    """Run after starting `python -m app.worker` separately (see run_e2e.sh)."""
    state = json.loads(STATE_FILE.read_text())
    admin = client()
    login(admin, *ADMIN)
    invoices = sub_invoices(admin, state["worker_sub"])
    assert len(invoices) == 1 and invoices[0]["period_start"] == TODAY.isoformat()
    runs = ok(admin.get("/billing/runs"))["items"]
    assert runs[0]["trigger"] == "scheduled" and runs[0]["status"] == "succeeded"
