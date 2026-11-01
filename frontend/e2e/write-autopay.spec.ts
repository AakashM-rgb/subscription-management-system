import { createHmac } from "node:crypto";

import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import { admin } from "./helpers";
import { apiCall, confirmDialog, PASSWORD, requireDisposableDatabase, signIn, signUp, uid } from "./write-env";

/**
 * Automatic collection end to end, through the backend's real Razorpay adapter, collections, webhook
 * and ledger code. Razorpay itself is replaced at the HTTP boundary by e2e/razorpay-stub.mjs; the
 * backend runs with RAZORPAY_BASE_URL pointing at it and the dummy secrets below.
 *
 *   E2E_RAZORPAY_STUB_URL        e.g. http://127.0.0.1:8199
 *   E2E_RAZORPAY_KEY_SECRET      the backend's RAZORPAY_KEY_SECRET (dummy)
 *   E2E_RAZORPAY_WEBHOOK_SECRET  the backend's RAZORPAY_WEBHOOK_SECRET (dummy)
 *
 * Razorpay Checkout (the hosted card/UPI form) cannot run here, so the test sends what Checkout would
 * return to /portal/payment-methods/{id}/confirm, signed exactly as Razorpay signs it.
 */
requireDisposableDatabase();
const stubUrl = process.env.E2E_RAZORPAY_STUB_URL ?? "";
const keySecret = process.env.E2E_RAZORPAY_KEY_SECRET ?? "";
const webhookSecret = process.env.E2E_RAZORPAY_WEBHOOK_SECRET ?? "";
test.skip(!stubUrl || !keySecret || !webhookSecret, "Set E2E_RAZORPAY_STUB_URL, E2E_RAZORPAY_KEY_SECRET and E2E_RAZORPAY_WEBHOOK_SECRET");
test.describe.configure({ mode: "serial", timeout: 120_000 });

const ids = {} as { email: string; customerId: number; subscriptionId: number; invoiceId: number; invoiceNumber: string; mandateId: number; tokenId: string };
const today = () => new Date().toISOString().slice(0, 10);

async function stub(request: APIRequestContext, control: { tokenStatus?: "confirmed" | "rejected"; chargeMode?: "accept" | "decline" }) {
  const res = await request.post(`${stubUrl}/__control`, { data: control });
  expect(res.ok()).toBeTruthy();
}

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, admin.email, admin.password, /\/console$/);
  return page;
}

/** What Razorpay Checkout hands back after the customer authorises the mandate. */
async function authoriseMandate(customer: APIRequestContext) {
  const setup = await apiCall<{ mandate: { id: number }; checkout: { order_id: string } }>(customer, "post", "/portal/payment-methods", { method_type: "card" });
  const orderId = setup.checkout.order_id;
  const paymentId = `pay_auth_${orderId}`;
  ids.tokenId = `token_${orderId}`; // the stub issues one token per authorisation, like Razorpay
  const signature = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return apiCall<{ id: number; status: string }>(customer, "post", `/portal/payment-methods/${setup.mandate.id}/confirm`, {
    provider_response: { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: signature },
  });
}

/** A signed Razorpay webhook, exactly as Razorpay would deliver it. */
async function webhook(request: APIRequestContext, event: "payment.captured" | "payment.failed", attempt: { provider_reference: string | null; amount: string }) {
  const paise = Math.round(Number(attempt.amount) * 100);
  const body = JSON.stringify({
    entity: "event",
    event,
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: `pay_hook_${uid()}`,
          entity: "payment",
          order_id: attempt.provider_reference,
          amount: paise,
          currency: "INR",
          status: event === "payment.captured" ? "captured" : "failed",
          method: "card",
          token_id: ids.tokenId,
          error_code: event === "payment.failed" ? "BAD_REQUEST_ERROR" : null,
          error_description: event === "payment.failed" ? "Insufficient funds (stub)" : null,
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  });
  const res = await request.post("/api/v1/webhooks/payments/razorpay", {
    data: body,
    headers: {
      "Content-Type": "application/json",
      "X-Razorpay-Signature": createHmac("sha256", webhookSecret).update(body).digest("hex"),
      "X-Razorpay-Event-Id": `evt_${uid()}`,
    },
  });
  expect(res.ok(), `webhook → ${res.status()} ${await res.text()}`).toBeTruthy();
}

