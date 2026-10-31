"use client";

import {
  BadgePercent,
  CheckCircle2,
  FileCheck2,
  Pencil,
  PauseCircle,
  PlayCircle,
  ReceiptText,
  RefreshCcw,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import type { Body } from "@/lib/api/contract";
import { useApiMutation } from "@/lib/api/hooks";
import { useDiscountOptions } from "@/lib/api/reference";
import type { BillingRun, Subscription } from "@/lib/api/types";
import { BILLING_PERIOD_UNIT, formatDate, formatMoney, formatRate, pluralize, todayISO } from "@/lib/format";

type Area = "console" | "portal";

interface ActionSpec {
  label: string;
  icon: LucideIcon;
  path: string;
  variant?: "default" | "outline" | "destructive";
  title: string;
  description: (s: Subscription) => React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  success: string;
}

const ACTIONS: Record<string, ActionSpec> = {
  send_quotation: {
    label: "Send quotation",
    icon: Send,
    path: "send-quotation",
    variant: "default",
    title: "Send this quotation?",
    description: (s) => (
      <p>
        The customer <strong className="text-foreground">{s.customer.name}</strong> will be able to review and accept it
        in the portal. Lines can still be edited until it is confirmed.
      </p>
    ),
    confirmLabel: "Send quotation",
    success: "Quotation sent",
  },
  confirm: {
    label: "Confirm",
    icon: CheckCircle2,
    path: "confirm",
    variant: "default",
    title: "Confirm this subscription?",
    description: (s) => (
      <p>
        Lines and prices will be locked. It becomes <strong className="text-foreground">Active</strong> on{" "}
        {formatDate(s.start_date)} and is then billed {pluralize(s.term_periods, BILLING_PERIOD_UNIT[s.plan.billing_period])} in
        total, {formatMoney(s.amount_total)} per period.
      </p>
    ),
    confirmLabel: "Confirm subscription",
    success: "Subscription confirmed",
  },
  accept: {
    label: "Accept quotation",
    icon: FileCheck2,
    path: "accept",
    variant: "default",
    title: "Accept this quotation?",
    description: (s) => (
      <p>
        You agree to {formatMoney(s.amount_total)} per {BILLING_PERIOD_UNIT[s.plan.billing_period]} for{" "}
        {pluralize(s.term_periods, BILLING_PERIOD_UNIT[s.plan.billing_period])}, starting {formatDate(s.start_date)}. Invoices
        follow your payment terms ({s.payment_term.name}).
      </p>
    ),
    confirmLabel: "Accept quotation",
    success: "Quotation accepted",
  },
  pause: {
    label: "Pause",
    icon: PauseCircle,
    path: "pause",
    title: "Pause this subscription?",
    description: () => <p>No invoices are generated while it is paused. Billing continues from the next period after you resume.</p>,
    confirmLabel: "Pause subscription",
    success: "Subscription paused",
  },
  resume: {
    label: "Resume",
    icon: PlayCircle,
    path: "resume",
    variant: "default",
    title: "Resume this subscription?",
    description: () => <p>Billing restarts from the next billing period. Paused periods are not billed.</p>,
    confirmLabel: "Resume subscription",
    success: "Subscription resumed",
  },
  renew: {
    label: "Renew",
    icon: RefreshCcw,
    path: "renew",
    title: "Renew this subscription?",
    description: (s) => (
      <p>
        The term is extended by another {pluralize(s.term_periods, BILLING_PERIOD_UNIT[s.plan.billing_period])} from the current
        expiry date ({formatDate(s.end_date)}).
      </p>
    ),
    confirmLabel: "Renew subscription",
    success: "Subscription renewed",
  },
  bill_now: {
    label: "Bill now",
    icon: ReceiptText,
    path: "bill-now",
    title: "Generate invoices now?",
    description: () => (
      <p>
        Draft invoices are created for every billing period that is already due. Periods that were billed before are never
        billed twice.
      </p>
    ),
    confirmLabel: "Bill due periods",
    success: "Billing finished",
  },
};

export function SubscriptionActions({ subscription, area }: { subscription: Subscription; area: Area }) {
  const s = subscription;
  const base = area === "portal" ? `/portal/subscriptions/${s.id}` : `/subscriptions/${s.id}`;
  const actions = s.available_actions ?? [];
  const [pending, setPending] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);

  const invalidate = ["subscriptions", "invoices", "reports", "portal", "billing-runs", "customers"];
  const transition = useApiMutation<{ path: string; body?: unknown; success: string }, Subscription | BillingRun>({
    mutationFn: ({ path, body }) => api.post(`${base}/${path}`, body),
    invalidate,
    success: (result, vars) =>
      vars.path === "bill-now" && "invoices_created" in result
        ? result.invoices_created > 0
          ? `${pluralize(result.invoices_created, "invoice")} created`
          : "Nothing was due — no invoices created"
        : vars.success,
  });

  const spec = pending ? ACTIONS[pending] : null;
  const primaryOrder = ["accept", "send_quotation", "confirm", "resume", "bill_now", "renew", "pause"];

  return (
    <>
      {area === "console" && actions.includes("edit") ? (
        <Button variant="outline" asChild>
          <Link href={`/console/subscriptions/${s.id}/edit`}>
            <Pencil /> Edit
          </Link>
        </Button>
      ) : null}
      {area === "console" && actions.includes("set_discount") ? (
        <Button variant="outline" onClick={() => setDiscountOpen(true)}>
          <BadgePercent /> {s.discount ? "Change discount" : "Add discount"}
        </Button>
      ) : null}
      {primaryOrder
        .filter((a) => actions.includes(a) && ACTIONS[a])
        .map((a) => {
          const action = ACTIONS[a];
          return (
            <Button key={a} variant={action.variant ?? "outline"} onClick={() => setPending(a)}>
              <action.icon /> {action.label}
            </Button>
          );
        })}
      {actions.includes("close") ? (
        <Button variant="destructive" onClick={() => setCloseOpen(true)}>
          <XCircle /> Close
        </Button>
      ) : null}

      {spec ? (
        <ConfirmDialog
          open={pending !== null}
          onOpenChange={(open) => (!open ? setPending(null) : undefined)}
          title={spec.title}
          description={spec.description(s)}
          confirmLabel={spec.confirmLabel}
          destructive={spec.destructive}
          onConfirm={() => transition.mutateAsync({ path: spec.path, success: spec.success })}
        />
      ) : null}
      <CloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        subscription={s}
        onConfirm={(reason) => transition.mutateAsync({ path: "close", body: (reason ? { reason } : {}) satisfies Body<"CloseIn">, success: "Subscription closed" })}
      />
      {area === "console" ? <DiscountDialog open={discountOpen} onOpenChange={setDiscountOpen} subscription={s} /> : null}
    </>
  );
}

