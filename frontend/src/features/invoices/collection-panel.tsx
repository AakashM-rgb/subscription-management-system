"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCw, Zap } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/feedback";
import { Section } from "@/components/page";
import { Pill, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/hooks";
import type { AttemptStatus, Invoice, PaymentAttempt } from "@/lib/api/types";
import { formatDateTime, formatMoney, humanize } from "@/lib/format";

const ATTEMPT_TONE: Record<AttemptStatus, "neutral" | "info" | "success" | "danger" | "muted"> = {
  created: "neutral",
  processing: "info",
  succeeded: "success",
  failed: "danger",
  cancelled: "muted",
};

/** Automatic collection: payment attempts, failures and the next retry, for staff. */
export function CollectionPanel({ invoice: inv }: { invoice: Invoice }) {
  const [confirming, setConfirming] = useState(false);
  const attempts = useQuery({
    queryKey: ["invoices", "attempts", inv.id],
    queryFn: () => api.get<PaymentAttempt[]>(`/invoices/${inv.id}/payment-attempts`),
  });
  const collect = useApiMutation<void, PaymentAttempt>({
    mutationFn: () => api.post<PaymentAttempt>(`/invoices/${inv.id}/collect`),
    invalidate: ["invoices"],
    success: (a) => (a.status === "succeeded" ? "Payment collected" : "Collection started — the result arrives from the payment provider shortly"),
  });
  const canCollect = inv.status === "confirmed" && Number(inv.amount_due) > 0 && inv.collection_status !== "pending";
  const latest = attempts.data?.[0];

  return (
    <Section
      title="Collection"
      description="Automatic charges against the customer's saved payment method, and their retries."
      actions={
        canCollect ? (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            {inv.collection_status === "failed" ? <RotateCw /> : <Zap />}
            {inv.collection_status === "failed" ? "Retry now" : "Collect now"}
          </Button>
        ) : null
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Status:</span>
        <StatusBadge kind="collection" value={inv.collection_status} />
        {latest?.next_retry_at && inv.collection_status === "failed" ? (
          <span className="text-muted-foreground">Next automatic retry {formatDateTime(latest.next_retry_at)}</span>
        ) : null}
      </div>
      {attempts.isPending ? (
        <TableSkeleton rows={2} columns={4} />
      ) : attempts.error ? (
        <ErrorState compact error={attempts.error} onRetry={() => attempts.refetch()} />
      ) : attempts.data.length === 0 ? (
        <EmptyState compact icon={Zap} title="No automatic attempts" description="This invoice is collected manually unless the customer has autopay set up." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {attempts.data.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Attempt {a.attempt_number} · {humanize(a.provider)}
                  {a.provider_reference ? <span className="ml-1 text-xs text-muted-foreground">({a.provider_reference})</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
                {a.failure_message ? (
                  <p className="text-xs text-destructive">
                    {a.failure_code ? `${a.failure_code}: ` : ""}
                    {a.failure_message}
                  </p>
                ) : null}
                {a.next_retry_at ? <p className="text-xs text-muted-foreground">Retry scheduled {formatDateTime(a.next_retry_at)}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular text-sm font-medium">{formatMoney(a.amount, inv.currency)}</span>
                <Pill tone={ATTEMPT_TONE[a.status] ?? "neutral"} label={humanize(a.status)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Charge ${formatMoney(inv.amount_due, inv.currency)} now?`}
        description={
          <p>
            The customer&apos;s active payment method is charged for the amount due. If they have no active autopay mandate, nothing is
            charged and you&apos;ll see why.
          </p>
        }
        confirmLabel="Charge now"
        onConfirm={() => collect.mutateAsync()}
      />
    </Section>
  );
}
