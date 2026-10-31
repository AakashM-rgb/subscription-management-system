import { expect, test } from "@playwright/test";

import { admin, expectAccessible, hasAdmin, login } from "./helpers";

/** Read-only checks: safe to run against a shared environment. */

test.describe("route protection", () => {
  for (const path of ["/console", "/console/invoices", "/console/settings/staff", "/portal", "/portal/invoices"]) {
    test(`signed-out visitor to ${path} is sent to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    });
  }

  test("API calls without a session are rejected by the backend", async ({ request }) => {
    const response = await request.get("/api/v1/invoices");
    expect(response.status()).toBe(401);
  });
});

test.describe("authentication pages @responsive", () => {
  test("login page is accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expectAccessible(page);
  });

  test("signup page shows the password rules", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByText("More than 8 characters")).toBeVisible();
    await expectAccessible(page);
  });

  test("wrong credentials show an error and stay on login", async ({ page }) => {
    await login(page, "nobody@e2e.example.com", "Wrong@Password1");
    await expect(page.locator("[data-slot=alert]")).toContainText(/incorrect|too many/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("reset link without a token explains what to do", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/missing its token/i)).toBeVisible();
  });
});

test.describe("admin console", () => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await login(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/console$/);
  });

  test("every console page loads from the live API", async ({ page }) => {
    const pages: [string, RegExp][] = [
      ["/console", /Good (morning|afternoon|evening)/],
      ["/console/reports", /^Reports$/],
      ["/console/customers", /^Customers$/],
      ["/console/quotations", /^Quotations$/],
      ["/console/subscriptions", /^Subscriptions$/],
      ["/console/quotation-templates", /^Quotation templates$/],
      ["/console/invoices", /^Invoices$/],
      ["/console/receivables", /^Outstanding & overdue$/],
      ["/console/payments", /^Payments$/],
      ["/console/mandates", /^Autopay mandates$/],
      ["/console/billing", /^Billing runs$/],
      ["/console/products", /^Products$/],
      ["/console/plans", /^Plans$/],
      ["/console/discounts", /^Discounts$/],
      ["/console/settings/taxes", /^Taxes$/],
      ["/console/settings/payment-terms", /^Payment terms$/],
      ["/console/settings/staff", /^Staff & users$/],
      ["/console/account", /^Your account$/],
    ];
    for (const [path, heading] of pages) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
      await expect(page.getByText("Something went wrong"), path).toHaveCount(0);
      await expect(page.getByText("Not available yet"), path).toHaveCount(0);
      await expect(page.getByText("You don't have access"), path).toHaveCount(0);
    }
  });

  test("key screens pass automated accessibility checks", async ({ page }) => {
    for (const path of ["/console", "/console/invoices", "/console/subscriptions", "/console/plans", "/console/reports"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectAccessible(page);
    }
  });

  test("filters live in the URL so views can be shared", async ({ page }) => {
    await page.goto("/console/invoices");
    const overdue = page.getByRole("group", { name: "Invoice status" }).getByRole("button", { name: "Overdue" });
    await overdue.click();
    await expect(page).toHaveURL(/status=overdue/);
    await page.reload();
    await expect(overdue).toHaveAttribute("aria-pressed", "true");
  });

  test("an admin is redirected away from the customer portal", async ({ page }) => {
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/console$/);
  });

  test("navigation works on a phone-sized screen @responsive", async ({ page }) => {
    await page.goto("/console");
    const openNav = page.getByRole("button", { name: "Open navigation" });
    if (await openNav.isVisible()) {
      await openNav.click();
      await page.getByRole("link", { name: "Invoices" }).click();
    } else {
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Invoices" }).click();
    }
    await expect(page).toHaveURL(/\/console\/invoices/);
  });

  test("sign out ends the session", async ({ page }) => {
    await page.getByRole("button", { name: /account menu/i }).first().click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/console");
    await expect(page).toHaveURL(/\/login/);
  });
});