function CloseDialog({
  open,
  onOpenChange,
  subscription,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const early = subscription.status === "active" && !subscription.is_expired;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
      title={`Close ${subscription.number}?`}
      description={
        early ? (
          <p>
            The subscription ends now, before its expiry date of {formatDate(subscription.end_date)}. No further invoices will be
            generated. Invoices already issued stay payable.
          </p>
        ) : (
          <p>No further invoices will be generated. Invoices already issued stay payable.</p>
        )
      }
      body={
        <div className="space-y-1.5">
          <Label htmlFor="close-reason">Reason (optional)</Label>
          <Textarea
            id="close-reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: customer moved to another plan"
          />
        </div>
      }
      confirmLabel="Close subscription"
      destructive
      onConfirm={() => onConfirm(reason.trim())}
    />
  );
}

const NO_DISCOUNT = "none";

function DiscountDialog({
  open,
  onOpenChange,
  subscription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription;
}) {
  const discounts = useDiscountOptions({ usable_on_date: todayISO() });
  const [selected, setSelected] = useState<string>(subscription.discount ? String(subscription.discount.id) : NO_DISCOUNT);
  const mutation = useApiMutation<void, Subscription>({
    mutationFn: () =>
      api.put<Subscription>(`/subscriptions/${subscription.id}/discount`, {
        discount_id: selected === NO_DISCOUNT ? null : Number(selected),
      } satisfies Body<"DiscountAttachIn">),
    invalidate: ["subscriptions"],
    success: selected === NO_DISCOUNT ? "Discount removed" : "Discount attached",
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Subscription discount"
      description={
        <p>
          One discount rule can be attached. It applies to every future invoice automatically while the rule is valid and has
          uses left; it is never applied twice.
        </p>
      }
      body={
        <div className="space-y-1.5">
          <Label htmlFor="discount-select">Discount rule</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="discount-select" className="w-full">
              <SelectValue placeholder="Choose a discount" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DISCOUNT}>No discount</SelectItem>
              {(discounts.data ?? []).map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.name} — {d.kind === "percentage" ? formatRate(d.value) : formatMoney(d.value)} off
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {discounts.error ? <p className="text-xs text-destructive">Discount rules could not be loaded.</p> : null}
        </div>
      }
      confirmLabel="Save discount"
      onConfirm={() => mutation.mutateAsync()}
    />
  );
}
