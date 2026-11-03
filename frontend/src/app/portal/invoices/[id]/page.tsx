"use client";

import { use } from "react";

import { ErrorState, PageSkeleton } from "@/components/feedback";
import { PageHeader } from "@/components/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OverdueBadge, StatusBadge } from "@/components/status-badge";
import { InvoiceActions } from "@/features/invoices/invoice-actions";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { useResource } from "@/lib/api/hooks";
import type { Invoice } from "@/lib/api/types";

export default function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // An automatic payment is confirmed by the bank later: refresh while it is pending.
  const query = useResource<Invoice>(["portal", "invoice", id], `/portal/invoices/${id}`, undefined, {
    refetchInterval: (q) => (q.state.data?.collection_status === "pending" ? 8_000 : false),
  });
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
      {inv.status === "confirmed" && inv.collection_status === "pending" ? (
        <Alert data-print="hide">
          <AlertTitle>Automatic payment in progress</AlertTitle>
          <AlertDescription>Your saved payment method is being charged. This invoice is marked paid only after your bank confirms the payment.</AlertDescription>
        </Alert>
      ) : null}
      {inv.status === "confirmed" && inv.collection_status === "failed" ? (
        <Alert variant="destructive" data-print="hide">
          <AlertTitle>Automatic payment failed</AlertTitle>
          <AlertDescription>We could not charge your saved payment method. We will retry automatically; you can also check your payment method in your profile.</AlertDescription>
        </Alert>
      ) : null}
      <InvoiceDocument invoice={inv} />
    </div>
  );
}