test("setup: customer with a phone number and an active subscription", async ({ page, browser }) => {
  ids.email = `autopay.${uid()}@e2e.example.com`;
  await signUp(page, "Arun Autopay", ids.email);
  ids.customerId = (await apiCall<{ customer_id: number }>(page.request, "get", "/auth/me")).customer_id;
  await page.goto("/portal/profile");
  await page.getByLabel("Phone").fill("+919847000001"); // Razorpay needs a contact number
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText(/Profile saved/)).toBeVisible();

  const staff = await adminPage(browser);
  const plan = await apiCall<{ id: number }>(staff.request, "post", "/plans", {
    name: `Autopay Monthly ${uid()}`,
    price: "500.00",
    billing_period: "monthly",
    min_quantity: 1,
    available_from: today(),
  });
  const term = (await apiCall<{ items: { id: number }[] }>(staff.request, "get", "/payment-terms")).items[0];
  const sub = await apiCall<{ id: number }>(staff.request, "post", "/subscriptions", {
    customer_id: ids.customerId,
    plan_id: plan.id,
    plan_quantity: 2,
    start_date: today(),
    term_periods: 12,
    payment_term_id: term.id,
  });
  await apiCall(staff.request, "post", `/subscriptions/${sub.id}/confirm`);
  ids.subscriptionId = sub.id;
});

test("customer authorises card autopay; staff see the active mandate and autopay switched on", async ({ page, browser }) => {
  await stub(page.request, { tokenStatus: "confirmed", chargeMode: "accept" });
  await signIn(page, ids.email, PASSWORD, /\/portal$/);
  const mandate = await authoriseMandate(page.request);
  expect(mandate.status).toBe("active");
  ids.mandateId = mandate.id;

  await page.goto("/portal/profile");
  const methods = page.getByRole("heading", { name: "Autopay" }).locator("xpath=ancestor::*[@data-slot='card']");
  await expect(methods.getByText("Visa **** 4242")).toBeVisible();
  await expect(methods.getByText("Active")).toBeVisible();

  const staff = await adminPage(browser);
  await staff.goto(`/console/customers/${ids.customerId}`);
  await staff.getByRole("tab", { name: "Autopay" }).click();
  await expect(staff.getByRole("row", { name: /Visa \*\*\*\* 4242/ })).toContainText("Active");
  await staff.goto(`/console/subscriptions/${ids.subscriptionId}`);
  await expect(staff.getByText(/Automatic collection: On/)).toBeVisible();
});

test("billing auto-confirms the invoice of an autopay subscription", async ({ browser }) => {
  const staff = await adminPage(browser);
  await staff.goto(`/console/subscriptions/${ids.subscriptionId}`);
  await staff.getByRole("button", { name: "Bill now" }).click();
  await confirmDialog(staff, "Bill due periods", "1 invoice created");
  const list = await apiCall<{ items: { id: number; status: string; number: string | null }[] }>(staff.request, "get", `/invoices?subscription_id=${ids.subscriptionId}`);
  expect(list.items).toHaveLength(1);
  expect(list.items[0].status).toBe("confirmed"); // approved rule: authorised autopay invoices skip the draft step
  ids.invoiceId = list.items[0].id;
  ids.invoiceNumber = list.items[0].number ?? "";
});

test("a declined charge is shown as failed with the reason and the next retry — never as paid", async ({ browser }) => {
  const staff = await adminPage(browser);
  await stub(staff.request, { chargeMode: "accept" });
  await staff.goto(`/console/invoices/${ids.invoiceId}`);
  await staff.getByRole("button", { name: "Collect now" }).click();
  await staff.getByRole("alertdialog").getByRole("button", { name: "Charge now" }).click();
  await expect(staff.getByText(/Collection started — the result arrives/)).toBeVisible();

  // Razorpay reports the outcome asynchronously: the bank declines and a signed webhook arrives.
  const [processing] = await apiCall<{ status: string; provider_reference: string | null; amount: string }[]>(
    staff.request,
    "get",
    `/invoices/${ids.invoiceId}/payment-attempts`,
  );
  expect(processing.status).toBe("processing");
  await webhook(staff.request, "payment.failed", processing);

  await staff.reload();
  await expect(staff.getByText("Payment failed").first()).toBeVisible();
  const attempts = staff.getByRole("heading", { name: "Collection" }).locator("xpath=ancestor::*[@data-slot='card']").getByRole("listitem");
  await expect(attempts.first()).toContainText("Failed");
  await expect(attempts.first()).toContainText("Insufficient funds (stub)");
  const inv = await apiCall<{ status: string; collection_status: string }>(staff.request, "get", `/invoices/${ids.invoiceId}`);
  expect(inv).toMatchObject({ status: "confirmed", collection_status: "failed" });
  const apiAttempts = await apiCall<{ next_retry_at: string | null }[]>(staff.request, "get", `/invoices/${ids.invoiceId}/payment-attempts`);
  if (apiAttempts.at(-1)?.next_retry_at) await expect(attempts.first()).toContainText("Retry scheduled");

  // The customer sees the failure too, and the invoice is not marked paid.
  const customer = await (await browser.newContext()).newPage();
  await signIn(customer, ids.email, PASSWORD, /\/portal$/);
  await customer.goto(`/portal/invoices/${ids.invoiceId}`);
  await expect(customer.getByText("Automatic payment failed")).toBeVisible();
  // Status stays Confirmed (not Paid), and the full amount is still due.
  await expect(customer.locator("header").getByText("Confirmed", { exact: true }).first()).toBeVisible();
  await expect(customer.locator("header").getByText("Paid", { exact: true })).toHaveCount(0);
});

