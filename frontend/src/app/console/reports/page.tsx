"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, FileText, Repeat, Wallet } from "lucide-react";

import { FilterSelect, TableToolbar } from "@/components/data-table";
import { ErrorState } from "@/components/feedback";
import { PageBody, PageHeader, StatCard } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PaymentsByMethodSection,
  RevenueSection,
  SubscriptionsByStatusSection,
  UnappliedPaymentsAlert,
} from "@/features/reports/report-widgets";
import { useResource } from "@/lib/api/hooks";
import { usePlanOptions } from "@/lib/api/reference";
import type { ReportSummary } from "@/lib/api/types";
import { addDaysISO, formatDate, formatMoney, formatNumber, todayISO } from "@/lib/format";
import { useListState } from "@/lib/use-list-state";

const PRESETS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "12 months", days: 365 },
];

export default function ReportsPage() {
  const list = useListState(["date_from", "date_to", "plan_id", "granularity"] as const);
  const plans = usePlanOptions();
  const filters = {
    date_from: list.filters.date_from || undefined,
    date_to: list.filters.date_to || undefined,
    plan_id: list.filters.plan_id || undefined,
  };
  const granularity = list.filters.granularity === "day" ? "day" : "month";
  const summary = useResource<ReportSummary>(["reports", "summary"], "/reports/summary", filters);
  const s = summary.data;
  const range = filters.date_from || filters.date_to ? `${formatDate(filters.date_from ?? null)} – ${formatDate(filters.date_to ?? todayISO())}` : "All time";

  return (
    <PageBody>
      <PageHeader title="Reports" description="Active subscriptions, revenue, payments and overdue invoices in one place." />
      <TableToolbar>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="rep-from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input id="rep-from" type="date" className="h-9 w-40 bg-background" value={list.filters.date_from} onChange={(e) => list.setFilter("date_from", e.target.value)} />
          <Label htmlFor="rep-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input id="rep-to" type="date" className="h-9 w-40 bg-background" value={list.filters.date_to} onChange={(e) => list.setFilter("date_to", e.target.value)} />
          {PRESETS.map((p) => (
            <Button key={p.label} variant="outline" size="sm" onClick={() => list.update({ date_from: addDaysISO(todayISO(), -p.days), date_to: todayISO() })}>
              {p.label}
            </Button>
          ))}
        </div>
        <FilterSelect
          label="Plan"
          value={list.filters.plan_id}
          onChange={(v) => list.setFilter("plan_id", v)}
          options={(plans.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
        />
        <FilterSelect
          label="Chart by"
          allLabel="Month"
          value={list.filters.granularity}
          onChange={(v) => list.setFilter("granularity", v)}
          options={[{ value: "day", label: "Day" }]}
        />
        {list.hasFilters ? (
          <Button variant="ghost" size="sm" onClick={list.clear}>
            Clear
          </Button>
        ) : null}
      </TableToolbar>

      <UnappliedPaymentsAlert />

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Flows below cover <strong className="text-foreground">{range}</strong>. Active, outstanding and overdue are as of {s ? formatDate(s.as_of) : "today"}.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active subscriptions" icon={Repeat} value={s ? formatNumber(s.active_subscriptions) : "…"} hint={s ? `${formatNumber(s.new_subscriptions)} new · ${formatNumber(s.closed_subscriptions)} closed` : undefined} href="/console/subscriptions?status=active" />
            <StatCard label="Revenue received" icon={ArrowDownRight} tone="success" value={s ? formatMoney(s.revenue_received) : "…"} hint={s ? `${formatNumber(s.payments_count)} payments` : undefined} href="/console/payments" />
            <StatCard label="Invoiced" icon={FileText} value={s ? formatMoney(s.invoiced_amount) : "…"} hint={s ? `${formatNumber(s.invoices_count)} invoices` : undefined} href="/console/invoices" />
            <StatCard label="Still owed" icon={Wallet} tone="warning" value={s ? formatMoney(s.outstanding_amount) : "…"} hint={s ? `${formatNumber(s.outstanding_count)} open invoices` : undefined} href="/console/receivables?view=outstanding" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Overdue"
              icon={AlertTriangle}
              tone={s && s.overdue_count > 0 ? "danger" : "default"}
              value={s ? formatMoney(s.overdue_amount) : "…"}
              hint={s ? `${formatNumber(s.overdue_count)} invoices past their due date` : undefined}
              href="/console/receivables"
            />
            <StatCard
              label="Collection rate"
              icon={ArrowUpRight}
              value={s && Number(s.invoiced_amount) > 0 ? `${Math.round((Number(s.revenue_received) / Number(s.invoiced_amount)) * 100)}%` : "—"}
              hint="Revenue received ÷ invoiced in the period"
            />
          </div>
        </>
      )}

      <RevenueSection filters={filters} granularity={granularity} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PaymentsByMethodSection filters={filters} />
        <SubscriptionsByStatusSection />
      </div>
    </PageBody>
  );
}
