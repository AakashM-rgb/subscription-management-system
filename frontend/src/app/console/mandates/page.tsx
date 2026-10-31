"use client";

import { CreditCard } from "lucide-react";

import { DataTable, FilterSelect, SegmentedFilter, TableToolbar } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageBody, PageHeader } from "@/components/page";
import { mandateColumns } from "@/features/collections/mandates";
import { usePaged } from "@/lib/api/hooks";
import { useCustomerOptions } from "@/lib/api/reference";
import type { Mandate } from "@/lib/api/types";
import { useListState } from "@/lib/use-list-state";

export default function MandatesPage() {
  const list = useListState(["status", "customer_id"] as const);
  const customers = useCustomerOptions();
  const nameOf = (id: number) => customers.data?.find((c) => c.id === id)?.name ?? null;
  const query = usePaged<Mandate>("mandates", "/mandates", {
    page: list.page,
    page_size: list.pageSize,
    status: list.filters.status,
    customer_id: list.filters.customer_id,
  });

  return (
    <PageBody>
      <PageHeader
        title="Autopay mandates"
        description="Card and UPI authorisations customers gave for automatic collection. Revoked and failed mandates stay listed for the record."
      />
      <SegmentedFilter
        label="Mandate status"
        value={list.filters.status || "all"}
        onChange={(v) => list.setFilter("status", v === "all" ? "" : v)}
        options={[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "pending", label: "Awaiting bank" },
          { value: "paused", label: "Paused" },
          { value: "cancelled", label: "Revoked" },
          { value: "failed", label: "Failed" },
        ]}
      />
      <TableToolbar>
        <FilterSelect
          label="Customer"
          value={list.filters.customer_id}
          onChange={(v) => list.setFilter("customer_id", v)}
          options={(customers.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
        />
      </TableToolbar>
      <DataTable
        caption="Autopay mandates"
        columns={mandateColumns({ customerName: nameOf })}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            icon={CreditCard}
            title="No autopay mandates"
            description="When customers authorise card or UPI autopay in their portal, their mandates appear here."
          />
        }
      />
    </PageBody>
  );
}
