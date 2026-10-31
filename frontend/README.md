# Brightloop Billing — Frontend

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · shadcn/ui (Radix) · TanStack Query & Table ·
React Hook Form + Zod · Recharts. It talks only to the FastAPI backend described in
`docs/BACKEND_CONTRACT.md` (owners: Claude 1 core, Claude 2 business).

## Run locally

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local   # BACKEND_URL defaults to http://127.0.0.1:8000
npm run dev                          # http://localhost:3000
```

The backend must allow the frontend origin (`ALLOWED_ORIGINS=http://localhost:3000`) for its CSRF
origin check. Browser calls are same-origin (`/api/v1/...`); Next.js rewrites them to `BACKEND_URL`, so
the HTTP-only `bl_session` cookie stays first-party. In production Caddy routes `/api/*` straight to
FastAPI and the rewrite is unused.

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Develop, production build (standalone output), serve |
| `npm run typecheck` · `npm run lint` | `tsc --noEmit` · ESLint (next/core-web-vitals) |
| `npm test` | Vitest unit + component tests (jsdom) |
| `npm run test:e2e` | Playwright against a running stack (see below) |
| `npm run api:types` | Regenerate `src/lib/api/openapi.gen.ts` from the backend's `/openapi.json` |

## Architecture

```
src/
  app/
    (auth)/        login, signup, forgot-password, reset-password, accept-invite (public)
    console/       admin + staff workspace (server layout requires role admin|staff)
    portal/        customer self-service (server layout requires role customer)
  components/      shell, data table, feedback states, form fields, dialogs, charts, ui/ (shadcn)
  features/        domain modules: subscriptions, invoices, payments, catalog, reports, portal…
  lib/
    api/           client.ts (fetch + error envelope), hooks.ts (TanStack Query), types.ts,
                   openapi.gen.ts (generated), contract.ts (compile-time contract check)
    server/        session.ts (authoritative /auth/me check, server only)
    permissions.ts, format.ts, validation.ts, use-list-state.ts
  proxy.ts         optimistic redirects (Next 16 "proxy", formerly middleware)
```

**Security model.** `proxy.ts` redirects signed-out visitors and keeps customers out of `/console`
(and staff out of `/portal`) using the unverified role claim. Each area's server layout then asks the
backend `GET /auth/me` with the forwarded cookie and redirects on mismatch; admin-only pages
(`/console/settings/staff`) re-check on the server. The UI hides actions with `can(role, permission)`,
but the API enforces every rule (403), so the UI is never the security boundary. `next` redirects after
login accept only same-area relative paths.

**Server-driven state.** Lifecycle buttons come from each record's `available_actions` (computed by the
backend for the current role), so the browser never re-implements the subscription or invoice state
machines. Money is never calculated in the browser: quotations show live totals from
`POST /pricing/preview`; amounts stay decimal strings and are only formatted for display.

**Double-billing protection.** Payments send one `Idempotency-Key` UUID per dialog session; confirm
dialogs stay locked while a request runs; invoice generation is idempotent server-side.

**Contract drift.** `src/lib/api/contract.ts` asserts at compile time that every domain type has
exactly the fields of the matching OpenAPI schema. After a backend change run `npm run api:types`; a
drift then fails `tsc` and `next build`.

**Lists** are server-paginated (`page`, `page_size ≤ 100`) with search, filters and sort kept in the URL,
so pages stay fast with thousands of records and filtered views are shareable.

## Screens

| Area | Routes |
|---|---|
| Auth | `/login` `/signup` `/forgot-password` `/reset-password?token=` `/accept-invite?token=` |
| Dashboards | `/console` (admin: finance overview · staff: work queues) · `/portal` (customer) |
| Sales | `/console/customers[/id]` · `/console/quotations` · `/console/subscriptions[/new, /id, /id/edit]` · `/console/quotation-templates[/new, /id]` |
| Billing | `/console/invoices[/id]` (print) · `/console/receivables` (outstanding & overdue) · `/console/payments` · `/console/billing[/id]` (billing runs) |
| Catalog | `/console/products[/id]` (variants) · `/console/plans` · `/console/discounts` |
| Settings | `/console/settings/taxes` · `/console/settings/payment-terms` · `/console/settings/staff` (admin) · `/console/account` |
| Reports | `/console/reports` (summary, revenue, payments by method, subscriptions by status, unapplied payments) |
| Portal | `/portal/quotations` (accept) · `/portal/subscriptions[/id]` (pause/resume/renew/close per plan) · `/portal/invoices[/id]` (print) · `/portal/payments` · `/portal/profile` (details, autopay, password) |

Automation shown on each subscription: billing frequency, next billing date, expiry date, last invoice,
billing history, and the audit timeline (pause, resume, renew, close, invoices). Invoices show payment
state, overdue days, collection status, payment attempts, failures and next retry.

## Tests

- `npm test`: password policy, permissions and redirect safety, API client and error mapping,
  formatting (no time-zone drift), login and signup forms.
- `npm run test:e2e`: set `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` (and `E2E_CHANNEL=chrome`
  to use installed Chrome). The default suite is read-only: route protection, every console page against
  the live API, axe WCAG 2.1 AA checks, URL filters, mobile navigation and sign-out.
  `E2E_ALLOW_WRITES=1` adds flows that create records (signup and portal isolation, staff creation
  and role limits, quotation → subscription → invoice → payment). Use a disposable database only.

## Deploy

`Dockerfile` builds the standalone server (node:24-slim, non-root, healthcheck, port 3000). Compose sets
`BACKEND_URL=http://backend:8000`. Public display settings (`NEXT_PUBLIC_*`) are baked in at build time.
No secrets are needed by the frontend.
