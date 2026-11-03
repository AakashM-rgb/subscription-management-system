"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  CalendarClock,
  FileText,
  Plus,
  Repeat,
  ScrollText,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ErrorState, TableSkeleton } from "@/components/feedback";
import { PageBody, PageHeader, Section, StatCard, TextLink } from "@/components/page";
import { useSession } from "@/components/session";
import { OverdueBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { RevenueSection, SubscriptionsByStatusSection, UnappliedPaymentsAlert } from "@/features/reports/report-widgets";
import { usePaged, useResource } from "@/lib/api/hooks";
import type { BillingRun, InvoiceListItem, OverdueInvoiceRow, ReportSummary, SubscriptionListItem } from "@/lib/api/types";
import { formatDate, formatDateTime, formatMoney, formatNumber, pluralize } from "@/lib/format";

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function useSummary() {
  return useResource<ReportSummary>(["reports", "summary", "dashboard"], "/reports/summary");
}

function KpiRow({ summary }: { summary: ReturnType<typeof useSummary> }) {
  const s = summary.data;
  if (summary.error) return <ErrorState compact error={summary.error} onRetry={() => summary.refetch()} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Active subscriptions" icon={Repeat} value={s ? formatNumber(s.active_subscriptions) : "…"} hint={s ? `${formatNumber(s.new_subscriptions)} new all time` : undefined} href="/console/subscriptions?status=active" />
      <StatCard label="Revenue received" icon={ArrowDownRight} tone="success" value={s ? formatMoney(s.revenue_received) : "…"} hint={s ? pluralize(s.payments_count, "payment") : undefined} href="/console/reports" />
      <StatCard label="Outstanding" icon={Wallet} tone="warning" value={s ? formatMoney(s.outstanding_amount) : "…"} hint={s ? `${formatNumber(s.outstanding_count)} open invoices` : undefined} href="/console/receivables?view=outstanding" />
      <StatCard label="Overdue" icon={AlertTriangle} tone={s && s.overdue_count ? "danger" : "default"} value={s ? formatMoney(s.overdue_amount) : "…"} hint={s ? `${formatNumber(s.overdue_count)} invoices to chase` : undefined} href="/console/receivables" />
    </div>
  );
}

function QueueCard<T>({
  title,
  icon: Icon,
  href,
  query,
  renderRow,
  emptyText,
}: {
  title: string;
  icon: LucideIcon;
  href: string;
  query: { data?: { items: T[]; total: number }; isPending: boolean; error: unknown; refetch: () => unknown };
  renderRow: (row: T) => ReactNode;
  emptyText: string;
}) {
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
          {query.data ? (
            <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{formatNumber(query.data.total)}</span>
          ) : null}
        </span>
      }
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link href={href}>
            View all <ArrowRight />
          </Link>
        </Button>
      }
      contentClassName="p-0"
    >
      {query.isPending ? (
        <TableSkeleton rows={3} columns={3} />
      ) : query.error ? (
        <ErrorState compact error={query.error} onRetry={() => query.refetch()} />
      ) : query.data && query.data.items.length ? (
        <ul className="divide-y">{query.data.items.map((row, i) => <li key={i} className="flex items-center justify-between gap-3 px-5 py-3">{renderRow(row)}</li>)}</ul>
      ) : (
        <p className="px-5 py-6 text-sm text-muted-foreground">{emptyText}</p>
      )}
    </Section>
  );
}

