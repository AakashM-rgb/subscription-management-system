"use client";

import { CreditCard, Smartphone } from "lucide-react";

import { DataTable, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { TextLink } from "@/components/page";
import { StatusBadge } from "@/components/status-badge";
import { usePaged } from "@/lib/api/hooks";
import type { Mandate } from "@/lib/api/types";
import { formatDate, formatDateTime, formatMoney, humanize } from "@/lib/format";

export function mandateColumns(options: { customerName?: (id: number) => string | null } = {}): ColumnDef<Mandate, unknown>[] {
  const columns: ColumnDef<Mandate, unknown>[] = [
    {
      header: "Method",
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          {row.original.method_type === "upi" ? (
            <Smartphone className="size-4 text-muted-foreground" aria-hidden />
          ) : (
            <CreditCard className="size-4 text-muted-foreground" aria-hidden />
          )}
          <span>
            <span className="block font-medium">{row.original.display_hint ?? humanize(row.original.method_type)}</span>
            <span className="block text-xs text-muted-foreground">{humanize(row.original.provider)}</span>
          </span>
        </span>
      ),
    },
  ];
  if (options.customerName) {
    const name = options.customerName;
    columns.push({
      header: "Customer",
      cell: ({ row }) =>
        row.original.customer_id ? (
          <TextLink href={`/console/customers/${row.original.customer_id}`} className="font-normal text-foreground">
            {name(row.original.customer_id) ?? `Customer #${row.original.customer_id}`}
          </TextLink>
        ) : (
          "—"
        ),
    });
  }
  columns.push(
    { header: "Status", cell: ({ row }) => <StatusBadge kind="mandate" value={row.original.status} /> },
    {
      header: "Authorised",
      cell: ({ row }) => (row.original.authorized_at ? formatDate(row.original.authorized_at) : <span className="text-muted-foreground">Not yet</span>),
    },
    {
      header: "Revoked",
      cell: ({ row }) => (row.original.cancelled_at ? formatDateTime(row.original.cancelled_at) : <span className="text-muted-foreground">—</span>),
    },
    {
      header: "Limit per charge",
      meta: { align: "right" },
      cell: ({ row }) => (row.original.max_amount ? formatMoney(row.original.max_amount) : "No limit"),
    },
  );
  return columns;
}

/** A customer's autopay mandates, including revoked and failed ones (staff view). */
export function CustomerMandates({ customerId, compact }: { customerId: number; compact?: boolean }) {
  const query = usePaged<Mandate>("mandates", "/mandates", { customer_id: customerId, page: 1, page_size: 20 });
  return (
    <DataTable
      caption="Autopay mandates"
      columns={mandateColumns()}
      data={query.data}
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => query.refetch()}
      empty={
        <EmptyState
          compact={compact}
          icon={CreditCard}
          title="No autopay mandate"
          description="Invoices are paid manually. The customer can set up card or UPI autopay from their portal profile."
        />
      }
    />
  );
}
