"use client";

import { use } from "react";

import { ErrorState, PageSkeleton } from "@/components/feedback";
import { PageHeader } from "@/components/page";
import { OverdueBadge, StatusBadge } from "@/components/status-badge";
import { InvoiceActions } from "@/features/invoices/invoice-actions";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { useResource } from "@/lib/api/hooks";
import type { Invoice } from "@/lib/api/types";

export default function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useResource<Invoice>(["portal", "invoice", id], `/portal/invoices/${id}`);
  if (query.isPending) return <PageSkeleton />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const inv = query.data;
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/portal/invoices", label: "Invoices" }}
        title={<span className="tabular">{inv.number ?? `Invoice #${inv.id}`}</span>}
        badges={
          <>
            <StatusBadge kind="invoice" value={inv.status} />
            {inv.is_overdue ? <OverdueBadge days={inv.days_overdue} /> : null}
            {inv.collection_status === "failed" ? <StatusBadge kind="collection" value="failed" /> : null}
          </>
        }
        actions={<InvoiceActions invoice={inv} area="portal" />}
      />
      <InvoiceDocument invoice={inv} />
    </div>
  );
}
