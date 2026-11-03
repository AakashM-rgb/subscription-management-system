import { expect, test, type APIRequestContext } from "@playwright/test";

import { admin, expectAccessible } from "./helpers";
import { apiCall, requireDisposableDatabase, signIn, signUp, uid } from "./write-env";

/** Regressions from the UX audit: duplicate submits, stale paging, bad links, and accessibility at phone width. */
requireDisposableDatabase();
test.describe.configure({ mode: "serial", timeout: 90_000 });

const today = () => new Date().toISOString().slice(0, 10);

/** A customer with one confirmed invoice, built through the API. */
async function seedInvoice(request: APIRequestContext) {
  const id = uid();
  const customer = await apiCall<{ id: number }>(request, "post", "/customers", { name: `Audit Buyer ${id}`, email: `audit.${id}@e2e.example.com` });
  const plan = await apiCall<{ id: number }>(request, "post", "/plans", { name: `Audit Plan ${id}`, price: "750.00", billing_period: "monthly", min_quantity: 1, available_from: today(), pausable: true });
  const term = (await apiCall<{ items: { id: number }[] }>(request, "get", "/payment-terms")).items[0];
  const sub = await apiCall<{ id: number }>(request, "post", "/subscriptions", {
    customer_id: customer.id,
    plan_id: plan.id,
    plan_quantity: 2,
    start_date: today(),
    term_periods: 12,
    payment_term_id: term.id,
  });
  await apiCall(request, "post", `/subscriptions/${sub.id}/confirm`);
  await apiCall(request, "post", `/subscriptions/${sub.id}/bill-now`);
  const draft = (await apiCall<{ items: { id: number }[] }>(request, "get", `/invoices?subscription_id=${sub.id}`)).items[0];
  const invoice = await apiCall<{ id: number; status: string }>(request, "post", `/invoices/${draft.id}/confirm`);
  return { customerId: customer.id, subscriptionId: sub.id, invoiceId: invoice.id };
}

test("double-clicking a create button creates exactly one record", async ({ page }) => {
  await signIn(page, admin.email, admin.password, /\/console$/);
  const name = `Double Click ${uid()}`;
  const posts: string[] = [];
  page.on("request", (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/v1/customers" && posts.push(r.url()));

  await page.goto("/console/customers");
  await page.getByRole("button", { name: "New customer" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Contact name").fill(name);
  await dialog.getByLabel("Billing email").fill(`dc.${uid()}@e2e.example.com`);
  await dialog.getByRole("button", { name: "Create customer" }).dblclick();
  await expect(page).toHaveURL(/\/console\/customers\/\d+$/);

  expect(posts).toHaveLength(1);
  const found = await apiCall<{ total: number }>(page.request, "get", `/customers?q=${encodeURIComponent(name)}`);
  expect(found.total).toBe(1);
});

test("a page past the end of a list explains itself and leads back to the data", async ({ page }) => {
  await signIn(page, admin.email, admin.password, /\/console$/);
  await page.goto("/console/customers?page=999");
  await expect(page.getByText("That page doesn't exist")).toBeVisible();
  await expect(page.getByText("No customers yet")).toHaveCount(0);
  await page.getByRole("button", { name: "Go to the last page" }).click();
  await expect(page).not.toHaveURL(/page=999/);
  await expect(page.getByRole("navigation", { name: "Pagination" })).toBeVisible();
  await expect(page.getByRole("row").nth(1)).toBeVisible();
});

test("a malformed or unknown record link says not found", async ({ page }) => {
  await signIn(page, admin.email, admin.password, /\/console$/);
  for (const path of ["/console/invoices/not-a-number", "/console/customers/999999999", "/console/subscriptions/abc"]) {
    await page.goto(path);
    await expect(page.getByText("Not found", { exact: true }), path).toBeVisible();
    await expect(page.getByText("Something went wrong"), path).toHaveCount(0);
  }
});

test("invoice, subscription and list pages are accessible on desktop and phone", async ({ page }) => {
  await signIn(page, admin.email, admin.password, /\/console$/);
  const ids = await seedInvoice(page.request);
  const pages = [`/console/invoices/${ids.invoiceId}`, `/console/subscriptions/${ids.subscriptionId}`, "/console/customers", "/console/invoices", `/console/customers/${ids.customerId}`];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectAccessible(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${viewport.width}px scrolls sideways`).toBeLessThanOrEqual(1);
    }
  }
});

test("scrolling tables can be reached with the keyboard on a phone", async ({ page }) => {
  await signIn(page, admin.email, admin.password, /\/console$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/console/customers");
  const region = page.getByRole("region", { name: "Customers table" });
  await expect(region).toBeVisible();
  await region.focus();
  await expect(region).toBeFocused();
  const scrolls = await region.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrolls).toBe(true);
});

/** True fixed widths (no mobile emulation, which silently widens the layout and hides overflow). */
const WIDTHS = [360, 390, 768, 1024];

test("no console page scrolls sideways from phone to laptop widths", async ({ page }) => {
  await signIn(page, admin.email, admin.password, /\/console$/);
  const ids = await seedInvoice(page.request);
  const routes = [
    "/console",
    "/console/customers",
    `/console/customers/${ids.customerId}`, // tabs + tables in a grid: was 780px wide on a phone
    `/console/subscriptions/${ids.subscriptionId}`, // lifecycle stepper: sr-only text leaked 12px
    `/console/invoices/${ids.invoiceId}`,
    "/console/subscriptions/new",
    "/console/reports",
    "/console/mandates",
  ];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of routes) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  }
});

test("the customer portal fits tablet and phone widths", async ({ page }) => {
  await signUp(page, "Tablet Check", `tablet.${uid()}@e2e.example.com`);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/portal", "/portal/subscriptions", "/portal/invoices", "/portal/payments", "/portal/profile"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px scrolls sideways by ${overflow}px (portal nav needs ~914px)`).toBeLessThanOrEqual(1);
    }
  }
});
