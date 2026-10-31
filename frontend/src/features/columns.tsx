"use client";

import type { ColumnDef } from "@/components/data-table";
import { TextLink } from "@/components/page";
import { ExpiredBadge, OverdueBadge, PausedBadge, StatusBadge } from "@/components/status-badge";
import type { InvoiceListItem, Payment, PortalPayment, SubscriptionListItem } from "@/lib/api/types";
import { BILLING_PERIOD_LABEL, formatDate, formatMoney, humanize } from "@/lib/format";

export function subscriptionColumns(
  base: "/console" | "/portal",
  options: { showCustomer?: boolean } = {},
): ColumnDef<SubscriptionListItem, unknown>[] {
  const columns: ColumnDef<SubscriptionListItem, unknown>[] = [
    {
      header: "Number",
      cell: ({ row }) => (
        <TextLink href={`${base}/subscriptions/${row.original.id}`} className="tabular">
          {row.original.number}
        </TextLink>
      ),
    },
  ];
  if (options.showCustomer !== false) {
    columns.push({
      header: "Customer",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.customer.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.customer.email}</p>
        </div>
      ),
    });
  }
  columns.push(
    {
      header: "Plan",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.plan.name}</p>
          <p className="text-xs text-muted-foreground">{BILLING_PERIOD_LABEL[row.original.plan.billing_period]}</p>
        </div>
      ),
    },
    {
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge kind="subscription" value={row.original.status} />
          {row.original.is_paused ? <PausedBadge /> : null}
          {row.original.is_expired ? <ExpiredBadge /> : null}
        </div>
      ),
    },
    { header: "Next invoice", cell: ({ row }) => formatDate(row.original.next_invoice_date) },
    { header: "Expires", cell: ({ row }) => formatDate(row.original.end_date) },
    {
      header: "Per period",
      meta: { align: "right" },
      cell: ({ row }) => <span className="font-medium">{formatMoney(row.original.amount_total)}</span>,
    },
  );
  return columns;
}

export function invoiceColumns(
  base: "/console" | "/portal",
  options: { showCustomer?: boolean; showSubscription?: boolean } = {},
): ColumnDef<InvoiceListItem, unknown>[] {
  const columns: ColumnDef<InvoiceListItem, unknown>[] = [
    {
      header: "Invoice",
      cell: ({ row }) => (
        <TextLink href={`${base}/invoices/${row.original.id}`} className="tabular">
          {row.original.number ?? `Draft #${row.original.id}`}
        </TextLink>
      ),
    },
  ];
  if (options.showCustomer !== false) {
    columns.push({ header: "Customer", cell: ({ row }) => <span className="font-medium">{row.original.bill_to_name}</span> });
  }
  if (options.showSubscription !== false) {
    columns.push({
      header: "Subscription",
      cell: ({ row }) =>
        base === "/console" ? (
          <TextLink href={`/console/subscriptions/${row.original.subscription.id}`} className="tabular font-normal">
            {row.original.subscription.number}
          </TextLink>
        ) : (
          <span className="tabular">{row.original.subscription.number}</span>
        ),
    });
  }
  columns.push(
    {
      header: "Period",
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">
          {formatDate(row.original.period_start)} – {formatDate(row.original.period_end)}
        </span>
      ),
    },
    { header: "Due", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.due_date)}</span> },
    {
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge kind="invoice" value={row.original.status} />
          {row.original.is_overdue ? <OverdueBadge days={row.original.days_overdue} /> : null}
          {row.original.collection_status === "failed" || row.original.collection_status === "pending" ? (
            <StatusBadge kind="collection" value={row.original.collection_status} />
          ) : null}
        </div>
      ),
    },
    {
      header: "Total",
      meta: { align: "right" },
      cell: ({ row }) => formatMoney(row.original.amount_total, row.original.currency),
    },
    {
      header: "Amount due",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className={row.original.is_overdue ? "font-semibold text-destructive" : "font-medium"}>
          {formatMoney(row.original.amount_due, row.original.currency)}
        </span>
      ),
    },
  );
  return columns;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  upi: "UPI",
  cheque: "Cheque",
  other: "Other",
};

export function paymentColumns(base: "/console" | "/portal"): ColumnDef<Payment | PortalPayment, unknown>[] {
  return [
    { header: "Payment", cell: ({ row }) => <span className="tabular font-medium">{row.original.number}</span> },
    { header: "Date", cell: ({ row }) => formatDate(row.original.payment_date) },
    {
      header: "Invoice",
      cell: ({ row }) => (
        <TextLink href={`${base}/invoices/${row.original.invoice_id}`} className="tabular font-normal">
          {row.original.invoice_number ?? `#${row.original.invoice_id}`}
        </TextLink>
      ),
    },
    { header: "Method", cell: ({ row }) => PAYMENT_METHOD_LABEL[row.original.method] ?? humanize(row.original.method) },
    { header: "Status", cell: ({ row }) => <StatusBadge kind="payment" value={row.original.status} /> },
    {
      header: "Amount",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className={row.original.status === "voided" ? "text-muted-foreground line-through" : "font-medium"}>
          {formatMoney(row.original.amount)}
        </span>
      ),
    },
  ];
}
