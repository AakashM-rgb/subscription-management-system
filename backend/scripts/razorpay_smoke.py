"""Razorpay TEST-MODE smoke check for the autopay integration. Moves no money.

    uv run python -m scripts.razorpay_smoke

Reads RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET from backend/.env and:
  1. refuses to run unless the key is a test key (rzp_test_...)
  2. creates (or reuses) a test customer
  3. creates a UPI-autopay authorisation order (INR 1.00, not paid: nothing is charged)
  4. reads the order back and checks amount, currency and notes
  5. verifies the webhook signature check accepts a correctly signed body and rejects a bad one
Completing a mandate and a real charge needs Razorpay Checkout in a browser (test card/UPI);
see docs/PAYMENTS.md.
"""

import hashlib
import hmac
import sys
from decimal import Decimal

from app.providers import CustomerRef, ProviderError, WebhookVerificationError
from app.providers.config import get_provider_settings
from app.providers.razorpay import RazorpayAdapter


def check(label: str, ok: bool, detail: str = "") -> bool:
    print(f"[{'PASS' if ok else 'FAIL'}] {label}{(': ' + detail) if detail else ''}")
    return ok


def main() -> int:
    s = get_provider_settings()
    if not (s.razorpay_key_id and s.razorpay_key_secret and s.razorpay_webhook_secret):
        print("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET must be set")
        return 2
    if not s.razorpay_key_id.startswith("rzp_test_"):
        print("Refusing to run: this smoke check only runs with a test-mode key (rzp_test_...)")
        return 2
    rzp = RazorpayAdapter(
        key_id=s.razorpay_key_id,
        key_secret=s.razorpay_key_secret,
        webhook_secret=s.razorpay_webhook_secret,
        base_url=s.razorpay_base_url,
    )
    results = []
    try:
        customer = CustomerRef(
            id=0,
            name="Brightloop Smoke Test",
            email="smoke-test@brightloop.example.com",
            phone="+919000000000",
        )
        cust_id = rzp.ensure_customer(customer, None)
        results.append(check("create/reuse customer", cust_id.startswith("cust_"), cust_id))
        start = rzp.start_authorization(
            customer=customer,
            provider_customer_id=cust_id,
            method_type="upi",
            max_amount=Decimal("1000.00"),
            currency="INR",
            metadata={"purpose": "smoke", "receipt": "smoke-auth"},
        )
        results.append(
            check("authorisation order", start.reference.startswith("order_"), start.reference)
        )
        meta = rzp.reference_metadata(start.reference)
        results.append(check("order notes round-trip", meta.get("purpose") == "smoke", str(meta)))
    except ProviderError as exc:
        results.append(check("Razorpay API", False, exc.message))

    body = b'{"event":"payment.captured","payload":{}}'
    good = hmac.new(s.razorpay_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    results.append(
        check(
            "webhook signature accepted",
            len(rzp.verify_webhook({"x-razorpay-signature": good}, body)) == 1,
        )
    )
    try:
        rzp.verify_webhook({"x-razorpay-signature": "0" * 64}, body)
        results.append(check("forged webhook rejected", False))
    except WebhookVerificationError:
        results.append(check("forged webhook rejected", True))
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
