"use client";

import { use } from "react";

import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/feedback";
import { PageHeader, Section } from "@/components/page";
import { invoiceColumns } from "@/features/columns";
import { SubscriptionActions } from "@/features/subscriptions/subscription-actions";
import {
  BillingAutomationPanel,
  LifecycleStepper,
  LinesTable,
  SubscriptionStatusBadges,
  SubscriptionSummary,
} from "@/features/subscriptions/subscription-view";
import { useAllPages, useResource } from "@/lib/api/hooks";
import type { InvoiceListItem, Subscription } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

export default function PortalSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useResource<Subscription>(["portal", "subscription", id], `/portal/subscriptions/${id}`);
  // The portal invoice list has no subscription filter; a customer has few invoices, so filter here.
  const invoices = useAllPages<InvoiceListItem>("portal", "/portal/invoices");
  if (query.isPending) return <PageSkeleton />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const s = query.data;
  const isQuote = s.status === "quotation";
  return (
    <div className="space-y-6">
      <PageHeader
        back={isQuote ? { href: "/portal/quotations", label: "Quotations" } : { href: "/portal/subscriptions", label: "Subscriptions" }}
        title={<span className="tabular">{s.number}</span>}
        badges={<SubscriptionStatusBadges subscription={s} />}
        description={
          isQuote && s.quotation_valid_until ? `${s.plan.name} · offer valid until ${formatDate(s.quotation_valid_until)}` : s.plan.name
        }
        actions={<SubscriptionActions subscription={s} area="portal" />}
      />
      <Section>
        <LifecycleStepper status={s.status} />
      </Section>
      {!isQuote ? <BillingAutomationPanel subscription={s} invoiceHref={(invoiceId) => `/portal/invoices/${invoiceId}`} /> : null}
      <Section title={isQuote ? "What is included" : "Details"}>
        <SubscriptionSummary subscription={s} />
      </Section>
      <Section title="Lines" description="Prices, taxes and discounts per billing period." contentClassName="p-0">
        <LinesTable lines={s.lines} totals={s} caption={`Lines of ${s.number}`} />
      </Section>
      {!isQuote ? (
        <section className="space-y-3" aria-labelledby="billing-history">
          <h2 id="billing-history" className="text-lg font-semibold">
            Billing history
          </h2>
          <DataTable
            caption={`Invoices for ${s.number}`}
            columns={invoiceColumns("/portal", { showCustomer: false, showSubscription: false })}
            data={invoices.data?.filter((inv) => inv.subscription.id === s.id)}
            isLoading={invoices.isPending}
            error={invoices.error}
            onRetry={() => invoices.refetch()}
            rowHref={(row) => `/portal/invoices/${row.id}`}
            empty={<EmptyState compact title="No invoices yet" description="Invoices are generated automatically on each billing date." />}
          />
        </section>
      ) : null}
    </div>
  );
}
