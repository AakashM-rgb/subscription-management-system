"use client";

import { CalendarClock, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageBody, PageHeader, TextLink } from "@/components/page";
import { Can } from "@/components/session";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useApiMutation, usePaged } from "@/lib/api/hooks";
import type { BillingRun } from "@/lib/api/types";
import { formatDate, formatDateTime, formatNumber, humanize, pluralize, todayISO } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";

const columns: ColumnDef<BillingRun, unknown>[] = [
  { header: "Run", cell: ({ row }) => <TextLink href={`/console/billing/${row.original.id}`} className="tabular">#{row.original.id}</TextLink> },
  { header: "Billing date", cell: ({ row }) => formatDate(row.original.as_of) },
  { header: "Trigger", cell: ({ row }) => humanize(row.original.trigger) },
  { header: "Started", cell: ({ row }) => formatDateTime(row.original.started_at) },
  { header: "Due", meta: { align: "right" }, cell: ({ row }) => formatNumber(row.original.subscriptions_due) },
  { header: "Invoices", meta: { align: "right" }, cell: ({ row }) => <span className="font-medium">{formatNumber(row.original.invoices_created)}</span> },
  {
    header: "Failures",
    meta: { align: "right" },
    cell: ({ row }) => <span className={row.original.failures ? "font-semibold text-destructive" : ""}>{formatNumber(row.original.failures)}</span>,
  },
  { header: "Status", cell: ({ row }) => <StatusBadge kind="run" value={row.original.status} /> },
];

export default function BillingRunsPage() {
  const router = useRouter();
  const list = useListState();
  const [open, setOpen] = useState(false);
  const [asOf, setAsOf] = useState(todayISO());
  const query = usePaged<BillingRun>("billing-runs", "/billing/runs", { page: list.page, page_size: list.pageSize });
  const run = useApiMutation<string, BillingRun>({
    mutationFn: (date) => api.post<BillingRun>("/billing/runs", { as_of: date } satisfies Body<"BillingRunIn">),
    invalidate: ["billing-runs", "invoices", "subscriptions", "reports"],
    success: (r) => `Billing run finished: ${pluralize(r.invoices_created, "invoice")} created${r.failures ? `, ${r.failures} failed` : ""}`,
    onSuccess: (r) => router.push(`/console/billing/${r.id}`),
  });

  return (
    <PageBody>
      <PageHeader
        title="Billing runs"
        description="On billing day every due subscription is invoiced automatically. Each run is recorded here; periods already billed are never billed again."
        actions={
          <Can permission="billing.run">
            <Button onClick={() => setOpen(true)}>
              <Play /> Run billing now
            </Button>
          </Can>
        }
      />
      <DataTable
        caption="Billing runs"
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        rowHref={(row) => `/console/billing/${row.id}`}
        empty={<EmptyState icon={CalendarClock} title="No billing runs yet" description="The scheduler runs billing daily; admins can also start a run manually." />}
      />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Run billing now?"
        description={
          <p>
            Invoices are created for every active subscription with a billing date on or before the chosen date. Invoices of subscriptions with an active autopay mandate are confirmed automatically and collected through the saved payment method; all others stay as drafts for review. It is safe to run
            again: subscriptions that were already billed for a period are skipped.
          </p>
        }
        body={
          <div className="space-y-1.5">
            <Label htmlFor="run-as-of">Bill everything due up to</Label>
            <Input id="run-as-of" type="date" value={asOf} max={todayISO()} onChange={(e) => setAsOf(e.target.value)} />
          </div>
        }
        canConfirm={/^\d{4}-\d{2}-\d{2}$/.test(asOf)}
        confirmLabel="Start billing run"
        onConfirm={() => run.mutateAsync(asOf)}
      />
    </PageBody>
  );
}
