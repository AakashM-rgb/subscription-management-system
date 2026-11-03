import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomerMandates } from "@/features/collections/mandates";
import { CollectionPanel } from "@/features/invoices/collection-panel";
import { PaymentMethodsSection } from "@/features/portal/payment-methods";
import { SubscriptionActions } from "@/features/subscriptions/subscription-actions";
import { BillingAutomationPanel } from "@/features/subscriptions/subscription-view";
import { attempt, invoice, mandate, subscription } from "@/test/fixtures";
import { mockApi, renderWithApp } from "@/test/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

describe("collection attempts on an invoice", () => {
  it("shows failed and successful attempts, the failure reason and the next retry", async () => {
    mockApi([
      {
        path: "/invoices/41/payment-attempts",
        // Oldest first, as the API returns them; the panel shows the newest first.
        body: [
          attempt({ id: 1, attempt_number: 1 }),
          attempt({ id: 2, attempt_number: 2, status: "succeeded", failure_code: null, failure_message: null, next_retry_at: null }),
        ],
      },
    ]);
    renderWithApp(<CollectionPanel invoice={invoice({ collection_status: "failed" })} />);

    const list = await screen.findByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Attempt 2");
    expect(items[0]).toHaveTextContent("Succeeded");
    expect(items[1]).toHaveTextContent("Attempt 1");
    expect(items[1]).toHaveTextContent("Failed");
    expect(items[1]).toHaveTextContent("BAD_REQUEST_ERROR: Insufficient funds");
    expect(items[1]).toHaveTextContent(/Retry scheduled/);
    expect(screen.getByText("Payment failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry now/ })).toBeInTheDocument();
  });

  it("does not claim a payment until the provider confirms it", async () => {
    const { calls } = mockApi([
      { path: "/invoices/41/payment-attempts", body: [] },
      { method: "POST", path: "/invoices/41/collect", status: 201, body: attempt({ status: "processing", failure_code: null, failure_message: null, next_retry_at: null }) },
    ]);
    renderWithApp(<CollectionPanel invoice={invoice()} />);
    await screen.findByText("No automatic attempts");
    await userEvent.click(screen.getByRole("button", { name: /Collect now/ }));
    await userEvent.click(screen.getByRole("button", { name: "Charge now" }));
    expect(await screen.findByText(/Collection started — the result arrives/)).toBeInTheDocument();
    expect(screen.queryByText("Payment collected")).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path === "/invoices/41/collect")).toBe(true);
  });

  it("reports an immediately declined charge as declined, with the next retry", async () => {
    mockApi([
      { path: "/invoices/41/payment-attempts", body: [] },
      { method: "POST", path: "/invoices/41/collect", status: 201, body: attempt({ failure_message: "Card declined by issuer" }) },
    ]);
    renderWithApp(<CollectionPanel invoice={invoice()} />);
    await screen.findByText("No automatic attempts");
    await userEvent.click(screen.getByRole("button", { name: /Collect now/ }));
    await userEvent.click(screen.getByRole("button", { name: "Charge now" }));
    expect(await screen.findByText(/The charge was declined: Card declined by issuer\. Next automatic retry/)).toBeInTheDocument();
    expect(screen.queryByText(/Collection started/)).not.toBeInTheDocument();
    expect(screen.queryByText("Payment collected")).not.toBeInTheDocument();
  });

  it("explains a refused collection (no active mandate) without charging", async () => {
    mockApi([
      { path: "/invoices/41/payment-attempts", body: [] },
      { method: "POST", path: "/invoices/41/collect", status: 409, body: { error: { code: "INVALID_STATE", message: "Customer has no active mandate" } } },
    ]);
    renderWithApp(<CollectionPanel invoice={invoice()} />);
    await screen.findByText("No automatic attempts");
    await userEvent.click(screen.getByRole("button", { name: /Collect now/ }));
    await userEvent.click(screen.getByRole("button", { name: "Charge now" }));
    expect(await screen.findByText("Customer has no active mandate")).toBeInTheDocument();
    // The dialog stays open so nothing looks like it went through.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("shows a provider message on an unfinished attempt as pending, not as a failure", async () => {
    mockApi([{ path: "/invoices/41/payment-attempts", body: [attempt({ status: "processing", failure_code: null, failure_message: "Card declined by issuer", next_retry_at: null })] }]);
    renderWithApp(<CollectionPanel invoice={invoice({ collection_status: "pending" })} />);
    expect(await screen.findByText(/Awaiting final confirmation from Razorpay\. Last message: Card declined by issuer/)).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.queryByText("Payment failed")).not.toBeInTheDocument();
  });

  it("refreshes the attempts when the invoice moves from pending to collected, so they never disagree", async () => {
    let served = 0;
    const responses = [
      [attempt({ status: "processing", failure_code: null, failure_message: null, next_retry_at: null })],
      [attempt({ status: "succeeded", failure_code: null, failure_message: null, next_retry_at: null })],
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(responses[Math.min(served++, 1)]), { status: 200, headers: { "Content-Type": "application/json" } })),
    );
    const { rerenderApp } = renderWithApp(<CollectionPanel invoice={invoice({ collection_status: "pending" })} />);
    expect(await screen.findByText("Processing")).toBeInTheDocument();
    // The page's own invoice query (polling) now reports the collection as succeeded.
    rerenderApp(<CollectionPanel invoice={invoice({ status: "paid", collection_status: "succeeded", payment_state: "paid" })} />);
    expect(await screen.findByText("Succeeded")).toBeInTheDocument();
    expect(screen.queryByText("Processing")).not.toBeInTheDocument();
  });

  it("offers no manual collection while one is already in progress", async () => {
    mockApi([{ path: "/invoices/41/payment-attempts", body: [attempt({ status: "processing", failure_code: null, failure_message: null, next_retry_at: null })] }]);
    renderWithApp(<CollectionPanel invoice={invoice({ collection_status: "pending" })} />);
    expect(await screen.findByText("Collection pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Collect now|Retry now/ })).not.toBeInTheDocument();
  });
});

