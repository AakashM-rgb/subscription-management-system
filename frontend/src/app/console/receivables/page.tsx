"use client";

import { AlertTriangle, CheckCircle2, Clock, Wallet } from "lucide-react";
import { useState } from "react";

import { DataTable, FilterSelect, TableToolbar, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageBody, PageHeader, StatCard, TextLink } from "@/components/page";
import { OverdueBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invoiceColumns } from "@/features/columns";
import { RecordPaymentDialog } from "@/features/payments/record-payment-dialog";
import { usePaged, useResource } from "@/lib/api/hooks";
import type { InvoiceListItem, OverdueInvoiceRow, ReportSummary } from "@/lib/api/types";
import { CURRENCY, formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";

export default function ReceivablesPage() {
  const list = useListState(["view", "min_days"] as const, { view: "overdue" });
  const [paying, setPaying] = useState<OverdueInvoiceRow | null>(null);
  const summary = useResource<ReportSummary>(["reports", "summary", "receivables"], "/reports/summary");
  const outstanding = usePaged<InvoiceListItem>(
    "invoices",
    "/invoices",
    { status: "confirmed", sort: "due_date", page: list.page, page_size: list.pageSize },
    { enabled: list.filters.view === "outstanding" },
  );
  const overdue = usePaged<OverdueInvoiceRow>(
    "reports",
    "/reports/overdue-invoices",
    { min_days_overdue: list.filters.min_days || undefined, page: list.page, page_size: list.pageSize },
    { enabled: list.filters.view === "overdue" },
  );

  const overdueColumns: ColumnDef<OverdueInvoiceRow, unknown>[] = [
    {
      header: "Invoice",
      cell: ({ row }) => (
        <TextLink href={`/console/invoices/${row.original.id}`} className="tabular">
          {row.original.number ?? `#${row.original.id}`}
        </TextLink>
      ),
    },
    {
      header: "Customer",
      cell: ({ row }) => (
        <TextLink href={`/console/customers/${row.original.customer_id}`} className="font-normal text-foreground">
          {row.original.customer_name}
        </TextLink>
      ),
    },
    { header: "Due date", cell: ({ row }) => formatDate(row.original.due_date) },
    { header: "Overdue", cell: ({ row }) => <OverdueBadge days={row.original.days_overdue} /> },
    { header: "Total", meta: { align: "right" }, cell: ({ row }) => formatMoney(row.original.amount_total) },
    {
      header: "Amount due",
      meta: { align: "right" },
      cell: ({ row }) => <span className="font-semibold text-destructive">{formatMoney(row.original.amount_due)}</span>,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: "right" },
      cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => setPaying(row.original)}>
          Record payment
        </Button>
      ),
    },
  ];

  const s = summary.data;
  return (
    <PageBody>
      <PageHeader
        title="Outstanding & overdue"
        description="Which invoices are paid and which are still open, so overdue ones are chased before they become lost revenue."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Outstanding" icon={Wallet} value={s ? formatMoney(s.outstanding_amount) : "…"} hint={s ? `${formatNumber(s.outstanding_count)} open invoices` : undefined} />
        <StatCard
          label="Overdue"
          icon={AlertTriangle}
          tone={s && s.overdue_count > 0 ? "danger" : "default"}
          value={s ? formatMoney(s.overdue_amount) : "…"}
          hint={s ? `${formatNumber(s.overdue_count)} overdue invoices` : undefined}
        />
        <StatCard label="Collected (all time)" icon={CheckCircle2} tone="success" value={s ? formatMoney(s.revenue_received) : "…"} hint={s ? `${formatNumber(s.payments_count)} payments` : undefined} />
        <StatCard label="As of" icon={Clock} value={s ? formatDate(s.as_of) : "…"} hint={`Amounts in ${CURRENCY}`} />
      </div>
      <Tabs value={list.filters.view} onValueChange={(v) => list.update({ view: v, min_days: null })}>
        <TabsList>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="outstanding">All outstanding</TabsTrigger>
        </TabsList>
        <TabsContent value="overdue" className="space-y-4">
          <TableToolbar>
            <FilterSelect
              label="Overdue by"
              allLabel="Any"
              value={list.filters.min_days}
              onChange={(v) => list.setFilter("min_days", v)}
              options={[
                { value: "7", label: "7+ days" },
                { value: "30", label: "30+ days" },
                { value: "60", label: "60+ days" },
                { value: "90", label: "90+ days" },
              ]}
            />
          </TableToolbar>
          <DataTable
            caption="Overdue invoices"
            columns={overdueColumns}
            data={overdue.data}
            isLoading={overdue.isPending}
            isFetching={overdue.isFetching}
            error={overdue.error}
            onRetry={() => overdue.refetch()}
            pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
            hasFilters={Boolean(list.filters.min_days)}
            onClearFilters={() => list.setFilter("min_days", "")}
            empty={<EmptyState icon={CheckCircle2} title="Nothing overdue" description="Every confirmed invoice is within its payment terms." />}
          />
        </TabsContent>
        <TabsContent value="outstanding">
          <DataTable
            caption="Outstanding invoices"
            columns={invoiceColumns("/console")}
            data={outstanding.data}
            isLoading={outstanding.isPending}
            isFetching={outstanding.isFetching}
            error={outstanding.error}
            onRetry={() => outstanding.refetch()}
            pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
            rowHref={(row) => `/console/invoices/${row.id}`}
            empty={<EmptyState icon={CheckCircle2} title="No outstanding invoices" description="All confirmed invoices are paid." />}
          />
        </TabsContent>
      </Tabs>
      <RecordPaymentDialog
        open={paying !== null}
        onOpenChange={(o) => (!o ? setPaying(null) : undefined)}
        invoice={
          paying
            ? {
                id: paying.id,
                number: paying.number,
                bill_to_name: paying.customer_name,
                amount_due: paying.amount_due,
                currency: CURRENCY,
                due_date: paying.due_date,
              }
            : null
        }
      />
    </PageBody>
  );
}
