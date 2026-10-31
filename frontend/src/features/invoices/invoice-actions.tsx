"use client";

import { Ban, CheckCircle2, Mail, Printer, Wallet } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RecordPaymentDialog } from "@/features/payments/record-payment-dialog";
import { api } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useApiMutation } from "@/lib/api/hooks";
import type { Invoice } from "@/lib/api/types";
import { formatDate, formatMoney } from "@/lib/format";

const INVALIDATE = ["invoices", "subscriptions", "reports", "customers", "payments"];

/** Buttons come from the invoice's server-computed `available_actions`. */
export function InvoiceActions({ invoice: inv, area }: { invoice: Invoice; area: "console" | "portal" }) {
  const actions = inv.available_actions ?? [];
  const [dialog, setDialog] = useState<"confirm" | "cancel" | "send" | "pay" | null>(null);
  const [reason, setReason] = useState("");
  const [reissue, setReissue] = useState(false);

  const act = useApiMutation<{ path: string; body?: unknown; success: string }, Invoice>({
    mutationFn: ({ path, body }) => api.post<Invoice>(`/invoices/${inv.id}/${path}`, body),
    invalidate: INVALIDATE,
    success: (_, vars) => vars.success,
  });

  return (
    <>
      {area === "console" && actions.includes("confirm") ? (
        <Button onClick={() => setDialog("confirm")}>
          <CheckCircle2 /> Confirm invoice
        </Button>
      ) : null}
      {area === "console" && actions.includes("record_payment") ? (
        <Button onClick={() => setDialog("pay")}>
          <Wallet /> Record payment
        </Button>
      ) : null}
      {area === "console" && actions.includes("send") ? (
        <Button variant="outline" onClick={() => setDialog("send")}>
          <Mail /> {inv.sent_count > 0 ? "Send again" : "Send"}
        </Button>
      ) : null}
      {actions.includes("print") || area === "portal" ? (
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      ) : null}
      {area === "console" && actions.includes("cancel") ? (
        <Button variant="destructive" onClick={() => setDialog("cancel")}>
          <Ban /> Cancel invoice
        </Button>
      ) : null}

      <ConfirmDialog
        open={dialog === "confirm"}
        onOpenChange={(o) => setDialog(o ? "confirm" : null)}
        title="Confirm this invoice?"
        description={
          <p>
            It gets its permanent invoice number and a due date from the payment terms ({inv.payment_term_name}). The amounts are
            locked: {formatMoney(inv.amount_total, inv.currency)} for {formatDate(inv.period_start)} – {formatDate(inv.period_end)}.
          </p>
        }
        confirmLabel="Confirm invoice"
        onConfirm={() => act.mutateAsync({ path: "confirm", success: "Invoice confirmed" })}
      />
      <ConfirmDialog
        open={dialog === "send"}
        onOpenChange={(o) => setDialog(o ? "send" : null)}
        title={`Email invoice to ${inv.bill_to_email}?`}
        description={
          inv.sent_count > 0 ? (
            <p>This invoice was already sent {inv.sent_count} time(s). The customer will receive another copy.</p>
          ) : (
            <p>The customer receives the invoice by email with a link to view it in their portal.</p>
          )
        }
        confirmLabel="Send invoice"
        onConfirm={() => act.mutateAsync({ path: "send", success: "Invoice queued for email" })}
      />
      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => {
          if (!o) {
            setReason("");
            setReissue(false);
          }
          setDialog(o ? "cancel" : null);
        }}
        title={`Cancel ${inv.number ?? "this draft invoice"}?`}
        description={
          <p>
            A cancelled invoice can no longer be paid and any discount use is released. Cancel and re-issue to correct an invoice:
            a new draft is created for the same billing period, so the period is still billed exactly once.
          </p>
        }
        body={
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">Reason (required)</Label>
              <Textarea id="cancel-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="cancel-reissue" checked={reissue} onCheckedChange={(c) => setReissue(c === true)} />
              <Label htmlFor="cancel-reissue" className="font-normal">
                Re-issue a corrected draft for the same period
              </Label>
            </div>
          </div>
        }
        canConfirm={reason.trim().length > 0}
        confirmLabel={reissue ? "Cancel & re-issue" : "Cancel invoice"}
        destructive
        onConfirm={() =>
          act.mutateAsync({ path: "cancel", body: { reason: reason.trim(), reissue } satisfies Body<"CancelIn">, success: reissue ? "Invoice cancelled and re-issued" : "Invoice cancelled" })
        }
      />
      {area === "console" ? <RecordPaymentDialog open={dialog === "pay"} onOpenChange={(o) => setDialog(o ? "pay" : null)} invoice={inv} /> : null}
    </>
  );
}
