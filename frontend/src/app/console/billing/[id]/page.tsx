"use client";

import { use } from "react";

import { DataTable, type ColumnDef } from "@/components/data-table";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/feedback";
import { DetailList, PageBody, PageHeader, Section, StatCard, TextLink } from "@/components/page";
import { StatusBadge } from "@/components/status-badge";
import { useResource } from "@/lib/api/hooks";
import type { BillingRunDetail, BillingRunItem } from "@/lib/api/types";
import { formatDate, formatDateTime, formatNumber, humanize } from "@/lib/format";

const columns: ColumnDef<BillingRunItem, unknown>[] = [
  {
    header: "Subscription",
    cell: ({ row }) => (
      <TextLink href={`/console/subscriptions/${row.original.subscription_id}`} className="tabular">
        #{row.original.subscription_id}
      </TextLink>
    ),
  },
  { header: "Result", cell: ({ row }) => <StatusBadge kind="run" value={row.original.status} /> },
  { header: "Invoices created", meta: { align: "right" }, cell: ({ row }) => formatNumber(row.original.invoices_created) },
  {
    header: "Error",
    cell: ({ row }) => (row.original.error ? <span className="text-sm text-destructive">{row.original.error}</span> : <span className="text-muted-foreground">—</span>),
  },
  { header: "Processed", cell: ({ row }) => formatDateTime(row.original.created_at) },
];

export default function BillingRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useResource<BillingRunDetail>(["billing-runs", "detail", id], `/billing/runs/${id}`, undefined, {
    refetchInterval: (q) => (q.state.data?.status === "running" ? 3000 : false),
  });
  if (query.isPending) return <PageSkeleton />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const run = query.data;

  return (
    <PageBody>
      <PageHeader
        back={{ href: "/console/billing", label: "Billing runs" }}
        title={`Billing run #${run.id}`}
        badges={<StatusBadge kind="run" value={run.status} />}
        description={`Billed everything due up to ${formatDate(run.as_of)}`}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Subscriptions due" value={formatNumber(run.subscriptions_due)} />
        <StatCard label="Invoices created" tone="success" value={formatNumber(run.invoices_created)} />
        <StatCard label="Failures" tone={run.failures ? "danger" : "default"} value={formatNumber(run.failures)} hint={run.failures ? "Failed subscriptions are retried on the next run" : undefined} />
      </div>
      <Section title="Run details">
        <DetailList
          columns={3}
          items={[
            { label: "Trigger", value: humanize(run.trigger) },
            { label: "Started", value: formatDateTime(run.started_at) },
            { label: "Finished", value: run.finished_at ? formatDateTime(run.finished_at) : "Still running…" },
            { label: "Error", value: <span className="text-destructive">{run.error}</span>, hidden: !run.error },
          ]}
        />
      </Section>
      <DataTable
        caption="Subscriptions processed in this run"
        columns={columns}
        data={run.items}
        isLoading={false}
        empty={<EmptyState compact title="Nothing was due" description="No subscription had a billing date in this run." />}
      />
    </PageBody>
  );
}