function OverdueQueue() {
  const q = usePaged<OverdueInvoiceRow>("reports", "/reports/overdue-invoices", { page: 1, page_size: 5 });
  return (
    <QueueCard
      title="Overdue invoices to chase"
      icon={AlertTriangle}
      href="/console/receivables"
      query={q}
      emptyText="Nothing overdue. Every invoice is within its payment terms."
      renderRow={(r) => (
        <>
          <div className="min-w-0">
            <TextLink href={`/console/invoices/${r.id}`} className="tabular">
              {r.number ?? `#${r.id}`}
            </TextLink>
            <p className="truncate text-xs text-muted-foreground">{r.customer_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <OverdueBadge days={r.days_overdue} />
            <span className="tabular text-sm font-semibold text-destructive">{formatMoney(r.amount_due)}</span>
          </div>
        </>
      )}
    />
  );
}

function SubscriptionQueue({ title, icon, params, href, emptyText, meta }: { title: string; icon: LucideIcon; params: Record<string, string | boolean>; href: string; emptyText: string; meta: (s: SubscriptionListItem) => ReactNode }) {
  const q = usePaged<SubscriptionListItem>("subscriptions", "/subscriptions", { ...params, page: 1, page_size: 5 });
  return (
    <QueueCard
      title={title}
      icon={icon}
      href={href}
      query={q}
      emptyText={emptyText}
      renderRow={(s) => (
        <>
          <div className="min-w-0">
            <TextLink href={`/console/subscriptions/${s.id}`} className="tabular">
              {s.number}
            </TextLink>
            <p className="truncate text-xs text-muted-foreground">
              {s.customer.name} · {s.plan.name}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">{meta(s)}</div>
        </>
      )}
    />
  );
}

function DraftInvoiceQueue() {
  const q = usePaged<InvoiceListItem>("invoices", "/invoices", { status: "draft", page: 1, page_size: 5, sort: "-invoice_date" });
  return (
    <QueueCard
      title="Draft invoices to confirm"
      icon={FileText}
      href="/console/invoices?status=draft"
      query={q}
      emptyText="No draft invoices waiting."
      renderRow={(i) => (
        <>
          <div className="min-w-0">
            <TextLink href={`/console/invoices/${i.id}`}>Draft #{i.id}</TextLink>
            <p className="truncate text-xs text-muted-foreground">
              {i.bill_to_name} · {formatDate(i.period_start)} – {formatDate(i.period_end)}
            </p>
          </div>
          <span className="tabular text-sm font-medium">{formatMoney(i.amount_total, i.currency)}</span>
        </>
      )}
    />
  );
}

function RecentRuns() {
  const q = usePaged<BillingRun>("billing-runs", "/billing/runs", { page: 1, page_size: 5 });
  return (
    <QueueCard
      title="Recent billing runs"
      icon={CalendarClock}
      href="/console/billing"
      query={q}
      emptyText="No billing runs yet."
      renderRow={(r) => (
        <>
          <div className="min-w-0">
            <TextLink href={`/console/billing/${r.id}`}>Run #{r.id}</TextLink>
            <p className="text-xs text-muted-foreground">{formatDateTime(r.started_at)}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="tabular">{pluralize(r.invoices_created, "invoice")}</span>
            <StatusBadge kind="run" value={r.status} />
          </div>
        </>
      )}
    />
  );
}

export function AdminDashboard() {
  const user = useSession();
  const summary = useSummary();
  return (
    <PageBody>
      <PageHeader
        title={`${greeting()}, ${user.full_name.split(" ")[0]}`}
        description="The whole business at a glance: recurring revenue, what is owed and what needs attention."
        actions={
          <Button asChild>
            <Link href="/console/subscriptions/new">
              <Plus /> New quotation
            </Link>
          </Button>
        }
      />
      <UnappliedPaymentsAlert />
      <KpiRow summary={summary} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <RevenueSection filters={{}} />
        </div>
        <SubscriptionsByStatusSection />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <OverdueQueue />
        <RecentRuns />
      </div>
    </PageBody>
  );
}

export function StaffDashboard() {
  const user = useSession();
  const summary = useSummary();
  return (
    <PageBody>
      <PageHeader
        title={`${greeting()}, ${user.full_name.split(" ")[0]}`}
        description="Your workspace: quotations to follow up, invoices to confirm, payments to chase and renewals coming up."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/console/payments">
                <Wallet /> Record payment
              </Link>
            </Button>
            <Button asChild>
              <Link href="/console/subscriptions/new">
                <Plus /> New quotation
              </Link>
            </Button>
          </>
        }
      />
      <KpiRow summary={summary} />
      <div className="grid gap-6 lg:grid-cols-2">
        <OverdueQueue />
        <DraftInvoiceQueue />
        <SubscriptionQueue
          title="Quotations awaiting the customer"
          icon={ScrollText}
          params={{ status: "quotation", sort: "-created_at" }}
          href="/console/quotations"
          emptyText="No open quotations."
          meta={(s) => formatMoney(s.amount_total)}
        />
        <SubscriptionQueue
          title="Expired — renew or close"
          icon={CalendarClock}
          params={{ status: "active", expired: true, sort: "end_date" }}
          href="/console/subscriptions?status=active&expired=true"
          emptyText="No subscriptions past their term."
          meta={(s) => `Ended ${formatDate(s.end_date)}`}
        />
      </div>
    </PageBody>
  );
}
