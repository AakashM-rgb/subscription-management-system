"use client";

import { Plus, Repeat } from "lucide-react";
import Link from "next/link";

import { DataTable, FilterSelect, SearchInput, SegmentedFilter, TableToolbar } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { Can } from "@/components/session";
import { Button } from "@/components/ui/button";
import { subscriptionColumns } from "@/features/columns";
import { usePaged } from "@/lib/api/hooks";
import { usePlanOptions } from "@/lib/api/reference";
import type { SubscriptionListItem, SubscriptionStatus } from "@/lib/api/types";
import { useListState } from "@/lib/use-list-state";

const SORTS = [
  { value: "-created_at", label: "Newest first" },
  { value: "next_invoice_date", label: "Next invoice (soonest)" },
  { value: "end_date", label: "Expiry (soonest)" },
  { value: "-amount_total", label: "Highest value" },
  { value: "number", label: "Number" },
];

export function SubscriptionList({
  statuses,
  defaultStatus,
  emptyTitle,
  emptyDescription,
  showLifecycleFilters,
}: {
  statuses: { value: SubscriptionStatus | ""; label: string }[];
  defaultStatus: SubscriptionStatus | "";
  emptyTitle: string;
  emptyDescription: string;
  showLifecycleFilters?: boolean;
}) {
  const list = useListState(["status", "plan_id", "sort", "expired", "paused"] as const, { status: defaultStatus });
  const plans = usePlanOptions();
  // "all" is the tab value for no status filter; the URL default comes from `defaultStatus`.
  const status = list.filters.status === "all" ? "" : list.filters.status;
  const query = usePaged<SubscriptionListItem>("subscriptions", "/subscriptions", {
    page: list.page,
    page_size: list.pageSize,
    q: list.q,
    status: status || undefined,
    plan_id: list.filters.plan_id,
    sort: list.filters.sort,
    expired: list.filters.expired,
    paused: list.filters.paused,
  });

  return (
    <div className="space-y-4">
      <SegmentedFilter
        label="Subscription status"
        value={list.filters.status || "all"}
        onChange={(v) => list.setFilter("status", v)}
        options={statuses.map((s) => ({ value: s.value || "all", label: s.label }))}
      />
      <TableToolbar>
        <SearchInput value={list.q} onChange={list.setSearch} placeholder="Number, customer or email…" />
        <FilterSelect
          label="Plan"
          value={list.filters.plan_id}
          onChange={(v) => list.setFilter("plan_id", v)}
          options={(plans.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
        />
        {showLifecycleFilters ? (
          <>
            <FilterSelect
              label="Expiry"
              value={list.filters.expired}
              onChange={(v) => list.setFilter("expired", v)}
              options={[
                { value: "true", label: "Expired (needs renewal)" },
                { value: "false", label: "Within term" },
              ]}
            />
            <FilterSelect
              label="Paused"
              value={list.filters.paused}
              onChange={(v) => list.setFilter("paused", v)}
              options={[
                { value: "true", label: "Paused" },
                { value: "false", label: "Running" },
              ]}
            />
          </>
        ) : null}
        <FilterSelect label="Sort" allLabel="Default" value={list.filters.sort} onChange={(v) => list.setFilter("sort", v)} options={SORTS} />
      </TableToolbar>
      <DataTable
        caption="Subscriptions"
        columns={subscriptionColumns("/console")}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        rowHref={(row) => `/console/subscriptions/${row.id}`}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            icon={Repeat}
            title={emptyTitle}
            description={emptyDescription}
            action={
              <Can permission="subscription.write">
                <Button size="sm" asChild>
                  <Link href="/console/subscriptions/new">
                    <Plus /> New quotation
                  </Link>
                </Button>
              </Can>
            }
          />
        }
      />
    </div>
  );
}
