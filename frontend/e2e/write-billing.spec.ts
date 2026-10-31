import { expect, test, type Browser, type Page } from "@playwright/test";

import { admin } from "./helpers";
import {
  apiCall,
  chooseOption,
  confirmDialog,
  PASSWORD,
  requireDisposableDatabase,
  signIn,
  signUp,
  uid,
} from "./write-env";

requireDisposableDatabase();
test.describe.configure({ mode: "serial", timeout: 120_000 });

interface Ids {
  customerEmail: string;
  customerId: number;
  planName: string;
  planId: number;
  subscriptionId: number;
  subscriptionNumber: string;
  invoiceId: number;
  invoiceNumber: string;
  amountTotal: string;
}
const ids = {} as Ids;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, admin.email, admin.password, /\/console$/);
  return page;
}

test("setup: a portal customer and a monthly plan", async ({ page, browser }) => {
  const id = uid();
  ids.customerEmail = `buyer.${id}@e2e.example.com`;
  await signUp(page, `Priya Buyer ${id}`, ids.customerEmail);
  const me = await apiCall<{ customer_id: number }>(page.request, "get", "/auth/me");
  ids.customerId = me.customer_id;

  const staff = await adminPage(browser);
  ids.planName = `E2E Monthly ${id}`;
  const plan = await apiCall<{ id: number }>(staff.request, "post", "/plans", {
    name: ids.planName,
    price: "1000.00",
    billing_period: "monthly",
    min_quantity: 1,
    available_from: today(),
    pausable: true,
    renewable: true,
    closable: true,
  });
  ids.planId = plan.id;
});

test("staff builds a quotation with live server pricing and sends it", async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto(`/console/subscriptions/new?customer_id=${ids.customerId}`);
  await expect(page.getByRole("combobox", { name: /Customer/ })).toContainText("Priya Buyer");
  await chooseOption(page, /^Plan\*?$/, new RegExp(ids.planName));
  await page.getByLabel(/^Seats/).fill("3");
  // Totals come from POST /pricing/preview, not from browser arithmetic.
  await expect(page.getByText("₹3,000.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/console\/subscriptions\/\d+$/);
  ids.subscriptionId = Number(page.url().split("/").pop());
  const draft = await apiCall<{ number: string; status: string }>(page.request, "get", `/subscriptions/${ids.subscriptionId}`);
  ids.subscriptionNumber = draft.number;
  expect(draft.status).toBe("draft");

  await page.getByRole("button", { name: "Send quotation" }).click();
  await confirmDialog(page, "Send quotation", "Quotation sent");
  await expect(page.locator("[aria-current=step]")).toContainText("Quotation");
});

test("customer reviews and accepts the quotation in the portal", async ({ page }) => {
  await signIn(page, ids.customerEmail, PASSWORD, /\/portal$/);
  await expect(page.getByText("1 quotation waiting for you")).toBeVisible();
  await page.getByRole("link", { name: "Review quotations" }).click();
  await page.getByRole("link", { name: "Review & accept" }).click();
  await expect(page.getByRole("heading", { level: 1, name: ids.subscriptionNumber })).toBeVisible();
  await page.getByRole("button", { name: "Accept quotation" }).click();
  await confirmDialog(page, "Accept quotation", "Quotation accepted");
  // Start date is today, so the backend activates it in the same request.
  await expect(page.locator("[aria-current=step]")).toContainText("Active");
  await expect(page.getByText("Next billing date").first()).toBeVisible();
});

test("billing creates the invoice once; staff confirm, print and see billing history", async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto(`/console/subscriptions/${ids.subscriptionId}`);
  await expect(page.getByText("Billing frequency").first()).toBeVisible();
  await expect(page.getByText("Monthly").first()).toBeVisible();
  await expect(page.getByText("Expiry date").first()).toBeVisible();

  await page.getByRole("button", { name: "Bill now" }).click();
  await confirmDialog(page, "Bill due periods", "1 invoice created");
  // Nothing else is due, so the backend no longer offers "Bill now".
  await expect(page.getByRole("button", { name: "Bill now" })).toHaveCount(0);

  // A full billing run for today must not bill the same period twice.
  await page.goto("/console/billing");
  await page.getByRole("button", { name: "Run billing now" }).click();
  await confirmDialog(page, "Start billing run", /Billing run finished/);
  await expect(page).toHaveURL(/\/console\/billing\/\d+$/);
  await expect(page.getByText("Subscriptions due").first()).toBeVisible();
  const invoices = await apiCall<{ total: number }>(page.request, "get", `/invoices?subscription_id=${ids.subscriptionId}`);
  expect(invoices.total).toBe(1);
  await page.goto(`/console/subscriptions/${ids.subscriptionId}`);

  await page.getByRole("tab", { name: /Billing history/ }).click();
  await page.getByRole("link", { name: /^Draft #\d+$/ }).first().click();
  await expect(page).toHaveURL(/\/console\/invoices\/\d+$/);
  ids.invoiceId = Number(page.url().split("/").pop());
  await expect(page.getByText("Draft invoice", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Confirm invoice" }).click();
  await confirmDialog(page, "Confirm invoice", "Invoice confirmed");
  const invoice = await apiCall<{ number: string; status: string; amount_total: string; payment_state: string }>(
    page.request,
    "get",
    `/invoices/${ids.invoiceId}`,
  );
  expect(invoice.status).toBe("confirmed");
  expect(invoice.payment_state).toBe("unpaid");
  ids.invoiceNumber = invoice.number;
  ids.amountTotal = invoice.amount_total;
  await expect(page.getByRole("heading", { level: 1, name: invoice.number })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __printed: boolean }).__printed = false;
    window.print = () => {
      (window as unknown as { __printed: boolean }).__printed = true;
    };
  });
  await page.getByRole("button", { name: "Print" }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: boolean }).__printed)).toBe(true);

  // Subscription now shows the last invoice and the billing event in its history.
  await page.goto(`/console/subscriptions/${ids.subscriptionId}`);
  await expect(page.getByRole("link", { name: invoice.number }).first()).toBeVisible();
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(page.getByText(/Confirmed|Activated|Accepted/).first()).toBeVisible();
});