test("retry: pending until the provider confirms, then paid through the ledger", async ({ browser }) => {
  const staff = await adminPage(browser);
  await stub(staff.request, { chargeMode: "accept" });
  await staff.goto(`/console/invoices/${ids.invoiceId}`);
  await staff.getByRole("button", { name: "Retry now" }).click();
  await staff.getByRole("alertdialog").getByRole("button", { name: "Charge now" }).click();
  await expect(staff.getByText(/Collection started — the result arrives/)).toBeVisible();

  await staff.reload();
  await expect(staff.getByText("Collection pending").first()).toBeVisible();
  let inv = await apiCall<{ status: string; collection_status: string }>(staff.request, "get", `/invoices/${ids.invoiceId}`);
  expect(inv.status).toBe("confirmed"); // not paid yet: only the provider's confirmation counts
  await expect(staff.getByRole("button", { name: /Collect now|Retry now/ })).toHaveCount(0);

  const all = await apiCall<{ status: string; provider_reference: string | null; amount: string }[]>(
    staff.request,
    "get",
    `/invoices/${ids.invoiceId}/payment-attempts`,
  );
  const processing = all.find((x) => x.status === "processing");
  expect(processing, "a processing attempt after Retry now").toBeTruthy();
  await webhook(staff.request, "payment.captured", processing!);

  await staff.reload();
  inv = await apiCall(staff.request, "get", `/invoices/${ids.invoiceId}`);
  expect(inv).toMatchObject({ status: "paid", collection_status: "succeeded" });
  await expect(staff.getByText("Collected").first()).toBeVisible();
  const attempts = staff.getByRole("heading", { name: "Collection" }).locator("xpath=ancestor::*[@data-slot='card']").getByRole("listitem");
  await expect(attempts.first()).toContainText("Succeeded");
  await staff.goto(`/console/invoices?status=paid`);
  await expect(staff.getByRole("row", { name: new RegExp(ids.invoiceNumber.replace(/\//g, "\\/")) })).toContainText("Collected");
});

test("customer revokes autopay; staff see it revoked and collection stops", async ({ page, browser }) => {
  await signIn(page, ids.email, PASSWORD, /\/portal$/);
  await page.goto("/portal/profile");
  await page.getByRole("button", { name: /Remove Visa \*\*\*\* 4242/ }).click();
  await confirmDialog(page, "Remove", "Autopay method removed");
  await expect(page.getByText("No saved payment methods.")).toBeVisible();

  const staff = await adminPage(browser);
  await staff.goto(`/console/mandates?customer_id=${ids.customerId}`);
  await expect(staff.getByRole("row", { name: /Visa \*\*\*\* 4242/ })).toContainText("Revoked");
  await staff.goto(`/console/subscriptions/${ids.subscriptionId}`);
  await expect(staff.getByText(/Automatic collection: Off/)).toBeVisible();
});

test("a mandate the bank rejects is shown as failed", async ({ page, browser }) => {
  await stub(page.request, { tokenStatus: "rejected" });
  await signIn(page, ids.email, PASSWORD, /\/portal$/);
  const mandate = await authoriseMandate(page.request);
  expect(mandate.status).toBe("failed");
  await stub(page.request, { tokenStatus: "confirmed" });

  const staff = await adminPage(browser);
  await staff.goto(`/console/mandates?customer_id=${ids.customerId}&status=failed`);
  await expect(staff.getByRole("row", { name: /Visa \*\*\*\* 4242/ }).first()).toContainText("Failed");
});
