import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { Client } from "pg";

/**
 * Explicit configuration for write-enabled e2e tests. They create real records, so they run only when
 *   E2E_ALLOW_WRITES=1 and
 *   E2E_DATABASE_URL points at a disposable database whose name contains "e2e"
 * (the same database the backend under test uses; it is read here only to fetch emailed links).
 */
export const writeConfig = {
  allowed: process.env.E2E_ALLOW_WRITES === "1",
  databaseUrl: process.env.E2E_DATABASE_URL ?? "",
};

export function databaseName(url: string): string {
  try {
    return new URL(url.replace(/^postgresql\+\w+:/, "postgresql:")).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

export function requireDisposableDatabase() {
  test.skip(!writeConfig.allowed, "Write tests disabled: set E2E_ALLOW_WRITES=1 and E2E_DATABASE_URL (disposable DB only)");
  const name = databaseName(writeConfig.databaseUrl);
  if (!/e2e/i.test(name)) {
    throw new Error(`Refusing to run write tests: E2E_DATABASE_URL database "${name || "(missing)"}" is not a disposable *e2e* database.`);
  }
}

/** Latest emailed link (reset, invite) for an address, read from the backend's email outbox. */
export async function latestEmailLink(to: string, pathPrefix: string): Promise<string> {
  const client = new Client({ connectionString: writeConfig.databaseUrl.replace(/^postgresql\+\w+:/, "postgresql:") });
  await client.connect();
  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await client.query<{ url: string | null }>(
        "SELECT context->>'url' AS url FROM email_outbox WHERE lower(to_email) = lower($1) ORDER BY id DESC LIMIT 5",
        [to],
      );
      const link = result.rows.map((r) => r.url).find((u) => u && new URL(u).pathname === pathPrefix);
      if (link) return link;
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    await client.end();
  }
  throw new Error(`No ${pathPrefix} email found for ${to}`);
}

export const PASSWORD = "E2e!Passw0rd";
export const uid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export async function apiCall<T>(
  request: APIRequestContext,
  method: "get" | "post" | "patch" | "put",
  path: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await request[method](`/api/v1${path}`, { data, headers });
  expect(response.ok(), `${method.toUpperCase()} ${path} → ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

export async function signIn(page: Page, email: string, password: string, expected: RegExp = /\/(console|portal)$/) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password\*?$/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(expected);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: /open account menu/i }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

export async function signUp(page: Page, name: string, email: string, password = PASSWORD) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password\*?$/).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/portal$/);
}

/** Confirms the open confirmation dialog and waits for the toast the backend's answer produces. */
export async function confirmDialog(page: Page, button: string | RegExp, toast: string | RegExp) {
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: button }).click();
  await expect(page.getByText(toast).first()).toBeVisible();
  await expect(dialog).toBeHidden();
}

export async function chooseOption(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option }).first().click();
}
