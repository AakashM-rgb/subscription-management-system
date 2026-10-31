import { expect, test } from "@playwright/test";

import { admin } from "./helpers";
import { latestEmailLink, PASSWORD, requireDisposableDatabase, signIn, signOut, signUp, uid } from "./write-env";

requireDisposableDatabase();

test.describe("account lifecycle", () => {
  test("signup → portal → logout → login → forgot password → reset → login with new password", async ({ page }) => {
    const email = `signup.${uid()}@e2e.example.com`;
    await signUp(page, "Meera Nair", email);
    await expect(page.getByRole("heading", { name: "Welcome, Meera" })).toBeVisible();

    await signOut(page);
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/login\?next=%2Fportal/);

    await signIn(page, email, PASSWORD, /\/portal$/);
    await signOut(page);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

    const link = await latestEmailLink(email, "/reset-password");
    const url = new URL(link);
    await page.goto(`${url.pathname}${url.search}`);
    const newPassword = "Reset!Passw0rd2";
    await page.getByLabel(/^New password/).fill(newPassword);
    await page.getByLabel("Confirm password").fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    await expect(page.getByText("Password updated")).toBeVisible();

    // The old password no longer works; the new one does.
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password\*?$/).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("[data-slot=alert]").filter({ hasText: "incorrect" })).toBeVisible();
    await signIn(page, email, newPassword, /\/portal$/);
  });

  test("signup rejects a duplicate email and a weak password", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Dup Check");
    await page.getByLabel(/^Email/).fill(admin.email || "admin@brightloop.example.com");
    await page.getByLabel(/^Password\*?$/).fill("weakpass");
    await page.getByLabel("Confirm password").fill("weakpass");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/Password needs:/)).toBeVisible();

    await page.getByLabel(/^Password\*?$/).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("An account with this email already exists")).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });
});

test("a customer can open every portal page and keep their profile up to date", async ({ page }) => {
  await signUp(page, "Lakshmi Portal", `portalpages.${uid()}@e2e.example.com`);
  const pages: [string, RegExp][] = [
    ["/portal", /^Welcome, Lakshmi$/],
    ["/portal/quotations", /^Quotations$/],
    ["/portal/subscriptions", /^Subscriptions$/],
    ["/portal/invoices", /^Invoices$/],
    ["/portal/payments", /^Payments$/],
    ["/portal/profile", /^Profile$/],
  ];
  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
    await expect(page.getByText("Something went wrong"), path).toHaveCount(0);
    await expect(page.getByText("Not available yet"), path).toHaveCount(0);
  }

  // Profile: email is read-only, details save through PATCH /portal/profile.
  await expect(page.getByLabel("Email")).toBeDisabled();
  await page.getByLabel("Phone").fill("+91 90000 11111");
  await page.getByLabel("Company").fill("Lakshmi Textiles");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText(/Profile saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Phone")).toHaveValue("+91 90000 11111");

  // Autopay: with no payment provider configured the portal says so instead of pretending.
  await expect(page.getByRole("heading", { name: "Autopay" })).toBeVisible();
  await expect(page.getByText(/Autopay not available|No saved payment methods/)).toBeVisible();
});
