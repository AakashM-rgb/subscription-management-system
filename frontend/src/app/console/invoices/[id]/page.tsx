"use client";

import { AlertTriangle, Mail } from "lucide-react";
import { use } from "react";

import { ErrorState, PageSkeleton } from "@/components/feedback";
import { PageHeader, TextLink } from "@/components/page";
import { OverdueBadge, StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CollectionPanel } from "@/features/invoices/collection-panel";
import { InvoiceActions } from "@/features/invoices/invoice-actions";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { useResource } from "@/lib/api/hooks";
import type { Invoice } from "@/lib/api/types";
import { formatDateTime, formatMoney } from "@/lib/format";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // The provider confirms an automatic charge later (webhook): keep the page current while one is pending.
  const query = useResource<Invoice>(["invoices", "detail", id], `/invoices/${id}`, undefined, {
    refetchInterval: (q) => (q.state.data?.collection_status === "pending" ? 8_000 : false),
  });
  if (query.isPending) return <PageSkeleton />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const inv = query.data;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        back={{ href: "/console/invoices", label: "Invoices" }}
        title={<span className="tabular">{inv.number ?? `Draft invoice #${inv.id}`}</span>}
        badges={
          <>
            <StatusBadge kind="invoice" value={inv.status} />
            {inv.status === "confirmed" ? <StatusBadge kind="payment_state" value={inv.payment_state} /> : null}
            {inv.is_overdue ? <OverdueBadge days={inv.days_overdue} /> : null}
          </>
        }
        description={
          <>
            {inv.bill_to_name} · Subscription{" "}
            <TextLink href={`/console/subscriptions/${inv.subscription.id}`} className="font-normal underline">
              {inv.subscription.number}
            </TextLink>
          </>
        }
        actions={<InvoiceActions invoice={inv} area="console" />}
      />

      <div data-print="hide" className="space-y-3">
        {inv.is_overdue ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Overdue by {inv.days_overdue} day(s)</AlertTitle>
            <AlertDescription>{formatMoney(inv.amount_due, inv.currency)} is still outstanding. Chase the customer or record the payment once it arrives.</AlertDescription>
          </Alert>
        ) : null}
        {inv.status === "draft" ? (
          <Alert>
            <AlertTitle>Draft invoice</AlertTitle>
            <AlertDescription>Generated automatically from the subscription. Confirm it to assign the invoice number and make it payable.</AlertDescription>
          </Alert>
        ) : null}
        {inv.sent_at ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="size-3.5" aria-hidden /> Last emailed {formatDateTime(inv.sent_at)} ({inv.sent_count}×)
          </p>
        ) : null}
        {inv.replaces_invoice_id ? (
          <p className="text-xs text-muted-foreground">
            Re-issue of <TextLink href={`/console/invoices/${inv.replaces_invoice_id}`} className="underline">invoice #{inv.replaces_invoice_id}</TextLink>
          </p>
        ) : null}
      </div>

      <InvoiceDocument invoice={inv} />

      {inv.status === "confirmed" || inv.status === "paid" ? (
        <div data-print="hide">
          <CollectionPanel invoice={inv} />
        </div>
      ) : null}
    </div>
  );
}
