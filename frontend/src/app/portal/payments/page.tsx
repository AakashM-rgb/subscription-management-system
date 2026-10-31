"use client";

import { CreditCard } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageHeader } from "@/components/page";
import { paymentColumns } from "@/features/columns";
import { usePaged } from "@/lib/api/hooks";
import type { PortalPayment } from "@/lib/api/types";
import { useListState } from "@/lib/use-list-state";

export default function PortalPaymentsPage() {
  const list = useListState();
  const query = usePaged<PortalPayment>("portal", "/portal/payments", { page: list.page, page_size: list.pageSize });
  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Payments we have received from you and the invoices they settled." />
      <DataTable
        caption="Your payments"
        columns={paymentColumns("/portal")}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        empty={<EmptyState icon={CreditCard} title="No payments yet" />}
      />
    </div>
  );
}
