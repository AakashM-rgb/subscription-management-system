"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditCard, Loader2, Plus, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, TableSkeleton } from "@/components/feedback";
import { Section } from "@/components/page";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api, ApiError, errorMessage } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useApiMutation } from "@/lib/api/hooks";
import type { Mandate, MandateSetup, RazorpayCheckout } from "@/lib/api/types";
import { formatDate, formatMoney, humanize } from "@/lib/format";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment provider. Check your connection."));
    document.body.appendChild(script);
  });
}

/** Saved payment methods (autopay mandates). Charges happen automatically on each invoice. */
export function PaymentMethodsSection() {
  const methods = useQuery({
    queryKey: ["portal", "payment-methods"],
    queryFn: () => api.get<Mandate[]>("/portal/payment-methods"),
    retry: false,
    // A mandate waiting for the bank turns active (or fails) on its own: refresh while one is pending.
    refetchInterval: (q) => (q.state.data?.some((m) => m.status === "pending") ? 8_000 : false),
  });
  const [adding, setAdding] = useState(false);
  const [methodType, setMethodType] = useState<"card" | "upi">("upi");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Mandate | null>(null);

  const remove = useApiMutation<number, Mandate>({
    mutationFn: (id) => api.delete<Mandate>(`/portal/payment-methods/${id}`),
    invalidate: ["portal"],
    success: "Autopay method removed",
  });

  const unavailable =
    methods.error instanceof ApiError && (methods.error.isUnavailable || methods.error.code === "PROVIDER_NOT_CONFIGURED");

  async function startSetup() {
    setBusy(true);
    try {
      const setup = await api.post<MandateSetup>("/portal/payment-methods", { method_type: methodType } satisfies Body<"MandateStartIn">);
      const checkout = setup.checkout as RazorpayCheckout;
      if (checkout.provider !== "razorpay") throw new Error("This payment provider is not supported in the browser yet.");
      await loadCheckout();
      if (!window.Razorpay) throw new Error("The payment provider did not load.");
      const rzp = new window.Razorpay({
        key: checkout.key,
        order_id: checkout.order_id,
        customer_id: checkout.customer_id,
        recurring: checkout.recurring,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "Brightloop Software",
        description: "Authorise automatic payments",
        prefill: checkout.prefill,
        theme: { color: "#4f46e5" },
        handler: async (response: Record<string, string>) => {
          try {
            const mandate = await api.post<Mandate>(`/portal/payment-methods/${setup.mandate.id}/confirm`, {
              provider_response: {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              },
            } satisfies Body<"MandateConfirmIn">);
            // Only the backend's answer counts: a mandate can stay pending until the bank confirms it.
            if (mandate.status === "active") toast.success("Autopay is active. Future invoices are charged automatically.");
            else if (mandate.status === "pending") toast.info("Authorisation received. Autopay starts once your bank confirms the mandate.");
            else toast.error(`Autopay could not be set up (status: ${humanize(mandate.status)}).`);
          } catch (error) {
            toast.error(errorMessage(error));
          } finally {
            void methods.refetch();
          }
        },
        modal: { ondismiss: () => void methods.refetch() },
      });
      rzp.open();
      setAdding(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) toast.error(`${error.message}. Add a phone number to your profile first.`);
      else toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Autopay"
      description="Save a card or UPI mandate and your invoices are paid automatically on their due date."
      actions={
        !unavailable && !methods.isPending ? (
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus /> Add method
          </Button>
        ) : null
      }
    >
      {methods.isPending ? (
        <TableSkeleton rows={2} columns={3} />
      ) : unavailable ? (
        <EmptyState compact icon={CreditCard} title="Autopay not available" description="Automatic payments are not enabled yet. Pay invoices by your usual method." />
      ) : methods.error ? (
        <p className="text-sm text-destructive">{errorMessage(methods.error)}</p>
      ) : (
        <div className="space-y-4">
          {adding ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <RadioGroup value={methodType} onValueChange={(v) => setMethodType(v as "card" | "upi")} className="grid gap-2 sm:grid-cols-2" aria-label="Payment method type">
                <Label htmlFor="pm-upi" className="flex items-center gap-3 rounded-lg border bg-background p-3 font-normal">
                  <RadioGroupItem id="pm-upi" value="upi" />
                  <Smartphone className="size-4" aria-hidden /> UPI AutoPay
                </Label>
                <Label htmlFor="pm-card" className="flex items-center gap-3 rounded-lg border bg-background p-3 font-normal">
                  <RadioGroupItem id="pm-card" value="card" />
                  <CreditCard className="size-4" aria-hidden /> Card
                </Label>
              </RadioGroup>
              <Button onClick={startSetup} disabled={busy} aria-busy={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Continue to secure authorisation
              </Button>
            </div>
          ) : null}
          {methods.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved payment methods.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {methods.data.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-3">
                    {m.method_type === "upi" ? <Smartphone className="size-5 text-muted-foreground" aria-hidden /> : <CreditCard className="size-5 text-muted-foreground" aria-hidden />}
                    <div>
                      <p className="text-sm font-medium">{m.display_hint ?? humanize(m.method_type)}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.authorized_at ? `Authorised ${formatDate(m.authorized_at)}` : "Waiting for bank confirmation"}
                        {m.max_amount ? ` · up to ${formatMoney(m.max_amount)} per charge` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={m.status === "active" ? "success" : m.status === "pending" ? "info" : "warning"} label={humanize(m.status)} />
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.display_hint ?? m.method_type}`} onClick={() => setRemoving(m)}>
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => (!o ? setRemoving(null) : undefined)}
        title="Remove this payment method?"
        description="Automatic payments stop. Future invoices must be paid manually."
        confirmLabel="Remove"
        destructive
        onConfirm={() => (removing ? remove.mutateAsync(removing.id) : undefined)}
      />
    </Section>
  );
}
