"use client";

import { ScrollText } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState, TableSkeleton } from "@/components/feedback";
import { PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { useAllPages } from "@/lib/api/hooks";
import type { SubscriptionListItem } from "@/lib/api/types";
import { BILLING_PERIOD_UNIT, formatDate, formatMoney } from "@/lib/format";

export default function PortalQuotationsPage() {
  const query = useAllPages<SubscriptionListItem>("portal", "/portal/subscriptions");
  const quotes = query.data?.filter((s) => s.status === "quotation") ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title="Quotations" description="Offers prepared for you. Review the details and accept to start the subscription." />
      {query.isPending ? (
        <TableSkeleton rows={3} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : quotes.length === 0 ? (
        <Section>
          <EmptyState icon={ScrollText} title="No open quotations" description="When our team sends you an offer, it appears here for you to accept." />
        </Section>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {quotes.map((q) => (
            <li key={q.id}>
              <Section title={<span className="tabular">{q.number}</span>} description={q.plan.name}>
                <p className="tabular text-2xl font-semibold">
                  {formatMoney(q.amount_total)}
                  <span className="text-sm font-normal text-muted-foreground"> / {BILLING_PERIOD_UNIT[q.plan.billing_period]}</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Starts {formatDate(q.start_date)} · runs until {formatDate(q.end_date)}
                </p>
                <Button className="mt-4 w-full sm:w-auto" asChild>
                  <Link href={`/portal/subscriptions/${q.id}`}>Review &amp; accept</Link>
                </Button>
              </Section>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
