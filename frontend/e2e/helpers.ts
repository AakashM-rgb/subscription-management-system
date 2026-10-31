import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const admin = {
  email: process.env.E2E_ADMIN_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? "",
};
export const hasAdmin = Boolean(admin.email && admin.password);
export const allowWrites = process.env.E2E_ALLOW_WRITES === "1";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password\*?$/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Fails on serious or critical WCAG 2.x A/AA violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.html.slice(0, 160)).join(" | ")}`), page.url()).toEqual([]);
}

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@e2e.example.com`;
}
