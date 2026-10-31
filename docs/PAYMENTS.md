# Payments and automatic collection

Operator guide for recording payments and for collecting invoices automatically through a
payment provider (Razorpay). Owner: Claude 2 (`app/services/{ledger,collections}.py`,
`app/providers/**`).

## How money is recorded

- An invoice only ever counts as paid through **posted Payment rows**. Generating or confirming
  an invoice is never a payment.
- `app/services/ledger.py` is the only code that changes `invoices.amount_paid`, `paid_at` and
  the `confirmed ↔ paid` status. It locks the invoice row, so concurrent payments can't exceed
  the amount due.
- **Partial payments** are allowed. **Overpayment** is rejected (`422 AMOUNT_EXCEEDS_DUE`).
  Draft, cancelled and fully paid invoices take no payments (`409 INVALID_STATE`).
- **Manual payments** (cash, bank transfer, card, UPI, cheque, other) need an `Idempotency-Key`
  header. Retrying with the same key returns the original payment.
- **Voiding** is admin-only and keeps the payment on record as `voided`. A paid invoice returns
  to `confirmed` with its balance due again.
- A manual payment is refused while an automatic charge for the same invoice is in flight.
  Otherwise the two together could overpay.
- Every payment and void is written to `audit_events`.

## Automatic collection (autopay)

```
customer: POST /portal/payment-methods      -> pending mandate + checkout payload
browser:  provider checkout (card / UPI)    -> POST /portal/payment-methods/{id}/confirm
          mandate active                     -> attached to the customer's live subscriptions
staff:    confirm invoices (bulk confirm)    -> worker collect_due (every 5 min)
          PaymentAttempt created/processing  -> provider webhook or reconcile_pending
          succeeded -> Payment posted, invoice paid
          failed    -> retried after 24h, 72h, 168h, then left outstanding for staff
```

- Billing creates **draft** invoices. Collection starts only after staff confirm them.
- Only provider references and a display hint (e.g. `Visa **** 4242`) are stored. Card and bank
  details never reach this system.
- Staff can charge on demand with `POST /invoices/{id}/collect` and inspect attempts with
  `GET /invoices/{id}/payment-attempts`.

### Money the provider took but the system could not apply

If a charge succeeds for an invoice that is already paid or cancelled, or for more than is due,
nothing is posted. Instead an audit entry `payment.unapplied` is written and the event is still
treated as processed, so it isn't retried forever. Staff review these at
`GET /reports/unapplied-payments` and refund them in the provider dashboard.

## Configuration (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PAYMENT_PROVIDER` | `razorpay` | Adapter used for new mandates |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | empty | API keys (test keys start with `rzp_test_`) |
| `RAZORPAY_WEBHOOK_SECRET` | empty | Secret set on the webhook in the Razorpay dashboard |
| `COLLECTION_RETRY_HOURS` | `24,72,168` | Delay before each retry of a failed charge |
| `DEFAULT_MANDATE_MAX_AMOUNT` | `100000.00` | Per-charge limit when the customer sets none |
| `RECONCILE_AFTER_MINUTES` | `15` | Ask the provider about attempts quiet for this long |

With any Razorpay value empty, autopay endpoints answer `503 PROVIDER_NOT_CONFIGURED` and
everything else, including manual payments, keeps working.

## Razorpay setup

1. Dashboard → Account & Settings → Webhooks → add
   `https://<api-host>/api/v1/webhooks/payments/razorpay`, set a secret, and put it in
   `RAZORPAY_WEBHOOK_SECRET`.
2. Subscribe to: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`,
   `token.confirmed`, `token.rejected`, `token.cancelled`, `token.paused`.
3. Make sure Recurring Payments (cards and/or UPI Autopay) is enabled on the account.
4. Run the worker (`python -m app.worker`). It schedules `collect_due`, `retry_failed`,
   `reconcile_pending` and webhook re-processing.

Notes from Razorpay's documentation that shape the implementation:

- Authorising a mandate charges the customer INR 1.00, Razorpay's minimum.
- UPI Autopay is INR-only.
- Recurring charges need the customer's email **and phone**, so the portal asks for a phone
  first.
- Razorpay has no idempotency header. Each charge is a new order whose `receipt` is the attempt
  key (`inv<id>-a<n>`), and charges are matched back to attempts by order id.
- UPI charge outcomes can take 24–36 hours. Pending attempts are polled in rotation, so slow
  ones never block newer ones.
- A UPI registration can report a failed "dummy" payment that still carries a token. That counts
  as a successful registration.
- Unfinished authorisations are marked failed after 24 hours.

## Adding another provider

Implement `app.providers.base.PaymentProvider` in `app/providers/<name>.py` and add a factory to
`_BUILTIN` in `app/providers/__init__.py`. The collections service, webhook inbox and API are
provider-independent. Never add a "simulated success" provider outside `tests/`.
