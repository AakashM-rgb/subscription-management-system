"use client";

import { Receipt } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/feedback";
import { PageHeader } from "@/components/page";
import { invoiceColumns } from "@/features/columns";
import { usePaged } from "@/lib/api/hooks";
import type { InvoiceListItem } from "@/lib/api/types";
import { useListState } from "@/lib/use-list-state";

export default function PortalInvoicesPage() {
  const list = useListState();
  const query = usePaged<InvoiceListItem>("portal", "/portal/invoices", { page: list.page, page_size: list.pageSize });
  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description="Every invoice issued to you, what is paid and what is still due." />
      <DataTable
        caption="Your invoices"
        columns={invoiceColumns("/portal", { showCustomer: false })}
        data={query.data}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={{ page: list.page, pageSize: list.pageSize, onPageChange: list.setPage }}
        rowHref={(row) => `/portal/invoices/${row.id}`}
        empty={<EmptyState icon={Receipt} title="No invoices yet" description="Invoices appear here once your subscription is billed." />}
      />
    </div>
  );
}
