"use client";

import { AlertTriangle, ArrowRight, CalendarClock, Receipt, Repeat, ScrollText, Wallet } from "lucide-react";
import Link from "next/link";

import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState } from "@/components/feedback";
import { PageHeader, StatCard } from "@/components/page";
import { useSession } from "@/components/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { invoiceColumns, subscriptionColumns } from "@/features/columns";
import { usePaged, useResource } from "@/lib/api/hooks";
import type { InvoiceListItem, PortalSummary, SubscriptionListItem } from "@/lib/api/types";
import { formatDate, formatMoney, formatNumber, pluralize } from "@/lib/format";

export default function PortalHome() {
  const user = useSession();
  const summary = useResource<PortalSummary>(["portal", "summary"], "/portal/summary");
  const subscriptions = usePaged<SubscriptionListItem>("portal", "/portal/subscriptions", { page: 1, page_size: 5 });
  const invoices = usePaged<InvoiceListItem>("portal", "/portal/invoices", { page: 1, page_size: 5 });
  const s = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user.full_name.split(" ")[0]}`} description="Your subscriptions, quotations and invoices in one place." />

      {s && s.pending_quotations > 0 ? (
        <Alert className="border-indigo-200 bg-indigo-50/60">
          <ScrollText />
          <AlertTitle>{pluralize(s.pending_quotations, "quotation")} waiting for you</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Review the offer and accept it to start your subscription.
            <Button size="sm" asChild>
              <Link href="/portal/quotations">Review quotations</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {s && s.overdue_invoices > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>
            {pluralize(s.overdue_invoices, "invoice")} overdue ({formatMoney(s.overdue_amount)})
          </AlertTitle>
          <AlertDescription>Please arrange payment to avoid interruption.</AlertDescription>
        </Alert>
      ) : null}

      {summary.error ? (
        <ErrorState compact error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active subscriptions" icon={Repeat} value={s ? formatNumber(s.active_subscriptions) : "…"} href="/portal/subscriptions" />
          <StatCard label="Amount due" icon={Wallet} tone="warning" value={s ? formatMoney(s.outstanding_amount) : "…"} href="/portal/invoices" />
          <StatCard label="Overdue" icon={AlertTriangle} tone={s && s.overdue_invoices ? "danger" : "default"} value={s ? formatMoney(s.overdue_amount) : "…"} href="/portal/invoices" />
          <StatCard label="Next invoice" icon={CalendarClock} value={s ? formatDate(s.next_invoice_date) : "…"} hint="Generated automatically" />
        </div>
      )}

      <section className="space-y-3" aria-labelledby="portal-subs">
        <div className="flex items-center justify-between">
          <h2 id="portal-subs" className="text-lg font-semibold">
            Your subscriptions
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/portal/subscriptions">
              View all <ArrowRight />
            </Link>
          </Button>
        </div>
        <DataTable
          caption="Your subscriptions"
          columns={subscriptionColumns("/portal", { showCustomer: false })}
          data={subscriptions.data}
          isLoading={subscriptions.isPending}
          error={subscriptions.error}
          onRetry={() => subscriptions.refetch()}
          rowHref={(row) => `/portal/subscriptions/${row.id}`}
          empty={<EmptyState compact icon={Repeat} title="No subscriptions yet" description="When Brightloop sends you a quotation, it will appear here." />}
        />
      </section>

      <section className="space-y-3" aria-labelledby="portal-invoices">
        <div className="flex items-center justify-between">
          <h2 id="portal-invoices" className="text-lg font-semibold">
            Recent invoices
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/portal/invoices">
              View all <ArrowRight />
            </Link>
          </Button>
        </div>
        <DataTable
          caption="Recent invoices"
          columns={invoiceColumns("/portal", { showCustomer: false })}
          data={invoices.data}
          isLoading={invoices.isPending}
          error={invoices.error}
          onRetry={() => invoices.refetch()}
          rowHref={(row) => `/portal/invoices/${row.id}`}
          empty={<EmptyState compact icon={Receipt} title="No invoices yet" />}
        />
      </section>
    </div>
  );
}
