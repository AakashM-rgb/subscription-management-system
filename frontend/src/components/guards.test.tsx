import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { ErrorState } from "@/components/feedback";
import { CustomerFormDialog } from "@/features/customers/customer-form";
import { ApiError } from "@/lib/api/client";
import { mockApi, renderWithApp } from "@/test/render";
import { render } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

const customer = { id: 5, user_id: null, name: "Asha", email: "asha@e2e.example.com", phone: null, company_name: null, address: null, tax_id: null, is_active: true, created_at: "2026-11-01T00:00:00Z" };

describe("duplicate submissions", () => {
  it("a double-click on Create sends one request, so one record is created", async () => {
    // The request is still in flight when the second click lands, as with a real double-click.
    const { calls } = mockApi([{ method: "POST", path: "/customers", status: 201, body: customer, delayMs: 150 }]);
    renderWithApp(<CustomerFormDialog open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByLabelText(/^Contact name/), "Asha");
    await userEvent.type(screen.getByLabelText(/^Billing email/), "asha@e2e.example.com");
    // Every submit event, including the dropped one, must be cancelled: otherwise the browser would
    // submit the <form> natively (a GET with all fields in the URL). Checked after React has handled it.
    const cancelled: boolean[] = [];
    const record = (e: Event) => cancelled.push(e.defaultPrevented);
    document.addEventListener("submit", record);
    await userEvent.dblClick(screen.getByRole("button", { name: "Create customer" }));
    await screen.findByText("Customer created");
    document.removeEventListener("submit", record);
    expect(calls.filter((c) => c.method === "POST" && c.path === "/customers")).toHaveLength(1);
    expect(cancelled.length).toBeGreaterThanOrEqual(2);
    expect(cancelled.every(Boolean)).toBe(true);
  });

  it("a double-click on a confirm button runs the action once", async () => {
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
    render(<ConfirmDialog open onOpenChange={() => {}} title="Confirm invoice?" description="x" confirmLabel="Confirm invoice" onConfirm={onConfirm} />);
    await userEvent.dblClick(screen.getByRole("button", { name: "Confirm invoice" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("pagination states", () => {
  const columns: ColumnDef<{ id: number }, unknown>[] = [{ header: "Id", cell: ({ row }) => row.original.id }];

  it("a page past the end says so and offers the last page, instead of 'nothing here yet'", async () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        caption="Customers"
        columns={columns}
        data={{ items: [], total: 89, page: 999, page_size: 25 }}
        isLoading={false}
        pagination={{ page: 999, pageSize: 25, onPageChange }}
        empty={<p>No customers yet</p>}
      />,
    );
    expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
    expect(screen.queryByText("No customers yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to the last page" }));
    expect(onPageChange).toHaveBeenCalledWith(4); // 89 rows at 25 per page
  });

  it("a genuinely empty list still shows the empty state", () => {
    render(
      <DataTable
        caption="Customers"
        columns={columns}
        data={{ items: [], total: 0, page: 1, page_size: 25 }}
        isLoading={false}
        pagination={{ page: 1, pageSize: 25, onPageChange: vi.fn() }}
        empty={<p>No customers yet</p>}
      />,
    );
    expect(screen.getByText("No customers yet")).toBeInTheDocument();
  });

  it("scrollable tables are keyboard-focusable named regions", () => {
    render(
      <DataTable caption="Invoices" columns={columns} data={{ items: [{ id: 1 }], total: 1, page: 1, page_size: 25 }} isLoading={false} />,
    );
    const region = screen.getByRole("region", { name: "Invoices table" });
    expect(region).toHaveAttribute("tabindex", "0");
    // The region is the only scroll container: a second, inner one could not be focused by keyboard.
    const inner = region.querySelector('[data-slot="table-container"]');
    expect(inner).not.toBeNull();
    expect(inner!.className).not.toMatch(/overflow/);
  });
});

describe("error states", () => {
  it("a malformed id is shown as not found, not as a server problem", () => {
    const error = new ApiError(422, "VALIDATION_ERROR", "Request validation failed", [
      { loc: ["path", "invoice_id"], msg: "Input should be a valid integer", type: "int_parsing" },
    ]);
    expect(error.isInvalidPath).toBe(true);
    render(<ErrorState error={error} />);
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("a body validation error is not mistaken for a bad link", () => {
    const error = new ApiError(422, "VALIDATION_ERROR", "Request validation failed", [{ loc: ["body", "email"], msg: "invalid", type: "x" }]);
    expect(error.isInvalidPath).toBe(false);
  });
});
