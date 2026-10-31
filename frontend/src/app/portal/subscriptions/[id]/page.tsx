"use client";

import { use } from "react";

import { ErrorState, PageSkeleton } from "@/components/feedback";
import { PageHeader, Section } from "@/components/page";
import { SubscriptionActions } from "@/features/subscriptions/subscription-actions";
import {
  BillingAutomationPanel,
  LifecycleStepper,
  LinesTable,
  SubscriptionStatusBadges,
  SubscriptionSummary,
} from "@/features/subscriptions/subscription-view";
import { useResource } from "@/lib/api/hooks";
import type { Subscription } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

export default function PortalSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useResource<Subscription>(["portal", "subscription", id], `/portal/subscriptions/${id}`);
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
    </div>
  );
}
