# Backend API contract & ownership

Source of truth for Claude 1 (core backend), Claude 2 (business backend) and Claude 3 (frontend).
The live schema is `GET /openapi.json` on a running backend; this file states intent, owners and
status. **Status:** ✅ implemented · 🔜 planned (owner is building it). Call only ✅ endpoints;
show 🔜 features as "not available yet".

## Conventions (all endpoints)

- Base path `/api/v1`. JSON only. Auth = HTTP-only cookie `bl_session` (send `credentials: "include"`).
- Roles: **A** admin · **S** staff · **C** customer (portal). Wrong role → 403; not signed in → 401.
- Money: decimal **strings** (`"1560.00"`), never floats. Rates: `"18.000"`. Dates `YYYY-MM-DD`.
- Lists: `?page=1&page_size=25` (max 100) → `{items, total, page, page_size}`.
- Errors: `{"error": {"code", "message", "details"}}`. Codes: `VALIDATION_ERROR` 422,
  `UNAUTHENTICATED` 401, `INVALID_CREDENTIALS` 401, `FORBIDDEN` 403, `NOT_FOUND` 404,
  `INVALID_STATE` 409, `DUPLICATE` 409, `BILLING_RUN_IN_PROGRESS` 409, `AMOUNT_EXCEEDS_DUE` 422,
  `RATE_LIMITED` 429, `PROVIDER_NOT_CONFIGURED` 503.
- Portal responses use the same shapes as staff responses (incl. `available_actions`).
- Portal endpoints never accept a `customer_id`; the customer comes from the session. Another
  customer's record → 404.
- Subscription and invoice responses carry `available_actions: string[]`, computed server-side for
  the current user. The UI shows buttons only for listed actions.
- Numbers: subscriptions `SUB-000001`, invoices `INV/2026/000001` (gapless, assigned at confirm),
  payments `PAY-000001`.

## Endpoints

### Auth & users — Claude 1
| Status | Method & path | Role | Body → Response |
|---|---|---|---|
| ✅ | POST `/auth/signup` | public | `{email, full_name, password}` → 201 `Me` (always role customer) |
| ✅ | POST `/auth/login` | public | `{email, password}` → `Me` |
| ✅ | POST `/auth/logout` | any | → 204 |
| ✅ | GET `/auth/me` | any | → `Me {id, email, full_name, role, is_active, created_at, customer_id}` |
| 🔜 | POST `/auth/password/forgot` | public | `{email}` → 202 always (no account enumeration) |
| 🔜 | POST `/auth/password/reset` | public | `{token, password}` → 204 |
| 🔜 | POST `/auth/invite/accept` | public | `{token, password}` → `Me` |
| 🔜 | POST `/auth/password/change` | any | `{current_password, new_password}` → 204 |
| ✅ | GET `/users?role=` | A | → Page[`User`] |
| ✅ | POST `/users/staff` | A | `{email, full_name, password}` → 201 `User` |
| ✅ | PATCH `/users/{id}` | A | `{full_name?, is_active?}` → `User` |
| 🔜 | POST `/customers/{id}/portal-invite` | A,S | → 202 (emails a set-password link) |

Password rule: more than 8 chars, an uppercase letter, a lowercase letter and a special character.

### Customers, catalog, discount rules — Claude 2
| Status | Method & path | Role | Notes |
|---|---|---|---|
| 🔜 | GET/POST `/customers`, GET/PATCH `/customers/{id}` | A,S | `?q&is_active` |
| 🔜 | GET `/customers/{id}/balance` | A,S | outstanding / overdue totals |
| 🔜 | GET/POST/PATCH `/taxes` | read A,S · write A | `{id, name, rate, is_active}` |
| 🔜 | GET/POST/PATCH `/payment-terms` | read A,S · write A | `{id, name, due_days, is_active}` |
| 🔜 | GET/POST `/products`, GET/PATCH `/products/{id}` | read A,S · write A | product + `variants[]` |
| 🔜 | POST `/products/{id}/variants`, PATCH `/products/{id}/variants/{vid}` | A | `{attribute, value, extra_price}` |
| 🔜 | GET/POST `/plans`, GET/PATCH `/plans/{id}` | read A,S · write A | `?available_on=` |
| 🔜 | GET/POST `/discounts`, GET/PATCH `/discounts/{id}` | read A,S · write A | `usage_count` is read-only |