describe("autopay mandates (staff view)", () => {
  it("lists active, awaiting-bank, revoked and failed mandates", async () => {
    mockApi([
      {
        path: "/mandates",
        body: {
          items: [
            mandate(),
            mandate({ id: 4, status: "pending", method_type: "upi", display_hint: "UPI asha@okbank", authorized_at: null }),
            mandate({ id: 5, status: "cancelled", display_hint: "Mastercard **** 1111", cancelled_at: "2026-10-20T06:30:00Z" }),
            mandate({ id: 6, status: "failed", display_hint: "Visa **** 0002", authorized_at: null }),
          ],
          total: 4,
          page: 1,
          page_size: 20,
        },
      },
    ]);
    renderWithApp(<CustomerMandates customerId={7} />);
    const rows = await screen.findAllByRole("row");
    const text = rows.map((r) => r.textContent ?? "");
    expect(text.find((t) => t.includes("Visa **** 4242"))).toContain("Active");
    expect(text.find((t) => t.includes("UPI asha@okbank"))).toMatch(/Awaiting bank.*Not yet/);
    expect(text.find((t) => t.includes("Mastercard **** 1111"))).toMatch(/Revoked.*20 Oct 2026/);
    expect(text.find((t) => t.includes("Visa **** 0002"))).toContain("Failed");
  });
});

describe("billing automation panel", () => {
  const href = (id: number) => `/console/invoices/${id}`;

  it("shows frequency, next billing date, expiry and last invoice for an active subscription", () => {
    renderWithApp(<BillingAutomationPanel subscription={subscription()} invoiceHref={href} />);
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText("01 Dec 2026")).toBeInTheDocument();
    expect(screen.getByText("30 Sept 2027")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "INV/2026/000041" })).toHaveAttribute("href", "/console/invoices/41");
    expect(screen.getByText(/Automatic collection: On/)).toBeInTheDocument();
  });

  it("says billing is on hold while paused", () => {
    renderWithApp(<BillingAutomationPanel subscription={subscription({ is_paused: true, paused_at: "2026-11-01T05:00:00Z" })} invoiceHref={href} />);
    expect(screen.getByText("Paused — billing is on hold")).toBeInTheDocument();
    expect(screen.getByText(/Paused since/)).toBeInTheDocument();
  });

  it("tells staff an expired subscription needs renewing", () => {
    renderWithApp(<BillingAutomationPanel subscription={subscription({ is_expired: true })} invoiceHref={href} />);
    expect(screen.getByText("Term ended — renew to continue billing")).toBeInTheDocument();
  });
});

describe("lifecycle buttons follow the backend's available_actions", () => {
  it("shows exactly the allowed staff actions", () => {
    renderWithApp(<SubscriptionActions subscription={subscription({ available_actions: ["pause", "close"] })} area="console" />);
    expect(screen.getByRole("button", { name: /Pause/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Close/ })).toBeInTheDocument();
    for (const name of [/Resume/, /Renew/, /Bill now/, /Confirm/, /Send quotation/, /Edit/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("lets a customer accept a quotation from the portal endpoint", async () => {
    const { calls } = mockApi([
      { method: "POST", path: "/portal/subscriptions/9/accept", body: subscription({ status: "active", available_actions: [] }) },
    ]);
    renderWithApp(<SubscriptionActions subscription={subscription({ status: "quotation", available_actions: ["accept"] })} area="portal" />, "customer");
    await userEvent.click(screen.getByRole("button", { name: /Accept quotation/ }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Accept quotation" }));
    expect(await screen.findByText("Quotation accepted")).toBeInTheDocument();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /portal/subscriptions/9/accept"]);
  });
});

describe("portal autopay", () => {
  it("says autopay is unavailable when the provider is not configured", async () => {
    mockApi([{ path: "/portal/payment-methods", status: 503, body: { error: { code: "PROVIDER_NOT_CONFIGURED", message: "Payment provider is not configured" } } }]);
    renderWithApp(<PaymentMethodsSection />, "customer");
    expect(await screen.findByText("Autopay not available")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add method/ })).not.toBeInTheDocument();
  });

  it("shows saved methods with their real status", async () => {
    mockApi([{ path: "/portal/payment-methods", body: [mandate(), mandate({ id: 4, status: "pending", method_type: "upi", display_hint: "UPI asha@okbank", authorized_at: null })] }]);
    renderWithApp(<PaymentMethodsSection />, "customer");
    expect(await screen.findByText("Visa **** 4242")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for bank confirmation/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });
});
