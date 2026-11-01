import { expect, test } from "@playwright/test";

import { admin } from "./helpers";
import { apiCall, PASSWORD, requireDisposableDatabase, signIn, signUp, uid } from "./write-env";

requireDisposableDatabase();

test.describe("role access", () => {
  test("only the admin adds staff; staff work day to day but cannot change catalog or staff", async ({ page, browser }) => {
    const staffEmail = `staff.${uid()}@e2e.example.com`;
    await signIn(page, admin.email, admin.password, /\/console$/);
    await page.goto("/console/settings/staff");
    await page.getByRole("button", { name: "Add staff member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill("Ravi Staff");
    await dialog.getByLabel("Work email").fill(staffEmail);
    await dialog.getByLabel(/Temporary password/).fill(PASSWORD);
    await dialog.getByRole("button", { name: "Add staff member" }).click();
    await expect(page.getByText(staffEmail)).toBeVisible();

    const ctx = await browser.newContext();
    const staff = await ctx.newPage();
    await signIn(staff, staffEmail, PASSWORD, /\/console$/);
    await expect(staff.getByRole("heading", { name: /Good (morning|afternoon|evening), Ravi/ })).toBeVisible();
    await expect(staff.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Staff" })).toHaveCount(0);

    // Admin-only page: redirected on the server; admin-only APIs: 403 from the backend.
    await staff.goto("/console/settings/staff");
    await expect(staff).toHaveURL(/\/console$/);
    expect((await staff.request.post("/api/v1/users/staff", { data: { email: `x.${uid()}@e2e.example.com`, full_name: "X", password: PASSWORD } })).status()).toBe(403);
    expect((await staff.request.post("/api/v1/plans", { data: { name: "X", price: "1", billing_period: "monthly", available_from: "2026-01-01" } })).status()).toBe(403);

    // Catalog is read-only for staff: no create buttons.
    await staff.goto("/console/plans");
    await expect(staff.getByRole("heading", { level: 1, name: "Plans" })).toBeVisible();
    await expect(staff.getByRole("button", { name: "New plan" })).toHaveCount(0);

    // Every page in the staff navigation loads without an access or server error.
    const staffLinks = await staff.getByRole("navigation", { name: "Main" }).getByRole("link").evaluateAll((links) =>
      links.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
    expect(staffLinks).not.toContain("/console/settings/staff");
    for (const href of staffLinks) {
      await staff.goto(href);
      await expect(staff.getByRole("heading", { level: 1 }), href).toBeVisible();
      await expect(staff.getByText("You don't have access"), href).toHaveCount(0);
      await expect(staff.getByText("Something went wrong"), href).toHaveCount(0);
    }

    // Staff can manage customers.
    await staff.goto("/console/customers");
    await staff.getByRole("button", { name: "New customer" }).click();
    const cd = staff.getByRole("dialog");
    await cd.getByLabel("Contact name").fill(`Staff Added ${uid()}`);
    await cd.getByLabel("Billing email").fill(`staffadded.${uid()}@e2e.example.com`);
    await cd.getByRole("button", { name: "Create customer" }).click();
    await expect(staff.getByText("Customer created")).toBeVisible();
    await ctx.close();
  });

  test("customers are kept out of the console and internal APIs", async ({ page }) => {
    await signUp(page, "Portal Only", `portal.${uid()}@e2e.example.com`);
    for (const path of ["/console", "/console/customers", "/console/settings/staff"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/portal$/);
    }
    for (const path of ["/customers", "/invoices", "/subscriptions", "/reports/summary", "/users"]) {
      expect((await page.request.get(`/api/v1${path}`)).status(), path).toBe(403);
    }
  });
});

test.describe("catalog and customer forms (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, admin.email, admin.password, /\/console$/);
  });

  test("tax, payment term, product with variant, plan and discount", async ({ page }) => {
    const id = uid();

    await page.goto("/console/settings/taxes");
    await page.getByRole("button", { name: "New tax" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Name/).fill(`GST 5% ${id}`);
    await dialog.getByLabel(/^Rate/).fill("150");
    await dialog.getByRole("button", { name: "Create tax" }).click();
    await expect(dialog.getByText("Rate cannot exceed 100%")).toBeVisible();
    await dialog.getByLabel(/^Rate/).fill("5");
    await dialog.getByRole("button", { name: "Create tax" }).click();
    await expect(page.getByText("Tax created")).toBeVisible();
    await expect(page.getByLabel("Added just now")).toContainText(`GST 5% ${id}`);

    await page.goto("/console/settings/payment-terms");
    await page.getByRole("button", { name: "New term" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Name/).fill(`Net 45 ${id}`);
    await dialog.getByLabel(/^Due days/).fill("45");
    await dialog.getByRole("button", { name: "Create term" }).click();
    await expect(page.getByText("Payment term created")).toBeVisible();
    await expect(page.getByLabel("Added just now")).toContainText(`Net 45 ${id}`);

    await page.goto("/console/products");
    await page.getByRole("button", { name: "New product" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Product name/).fill(`Helpdesk ${id}`);
    await dialog.getByLabel(/^Sales price/).fill("1000");
    await dialog.getByLabel(/^Cost price/).fill("300");
    await dialog.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByText("Product created")).toBeVisible();
    // A new product opens straight away so variants can be added.
    await expect(page).toHaveURL(/\/console\/products\/\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: `Helpdesk ${id}` })).toBeVisible();
    await page.getByRole("button", { name: "Add variant" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Attribute/).fill("Brand");
    await dialog.getByLabel(/^Value/).fill("Odoo");
    await dialog.getByLabel(/^Extra price/).fill("560");
    await dialog.getByRole("button", { name: "Add variant" }).click();
    await expect(page.getByText("Variant added")).toBeVisible();
    // Base 1,000 + Odoo 560 = 1,560 effective price.
    await expect(page.getByRole("cell", { name: "₹1,560.00" })).toBeVisible();

    await page.goto("/console/plans");
    await page.getByRole("button", { name: "New plan" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Plan name/).fill(`Team Yearly ${id}`);
    await dialog.getByLabel(/^Price per seat/).fill("9000");
    await dialog.getByLabel(/^Billing frequency/).click();
    await page.getByRole("option", { name: "Yearly" }).click();
    await dialog.getByLabel(/^Minimum quantity/).fill("5");
    await dialog.getByLabel("Can be paused").click();
    await dialog.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByText("Plan created")).toBeVisible();
    await expect(page.getByLabel("Added just now")).toContainText(`Team Yearly ${id}`);

    await page.goto("/console/discounts");
    await page.getByRole("button", { name: "New discount" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Name/).fill(`Seats 10% ${id}`);
    await dialog.getByLabel(/^Percentage/).fill("120");
    await dialog.getByLabel(/^Minimum quantity/).fill("10");
    await dialog.getByLabel(/^Usage limit/).fill("3");
    await dialog.getByRole("button", { name: "Create discount" }).click();
    await expect(dialog.getByText("A percentage cannot exceed 100")).toBeVisible();
    await dialog.getByLabel(/^Percentage/).fill("10");
    await dialog.getByRole("button", { name: "Create discount" }).click();
    await expect(page.getByText("Discount created")).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(`Seats 10% ${id}`) });
    await expect(row).toContainText("Min. 10 seats");
    await expect(row).toContainText("0 / 3");
    await expect(row).toContainText("Active");
  });

  test("customer create and edit", async ({ page }) => {
    const id = uid();
    await page.goto("/console/customers");
    await page.getByRole("button", { name: "New customer" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Contact name").fill(`Anil Kumar ${id}`);
    await dialog.getByLabel("Billing email").fill("not-an-email");
    await dialog.getByRole("button", { name: "Create customer" }).click();
    await expect(dialog.getByText("Enter a valid email address")).toBeVisible();
    await dialog.getByLabel("Billing email").fill(`anil.${id}@e2e.example.com`);
    await dialog.getByLabel("Company").fill("Kochi Traders");
    await dialog.getByRole("button", { name: "Create customer" }).click();
    await expect(page.getByText("Customer created")).toBeVisible();
    // A new customer opens straight away.
    await expect(page).toHaveURL(/\/console\/customers\/\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: `Anil Kumar ${id}` })).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Phone").fill("+91 98470 00000");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Customer updated")).toBeVisible();
    await expect(page.getByText("+91 98470 00000")).toBeVisible();

    const customers = await apiCall<{ items: { email: string; phone: string | null }[] }>(page.request, "get", `/customers?q=${id}`);
    expect(customers.items[0].phone).toBe("+91 98470 00000");
  });
});