test("partial payment, full payment and voiding a payment", async ({ browser }) => {
  const page = await adminPage(browser);
  const total = Number(ids.amountTotal);
  const first = (Math.round((total / 2) * 100) / 100).toFixed(2);

  await page.goto(`/console/invoices/${ids.invoiceId}`);
  await page.getByRole("button", { name: "Record payment" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/^Amount/)).toHaveValue(ids.amountTotal);
  await dialog.getByLabel(/^Amount/).fill(String(total + 1));
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog.getByText(/Cannot exceed the amount due/)).toBeVisible();
  await dialog.getByLabel(/^Amount/).fill(first);
  await dialog.getByLabel(/^Note/).fill("NEFT ref E2E-1");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/Payment PAY-\d+ recorded/)).toBeVisible();
  await expect(page.getByText("Partially paid").first()).toBeVisible();
  let inv = await apiCall<{ payment_state: string; amount_due: string; status: string }>(page.request, "get", `/invoices/${ids.invoiceId}`);
  expect(inv.payment_state).toBe("partially_paid");

  await page.getByRole("button", { name: "Record payment" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/^Amount/)).toHaveValue(inv.amount_due);
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/Payment PAY-\d+ recorded/).first()).toBeVisible();
  inv = await apiCall(page.request, "get", `/invoices/${ids.invoiceId}`);
  expect(inv.status).toBe("paid");
  await page.reload();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

  // Admin voids the second payment: the invoice becomes payable again.
  await page.goto(`/console/payments?status=posted`);
  const row = page.getByRole("row", { name: new RegExp(ids.invoiceNumber.replace(/\//g, "\\/")) }).first();
  await row.getByRole("button", { name: /Void payment/ }).click();
  await page.getByRole("alertdialog").getByLabel(/Reason/).fill("Cheque bounced (e2e)");
  await confirmDialog(page, "Void payment", /voided; the invoice is open again/);
  inv = await apiCall(page.request, "get", `/invoices/${ids.invoiceId}`);
  expect(inv.status).toBe("confirmed");
  expect(inv.payment_state).toBe("partially_paid");
});

test("next-period invoice can be cancelled and re-issued without double billing", async ({ browser }) => {
  const page = await adminPage(browser);
  // The UI only allows billing up to today; a future as_of is set through the API to reach the next period.
  const run = await apiCall<{ id: number; invoices_created: number; status: string }>(page.request, "post", "/billing/runs", { as_of: addDays(32) });
  expect(run.invoices_created).toBeGreaterThanOrEqual(1);
  await page.goto(`/console/billing/${run.id}`);
  await expect(page.getByRole("heading", { level: 1, name: `Billing run #${run.id}` })).toBeVisible();
  await expect(page.getByText("Invoices created").first()).toBeVisible();

  const drafts = await apiCall<{ items: { id: number }[] }>(page.request, "get", `/invoices?subscription_id=${ids.subscriptionId}&status=draft`);
  const draftId = drafts.items[0].id;
  await page.goto(`/console/invoices/${draftId}`);
  await page.getByRole("button", { name: "Cancel invoice" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Cancel invoice" })).toBeDisabled();
  await dialog.getByLabel(/Reason/).fill("Wrong seat count (e2e)");
  await dialog.getByLabel(/Re-issue a corrected draft/).check();
  await confirmDialog(page, "Cancel & re-issue", "Invoice cancelled and re-issued");
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();

  const after = await apiCall<{ items: { id: number; status: string; replaces_invoice_id?: number }[] }>(
    page.request,
    "get",
    `/invoices?subscription_id=${ids.subscriptionId}&status=draft`,
  );
  expect(after.items.length).toBe(1);
  expect(after.items[0].id).not.toBe(draftId);
});

test("manual collection: no autopay mandate means nothing is charged and nothing is claimed", async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto(`/console/invoices/${ids.invoiceId}`);
  await expect(page.getByRole("heading", { name: "Collection" })).toBeVisible();
  await expect(page.getByText("Manual collection")).toBeVisible();
  await expect(page.getByText("No automatic attempts")).toBeVisible();
  const collect = page.getByRole("button", { name: /Collect now|Retry now/ });
  await collect.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Charge now" }).click();
  // The backend refuses (no active mandate / provider not configured); the UI shows that and no success.
  await expect(page.getByText(/mandate|not configured|not available/i).first()).toBeVisible();
  await expect(page.getByText(/Payment collected/)).toHaveCount(0);
  const inv = await apiCall<{ status: string; collection_status: string }>(page.request, "get", `/invoices/${ids.invoiceId}`);
  expect(inv.status).toBe("confirmed");

  await page.goto(`/console/customers/${ids.customerId}`);
  await page.getByRole("tab", { name: "Autopay" }).click();
  await expect(page.getByText("No autopay mandate")).toBeVisible();
  await page.goto("/console/mandates");
  await expect(page.getByRole("heading", { level: 1, name: "Autopay mandates" })).toBeVisible();
});

test("customer sees their own billing history; another customer sees none of it", async ({ page, browser }) => {
  await signIn(page, ids.customerEmail, PASSWORD, /\/portal$/);
  await page.goto(`/portal/subscriptions/${ids.subscriptionId}`);
  await expect(page.getByRole("heading", { name: "Billing history" })).toBeVisible();
  await expect(page.getByRole("link", { name: ids.invoiceNumber })).toBeVisible();
  await page.getByRole("link", { name: ids.invoiceNumber }).click();
  await expect(page.getByRole("heading", { level: 1, name: ids.invoiceNumber })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
  await page.goto("/portal/payments");
  await expect(page.getByRole("cell", { name: ids.invoiceNumber }).first()).toBeVisible();

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUp(other, "Other Customer", `other.${uid()}@e2e.example.com`);
  expect((await other.request.get(`/api/v1/portal/subscriptions/${ids.subscriptionId}`)).status()).toBe(404);
  expect((await other.request.get(`/api/v1/portal/invoices/${ids.invoiceId}`)).status()).toBe(404);
  await other.goto(`/portal/invoices/${ids.invoiceId}`);
  await expect(other.getByText("Not found", { exact: true })).toBeVisible();
  await other.goto("/portal/subscriptions");
  await expect(other.getByText(ids.subscriptionNumber)).toHaveCount(0);
  await otherCtx.close();
});

test("lifecycle: pause, resume, renew and close with history", async ({ browser }) => {
  const page = await adminPage(browser);
  const sub = await apiCall<{ id: number }>(page.request, "post", "/subscriptions", {
    customer_id: ids.customerId,
    plan_id: ids.planId,
    plan_quantity: 1,
    start_date: today(),
    term_periods: 6,
    payment_term_id: (await apiCall<{ items: { id: number }[] }>(page.request, "get", "/payment-terms")).items[0].id,
  });
  await apiCall(page.request, "post", `/subscriptions/${sub.id}/confirm`);

  await page.goto(`/console/subscriptions/${sub.id}`);
  await page.getByRole("button", { name: "Pause" }).click();
  await confirmDialog(page, "Pause subscription", "Subscription paused");
  await expect(page.getByText("Paused").first()).toBeVisible();
  await expect(page.getByText("Paused — billing is on hold")).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  await confirmDialog(page, "Resume subscription", "Subscription resumed");

  const before = await apiCall<{ end_date: string; available_actions: string[] }>(page.request, "get", `/subscriptions/${sub.id}`);
  if (before.available_actions.includes("renew")) {
    await page.getByRole("button", { name: "Renew" }).click();
    await confirmDialog(page, "Renew subscription", "Subscription renewed");
    const renewed = await apiCall<{ end_date: string }>(page.request, "get", `/subscriptions/${sub.id}`);
    expect(renewed.end_date > before.end_date).toBe(true);
  } else {
    await expect(page.getByRole("button", { name: "Renew" })).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("alertdialog").getByLabel(/Reason/).fill("Moved to yearly (e2e)");
  await confirmDialog(page, "Close subscription", "Subscription closed");
  await expect(page.locator("[aria-current=step]")).toContainText("Closed");
  await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);

  await page.getByRole("tab", { name: /Activity/ }).click();
  for (const label of ["Paused", "Resumed", "Closed"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

// Regression: close reasons up to 200 characters (backend fix 1591bb3 widened close_reason from VARCHAR(24)).
test("closing with a long reason is stored and shown", async ({ browser }) => {
  const page = await adminPage(browser);
  const sub = await apiCall<{ id: number }>(page.request, "post", "/subscriptions", {
    customer_id: ids.customerId,
    plan_id: ids.planId,
    plan_quantity: 1,
    start_date: today(),
    term_periods: 3,
    payment_term_id: (await apiCall<{ items: { id: number }[] }>(page.request, "get", "/payment-terms")).items[0].id,
  });
  await apiCall(page.request, "post", `/subscriptions/${sub.id}/confirm`);
  await page.goto(`/console/subscriptions/${sub.id}`);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const reason = "Customer moved to the yearly enterprise plan after the seat review";
  await page.getByRole("alertdialog").getByLabel(/Reason/).fill(reason);
  await confirmDialog(page, "Close subscription", "Subscription closed");
  await expect(page.getByText(reason)).toBeVisible();
  const closed = await apiCall<{ status: string; close_reason: string }>(page.request, "get", `/subscriptions/${sub.id}`);
  expect(closed).toMatchObject({ status: "closed", close_reason: reason });
});
