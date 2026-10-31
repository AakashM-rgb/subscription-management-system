"use client";

import { Repeat } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageHeader } from "@/components/page";
import { subscriptionColumns } from "@/features/columns";
import { useAllPages } from "@/lib/api/hooks";
import type { SubscriptionListItem } from "@/lib/api/types";

export default function PortalSubscriptionsPage() {
  // A customer has a handful of subscriptions; the portal API has no status filter, so load all and split.
  const query = useAllPages<SubscriptionListItem>("portal", "/portal/subscriptions");
  const rows = query.data?.filter((s) => s.status !== "quotation");
  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" description="Your plans, what they cost, when the next invoice is due and when they expire." />
      <DataTable
        caption="Your subscriptions"
        columns={subscriptionColumns("/portal", { showCustomer: false })}
        data={rows}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        rowHref={(row) => `/portal/subscriptions/${row.id}`}
        empty={<EmptyState icon={Repeat} title="No subscriptions yet" description="Accepted quotations become subscriptions here." />}
      />
    </div>
  );
}
