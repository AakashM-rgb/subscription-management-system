import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm, SignupForm } from "@/components/auth/auth-forms";

const replace = vi.fn();
const refresh = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  useSearchParams: () => search,
}));

function respond(status: number, body?: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const me = (role: string) => ({ id: 1, email: "a@b.co", full_name: "Asha Rao", role, is_active: true, created_at: "2026-10-31T00:00:00Z", customer_id: null });

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  search = new URLSearchParams();
});
afterEach(() => vi.unstubAllGlobals());

describe("LoginForm", () => {
  it("validates before calling the API", async () => {
    const fetchFn = respond(200, me("admin"));
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("signs in and goes to the safe destination for the role", async () => {
    search = new URLSearchParams("next=/console/invoices");
    respond(200, me("staff"));
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "staff@brightloop.example.com");
    await userEvent.type(screen.getByLabelText(/^password\*?$/i), "Staff@12345");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/console/invoices"));
  });

  it("never follows an external next= after login", async () => {
    search = new URLSearchParams("next=https://evil.example");
    respond(200, me("customer"));
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "c@b.co");
    await userEvent.type(screen.getByLabelText(/^password\*?$/i), "Secret@1234");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/portal"));
  });

  it("shows a clear message for wrong credentials", async () => {
    respond(401, { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/^password\*?$/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The email or password is incorrect.");
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("SignupForm", () => {
  it("shows the live password checklist and blocks weak passwords", async () => {
    const fetchFn = respond(201, me("customer"));
    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/full name/i), "Asha Rao");
    await userEvent.type(screen.getByLabelText(/^email/i), "asha@example.com");
    await userEvent.type(screen.getByLabelText(/^password\*?$/i), "weakpass");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "weakpass");
    expect(screen.getByText("A lowercase letter")).toHaveTextContent("(met)");
    expect(screen.getByText("An uppercase letter")).toHaveTextContent("(not met)");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/Password needs:/)).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("puts the duplicate-email error on the email field", async () => {
    respond(409, { error: { code: "DUPLICATE", message: "An account with this email already exists" } });
    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/full name/i), "Asha Rao");
    await userEvent.type(screen.getByLabelText(/^email/i), "asha@example.com");
    await userEvent.type(screen.getByLabelText(/^password\*?$/i), "Strong!Pass1");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "Strong!Pass1");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("An account with this email already exists")).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute("aria-invalid", "true");
  });
});
