# Razorpay test-mode verification checklist

Goal: prove the autopay path against Razorpay's **test mode** before any real customer is
involved. Everything here uses test keys (`rzp_test_...`). No real money moves in test mode.

**Hard rules**
- Never put a live key (`rzp_live_...`) in any `.env` used for this. `scripts/razorpay_smoke.py`
  refuses live keys; the app itself does not, so check the key prefix by eye.
- Use a throwaway database, never production data.
- Do not use real customer emails or phone numbers.

## 1. Environment

| Variable | Value for this run |
|---|---|
| `RAZORPAY_KEY_ID` | test key id (`rzp_test_...`) from Dashboard (Test mode) → Account & Settings → API keys |
| `RAZORPAY_KEY_SECRET` | the matching test secret |
| `RAZORPAY_WEBHOOK_SECRET` | a secret you choose when creating the webhook (step 2) |
| `PAYMENT_PROVIDER` | `razorpay` |
| `APP_BASE_URL` | the public URL the customer's browser uses |
| `COLLECTION_RETRY_HOURS` | `24,72,168` (leave) |
| `PENDING_TIMEOUT_HOURS` | `72` (leave) |
| `MAX_PENDING_MANDATES` | `3` (leave) |
| `RECONCILE_AFTER_MINUTES` | `15` (use `1` to shorten reconcile checks in step 8) |

Also needed: PostgreSQL migrated to head (`alembic upgrade head`), the API **and the worker**
(`python -m app.worker`) running, and a way for Razorpay to reach `/api/v1/webhooks/payments/razorpay`
(a deployed test host or a tunnel to your machine).

## 2. Razorpay Dashboard (Test mode)
- [ ] Webhook created for `https://<host>/api/v1/webhooks/payments/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Events: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`,
      `token.confirmed`, `token.rejected`, `token.cancelled`, `token.paused`.
- [ ] Recurring payments (cards and/or UPI Autopay) enabled for the account. If a method is not
      enabled for test mode, the authorisation order fails: note it, do not work around it.

## 3. Pre-flight (no customer involved)
- [ ] `uv run python -m scripts.razorpay_smoke` → all `PASS`. It creates a test customer and an
      **unpaid** authorisation order and checks webhook signing. Exit code 0.

## 4. Mandate (customer authorisation) — through the portal
- [ ] A portal customer with a phone number opens Profile → Autopay → Add card (or UPI).
- [ ] Razorpay Checkout opens; complete it with a **test** card / test UPI id from Razorpay's own
      "test card details" documentation (use the documented success values only).
- [ ] The UI shows the method as Active. In the database:
      `select status, provider_mandate_id, method_type, display_hint from payment_mandates order by id desc limit 1;`
      → `active`, `provider_mandate_id` starts with `token_`, a display hint such as `Visa **** NNNN`.
- [ ] `select auto_collect, mandate_id from subscriptions where customer_id = <id>;` → `true` and the mandate id.
- [ ] No card number, CVV or UPI PIN appears anywhere in the database or logs.

## 5. Successful collection
- [ ] Staff creates and confirms a subscription for that customer; billing generates the invoice.
      With an active same-customer mandate within its limit the invoice is auto-confirmed
      (audit `invoice.autopay_confirmed`).
- [ ] Within about 5 minutes the worker starts collection: one `payment_attempts` row,
      `status = processing`, `provider_reference = order_...`.
- [ ] After Razorpay captures: attempt `succeeded`, exactly **one** `payments` row
      (`provider = razorpay`, `provider_payment_id = pay_...`), invoice `paid`,
      `amount_paid = amount_total`. The charged amount equals the invoice amount due.
- [ ] Resend the `payment.captured` webhook from the Dashboard (Webhooks → event → Resend):
      still exactly one payment. Resend `order.paid` for the same payment: still one.

## 6. Failed collection
- [ ] Use a Razorpay test method documented to fail for the recurring charge (or revoke funds in the
      test instrument if offered). Expected: attempt `failed` with `failure_code`/`failure_message`,
      `next_retry_at` about 24h ahead, invoice stays `confirmed`, **no** payment row.
- [ ] An immediate rejection (HTTP 4xx on the charge call) → attempt `failed` at once with
      Razorpay's `error.code`, `next_retry_at` empty.
- [ ] After a failure, staff "Collect now" charges again under a new attempt number
      (`inv<id>-a2`); the in-flight attempt blocks a manual payment on that invoice.

## 7. Revocation and expiry
- [ ] Customer removes the method in the portal → mandate `cancelled`, `auto_collect = false`, and
      Razorpay shows the token cancelled. Billing the next invoice does **not** charge it; staff
      "Collect" returns 409 "no active payment mandate".
- [ ] Revoke from the Razorpay side instead (cancel the token in the Dashboard) → `token.cancelled`
      webhook → mandate `cancelled`, pending retries stop.

## 8. Reconciliation and delayed events
- [ ] Temporarily stop webhook delivery (disable the webhook or block the URL), run a collection,
      wait for `RECONCILE_AFTER_MINUTES`, and confirm the worker settles the attempt by asking
      Razorpay (`GET /orders/{id}/payments`) and posts the payment once.
- [ ] Re-enable the webhook and resend the old events: nothing is duplicated.
- [ ] A charge Razorpay never settles fails as `timed_out` after `PENDING_TIMEOUT_HOURS` with no
      automatic retry.

## 9. Expected `payment.unapplied` entries
- [ ] If anything is captured that cannot be applied (invoice already paid, wrong currency or amount),
      it appears at `GET /reports/unapplied-payments` for a manual refund in the Dashboard. After
      the whole run this list should contain only deliberate test cases.

## 10. Clean-up
- [ ] Cancel the test mandates, delete the webhook (or point it elsewhere), drop the test database,
      rotate the test secret if it was shared.

## What the docs state versus what only this run can confirm

Taken from Razorpay's documentation but **not yet observed live** (verify and tick, or file a bug):
- A repeated order `receipt` is rejected (`400 Duplicate request`) and orders can be listed with a
  `receipt` filter; the adapter relies on this to avoid a double charge after a lost commit.
- Token events (`token.*`) carry `payload.token.entity` and no `customer_id`.
- A UPI registration can report a failed "dummy" payment that still carries a `token_id`.
- `payment.authorized` may arrive before the browser's checkout callback (handled), and the order
  of `token.*` events is not guaranteed (handled by provider timestamps).
- Charging a token needs the customer's email **and** phone.

Known limits: Razorpay offers no idempotency header, so duplicate-charge protection rests on the
receipt rule above plus webhook/ledger idempotency. Mandate expiry dates are not modelled; an
expired token is discovered when a charge is rejected.