### Quotations & subscriptions — Claude 1
| Status | Method & path | Role | Notes |
|---|---|---|---|
| 🔜 | GET/POST `/quotation-templates`, GET/PATCH `/quotation-templates/{id}` | A,S | plan, plan_quantity, term_periods, validity_days, lines |
| ✅ | POST `/pricing/preview` | A,S | `{plan_id, plan_quantity, lines[], discount_id?}` → server totals |
| ✅ | GET `/subscriptions?status&customer_id&plan_id&q&expired` | A,S | Page[`SubscriptionListItem`] |
| ✅ | POST `/subscriptions` | A,S | `{customer_id, plan_id, plan_quantity, start_date, term_periods, payment_term_id, template_id?, discount_id?, notes?, lines:[{product_id, variant_id?, quantity, unit_price?}]}` → Draft |
| ✅ | GET `/subscriptions/{id}` | A,S | `Subscription` (below) |
| ✅ | PATCH `/subscriptions/{id}` | A,S | Draft/Quotation only; `lines` replaces all lines |
| ✅ | POST `/subscriptions/{id}/send-quotation \| confirm \| pause \| resume \| renew \| close` | A,S | close: `{reason?}` |
| ✅ | PUT `/subscriptions/{id}/discount` | A,S | `{discount_id: int \| null}` (one per subscription) |
| ✅ | POST `/subscriptions/{id}/bill-now` | A,S | bills all due periods; idempotent |
| ✅ | GET `/subscriptions/{id}/events` | A,S | Page[`{id, action, actor_type, actor_name, data, created_at}`], newest first |
| ✅ | GET `/subscriptions/{id}/invoices` | A,S | |

`Subscription`: `{id, number, status, customer{id,name,email}, plan{id,name,price,billing_period,
min_quantity,auto_close,closable,pausable,renewable}, payment_term{id,name,due_days},
discount{id,name}|null, start_date, term_periods, end_date (inclusive expiry),
quotation_valid_until, next_invoice_date, is_paused, paused_at, is_expired, closed_at,
close_reason, amount_untaxed, amount_discount, amount_tax, amount_total (per period),
lines[{id, line_type: plan|product, product_id, variant_id, description, quantity, unit_price,
tax{id,name,rate}|null, subtotal, discount_amount, tax_amount, total}],
last_invoice{id,number,status,amount_total,invoice_date}|null, auto_collect, available_actions,
created_at}`

Lifecycle: `draft → quotation → confirmed → active → closed`. Confirmed becomes Active
automatically on `start_date`. Pause is a flag on Active (`is_paused`). Expiry is a duration
(`term_periods`). With `plan.auto_close`, the subscription closes after `end_date`; otherwise it
stays Active with `is_expired=true` and is not billed until renewed or closed.

### Invoices & billing — Claude 1
| Status | Method & path | Role | Notes |
|---|---|---|---|
| ✅ | GET `/invoices?status&customer_id&subscription_id&overdue&date_from&date_to&q&sort` | A,S | sort: created_at, number, invoice_date, due_date, amount_total, amount_due |
| ✅ | GET `/invoices/{id}` | A,S | lines, payments, attempts summary |
| ✅ | POST `/invoices/{id}/confirm` | A,S | assigns number and due date |
| ✅ | POST `/invoices/bulk-confirm` | A,S | `{invoice_ids}` → `{confirmed[], errors[]}` |
| ✅ | POST `/invoices/{id}/cancel` | A,S | `{reason, reissue: bool}`; only if nothing paid |
| ✅ | POST `/invoices/{id}/send` | A,S | queues email |
| ✅ | POST `/billing/runs` | A | `{as_of?}` → `BillingRun`; 409 if one is running |
| ✅ | GET `/billing/runs`, GET `/billing/runs/{id}` | A,S | execution history + per-subscription items |

`Invoice`: `{id, number, status: draft|confirmed|paid|cancelled, payment_state:
unpaid|partially_paid|paid, is_overdue, days_overdue, collection_status:
none|pending|failed|succeeded, subscription{id,number}, customer_id, bill_to_name, bill_to_email,
bill_to_address, period_start, period_end, invoice_date, due_date, currency, discount_name,
amount_untaxed, amount_discount, amount_tax, amount_total, amount_paid, amount_due, sent_at,
sent_count, cancel_reason, replaces_invoice_id, lines[], payments[], available_actions}`

### Payments — Claude 2 (ledger + manual) / Claude 1 (webhooks, jobs)
| Status | Method & path | Role | Notes |
|---|---|---|---|
| 🔜 | GET `/payments?invoice_id&customer_id&method&status&date_from&date_to` | A,S | |
| 🔜 | POST `/payments` | A,S | header `Idempotency-Key: <uuid>` required; `{invoice_id, method, amount, payment_date, note?}` |
| 🔜 | POST `/payments/{id}/void` | A | `{reason}` |
| 🔜 | GET `/invoices/{id}/payment-attempts` | A,S | Claude 2 |
| 🔜 | POST `/invoices/{id}/collect` | A,S | charge via active mandate (Claude 2) |
| 🔜 | GET `/mandates?customer_id` | A,S | Claude 2 |
| 🔜 | POST `/webhooks/payments/{provider}` | provider | signature-verified; Claude 1 |

Methods: `cash, bank_transfer, card, upi, cheque, other`. Generating an invoice never counts as
payment: money exists only as a `posted` Payment.

