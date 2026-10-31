"use client";

import { AlertTriangle } from "lucide-react";
import dynamic from "next/dynamic";

import { BarList } from "@/components/charts";
import { EmptyState, ErrorState } from "@/components/feedback";
import { Section, TextLink } from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PAYMENT_METHOD_LABEL } from "@/features/columns";
import { usePaged, useResource } from "@/lib/api/hooks";
import type { MethodBreakdown, RevenuePoint, StatusCount, UnappliedPayment } from "@/lib/api/types";
import { formatMoney, formatNumber, humanize, pluralize } from "@/lib/format";

const RevenueChart = dynamic(() => import("@/components/charts").then((m) => m.RevenueChart), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  plan_id?: string;
  customer_id?: string;
}

export function RevenueSection({ filters, granularity = "month" }: { filters: ReportFilters; granularity?: "day" | "month" }) {
  const revenue = useResource<RevenuePoint[]>(["reports", "revenue"], "/reports/revenue", { ...filters, granularity });
  return (
    <Section title="Revenue received" description="Cash collected from posted payments.">
      {revenue.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : revenue.error ? (
        <ErrorState compact error={revenue.error} onRetry={() => revenue.refetch()} />
      ) : revenue.data.length === 0 ? (
        <EmptyState compact title="No payments in this period" />
      ) : (
        <RevenueChart data={revenue.data} granularity={granularity} />
      )}
    </Section>
  );
}

export function PaymentsByMethodSection({ filters }: { filters: ReportFilters }) {
  const q = useResource<MethodBreakdown[]>(["reports", "by-method"], "/reports/payments-by-method", { ...filters });
  return (
    <Section title="Payments by method">
      {q.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : q.error ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState compact title="No payments in this period" />
      ) : (
        <BarList
          caption="Payments by method"
          format={(v) => formatMoney(v)}
          items={q.data.map((m) => ({
            label: PAYMENT_METHOD_LABEL[m.method] ?? humanize(m.method),
            value: Number(m.amount),
            hint: pluralize(m.payments_count, "payment"),
          }))}
        />
      )}
    </Section>
  );
}

const STATUS_ORDER = ["draft", "quotation", "confirmed", "active", "closed"];

export function SubscriptionsByStatusSection() {
  const q = useResource<StatusCount[]>(["reports", "by-status"], "/reports/subscriptions-by-status");
  return (
    <Section title="Subscriptions by status" description="Where every subscription stands today.">
      {q.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : q.error ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState compact title="No subscriptions yet" />
      ) : (
        <BarList
          caption="Subscriptions by status"
          items={[...q.data]
            .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
            .map((s) => ({ label: humanize(s.status), value: s.count }))}
        />
      )}
    </Section>
  );
}

/** Provider payments that could not be applied (already paid, cancelled, too much) and need a refund. */
export function UnappliedPaymentsAlert() {
  const q = usePaged<UnappliedPayment>("reports", "/reports/unapplied-payments", { page: 1, page_size: 5 });
  if (!q.data || q.data.total === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{pluralize(q.data.total, "payment")} received but not applied — refund needed</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-0.5">
          {q.data.items.map((p) => (
            <li key={p.audit_event_id} className="tabular">
              {formatMoney(p.amount)} via {humanize(p.provider)} ({p.provider_payment_id})
              {p.invoice_id ? (
                <>
                  {" "}for <TextLink href={`/console/invoices/${p.invoice_id}`}>invoice #{p.invoice_id}</TextLink>
                </>
              ) : null}{" "}
              — {humanize(p.reason)}
            </li>
          ))}
        </ul>
        {q.data.total > q.data.items.length ? <p className="mt-1">and {formatNumber(q.data.total - q.data.items.length)} more.</p> : null}
      </AlertDescription>
    </Alert>
  );
}
