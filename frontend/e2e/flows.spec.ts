import { expect, test, type APIRequestContext } from "@playwright/test";

import { admin, allowWrites, hasAdmin, login, uniqueEmail } from "./helpers";

/**
 * Critical flows that CREATE records. They run only with E2E_ALLOW_WRITES=1 against a disposable
 * database, never against shared or production data.
 */
test.skip(!allowWrites, "Set E2E_ALLOW_WRITES=1 (disposable database only)");

const PASSWORD = "E2e!Passw0rd";

async function api<T>(request: APIRequestContext, method: "get" | "post", path: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
  const response = await request[method](`/api/v1${path}`, { data, headers });
  expect(response.ok(), `${method.toUpperCase()} ${path} → ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

test("a new customer signs up and only sees the portal", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Customer");
  await page.getByLabel(/^Email/).fill(uniqueEmail("customer"));
  await page.getByLabel(/^Password\*?$/).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("heading", { name: /Welcome, E2E/ })).toBeVisible();

  await page.goto("/console/invoices");
  await expect(page).toHaveURL(/\/portal$/);
  expect((await page.request.get("/api/v1/invoices")).status()).toBe(403);
});

test.describe("internal team", () => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD");

  test("only the admin can add staff; staff cannot manage staff", async ({ page, browser }) => {
    const staffEmail = uniqueEmail("staff");
    await login(page, admin.email, admin.password);
    await page.goto("/console/settings/staff");
    await page.getByRole("button", { name: "Add staff member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill("E2E Staff");
    await dialog.getByLabel("Work email").fill(staffEmail);
    await dialog.getByLabel(/Temporary password/).fill(PASSWORD);
    await dialog.getByRole("button", { name: "Add staff member" }).click();
    await expect(page.getByText(staffEmail)).toBeVisible();

    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await login(staffPage, staffEmail, PASSWORD);
    await expect(staffPage).toHaveURL(/\/console$/);
    await expect(staffPage.getByRole("link", { name: "Staff" })).toHaveCount(0);
    await staffPage.goto("/console/settings/staff");
    await expect(staffPage).toHaveURL(/\/console$/);
    expect((await staffPage.request.post("/api/v1/users/staff", { data: { email: uniqueEmail("x"), full_name: "X", password: PASSWORD } })).status()).toBe(403);
    await staffContext.close();
  });

  test("quotation → subscription → invoice → payment", async ({ page }) => {
    await login(page, admin.email, admin.password);
    const request = page.request;
    const today = new Date().toISOString().slice(0, 10);
    const suffix = Date.now();
    const plan = await api<{ id: number; name: string }>(request, "post", "/plans", {
      name: `E2E Monthly ${suffix}`,
      price: "500.00",
      billing_period: "monthly",
      min_quantity: 1,
      available_from: today,
      renewable: true,
      closable: true,
      pausable: true,
    });
    const customer = await api<{ id: number; name: string }>(request, "post", "/customers", { name: `E2E Buyer ${suffix}`, email: uniqueEmail("buyer") });

    // Build the quotation in the UI, with the live server price preview.
    await page.goto(`/console/subscriptions/new?customer_id=${customer.id}`);
    await page.getByLabel("Plan").click();
    await page.getByRole("option", { name: new RegExp(plan.name) }).click();
    await page.getByLabel("Seats").fill("3");
    await expect(page.getByText("₹1,500.00").first()).toBeVisible();
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/console\/subscriptions\/\d+$/);
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Send quotation" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Send quotation" }).click();
    await expect(page.getByText("Quotation sent")).toBeVisible();

    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm subscription" }).click();
    await expect(page.getByText("Subscription confirmed")).toBeVisible();

    // Billing: a draft invoice is generated from the subscription, never twice for the same period.
    await page.reload();
    const billNow = page.getByRole("button", { name: "Bill now" });
    await expect(billNow).toBeVisible();
    await billNow.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Bill due periods" }).click();
    await expect(page.getByText(/invoice(s)? created/)).toBeVisible();

    await page.getByRole("tab", { name: /Billing history/ }).click();
    await page.getByRole("link", { name: /Draft #\d+/ }).first().click();
    await page.getByRole("button", { name: "Confirm invoice" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm invoice" }).click();
    await expect(page.getByText("Invoice confirmed")).toBeVisible();

    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/Payment PAY-\d+ recorded/)).toBeVisible();
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  });
});