### Reports — Claude 2
| Status | Method & path | Role |
|---|---|---|
| 🔜 | GET `/reports/summary?date_from&date_to&plan_id&customer_id` | A,S |
| 🔜 | GET `/reports/overdue-invoices` | A,S |
| 🔜 | GET `/reports/revenue?date_from&date_to&granularity=day\|month` | A,S |
| 🔜 | GET `/reports/payments-by-method?date_from&date_to` | A,S |
| 🔜 | GET `/reports/subscriptions-by-status` | A,S |

### Portal (customer, session-scoped)
| Status | Method & path | Owner |
|---|---|---|
| 🔜 | GET `/portal/summary` | Claude 1 |
| 🔜 | GET `/portal/subscriptions`, GET `/portal/subscriptions/{id}` | Claude 1 |
| 🔜 | POST `/portal/subscriptions/{id}/accept \| pause \| resume \| renew \| close` | Claude 1 |
| 🔜 | GET `/portal/invoices`, GET `/portal/invoices/{id}` | Claude 1 |
| 🔜 | GET/PATCH `/portal/profile` | Claude 1 |
| 🔜 | GET `/portal/payments` | Claude 2 |
| 🔜 | GET/POST `/portal/payment-methods`, DELETE `/portal/payment-methods/{id}` | Claude 2 |

## Ownership (one writer per file)

| Area | Owner | Files |
|---|---|---|
| Core, config, security, models, **all migrations** | Claude 1 | `backend/app/{main,config,db,deps,errors,security,money,pagination,models}.py`, `backend/migrations/**`, `backend/pyproject.toml`, `backend/uv.lock`, `backend/tests/conftest.py`, `backend/scripts/seed.py` |
| Auth, users, invites, subscriptions, quotations, pricing, billing engine, invoices, portal (except payments), webhooks, worker | Claude 1 | `app/routers/{auth,users,invites,quotation_templates,pricing,subscriptions,invoices,billing,portal,webhooks}.py`, `app/schemas/{__init__,subscriptions,invoices,billing,portal}.py`, `app/services/{audit,periods,pricing,subscriptions,billing,invoices,numbering,email,tokens}.py`, `app/worker.py` |
| Customers, catalog, discount rules, ledger, manual payments, provider adapters, collections, reports, portal payments | Claude 2 | `app/routers/{customers,taxes,payment_terms,products,plans,discounts,payments,collections,reports,portal_payments}.py`, `app/schemas/{customers,catalog,discounts,payments,reports}.py`, `app/services/{ledger,collections,reports}.py`, `app/providers/**` |
| Frontend | Claude 3 | `frontend/**` only |
| Tests | each owner | `backend/tests/test_<module>.py` for their own modules |

Routers are auto-discovered: a new `app/routers/<name>.py` exposing `router` is mounted
automatically. Nobody edits `main.py` to register routes.

### Interfaces between Claude 1 and Claude 2 (Python, same process)

- **Ledger** (Claude 2, `app/services/ledger.py`), the only writer of `invoices.amount_paid`,
  `paid_at` and the `confirmed ↔ paid` status:
  `record_payment(db, *, invoice_id, method, amount, payment_date, note=None, actor=None,
  idempotency_key=None, provider=None, provider_payment_id=None, payment_attempt_id=None) -> Payment`
  and `void_payment(db, *, payment_id, reason, actor) -> Payment`. Both lock the invoice row
  `FOR UPDATE`, write an audit event and **do not commit** (the caller owns the transaction).
- **Audit** (Claude 1, `app/services/audit.py`): `record(db, action=, entity_type=, entity_id=,
  actor=None, actor_type=None, data=None)`; it is added to the caller's transaction.
- **Pricing and discount application at billing** (Claude 1, `app/services/pricing.py`) uses the
  subscription's single attached discount (approved decision 8). It re-checks validity, usage limit
  and minimums on each invoice date. Usage is consumed atomically with the invoice insert and
  released on cancel. Claude 2's discount API must never write `usage_count`.
- **Providers and collections** (Claude 2): `app/providers.get_adapter(name)` returns an adapter
  with `verify_webhook(headers, raw_body) -> list[ProviderEventIn]` (raises on a bad signature).
  `app/services/collections.py` exposes `handle_event(db, provider_event)`,
  `collect_due(db, now)`, `retry_failed(db, now)` and `reconcile_pending(db, now)`. Claude 1's
  webhook router stores each event once in `provider_events` and dispatches it; Claude 1's worker
  schedules the three jobs.

### Rules

1. Only Claude 1 creates Alembic migrations. Send schema requests to Claude 1.
2. Each session works in its own git worktree and branch:
   Claude 1 `feat/backend-core` (D:\subscribtion-management-system),
   Claude 2 `feat/backend-business` (D:\subscribtion-management-system-business),
   Claude 3 `feat/frontend-app` (D:\subscribtion-management-system-frontend).
3. Test databases are separate, because conftest rebuilds the test schema: Claude 1 `sms_test`,
   Claude 2 `sms_domain_test`. The shared dev DB is `sms_dev` (local cluster 127.0.0.1:55432 until
   the team's PostgreSQL service is configured).
4. Nobody pushes to `main`; merges happen through reviewed PRs.
