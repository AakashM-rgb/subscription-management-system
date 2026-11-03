"use client";

import { CalendarClock, CalendarX2, Check, FileText, Repeat, Timer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DetailList, Section } from "@/components/page";
import { ExpiredBadge, PausedBadge, StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Subscription, SubscriptionLine, SubscriptionStatus } from "@/lib/api/types";
import {
  BILLING_PERIOD_LABEL,
  BILLING_PERIOD_UNIT,
  formatDate,
  formatDateTime,
  formatMoney,
  formatRate,
  pluralize,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS: { status: SubscriptionStatus; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "quotation", label: "Quotation" },
  { status: "confirmed", label: "Confirmed" },
  { status: "active", label: "Active" },
  { status: "closed", label: "Closed" },
];

export function LifecycleStepper({ status }: { status: SubscriptionStatus }) {
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="relative flex w-full items-center gap-1 overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Subscription lifecycle" tabIndex={0}>
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.status} className="flex flex-1 items-center gap-1 last:flex-none" aria-current={active ? "step" : undefined}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1",
                  done && "bg-primary text-primary-foreground ring-primary",
                  active && "bg-accent text-accent-foreground ring-2 ring-primary",
                  !done && !active && "bg-background text-muted-foreground ring-border",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
              </span>
              <span className={cn("text-sm whitespace-nowrap", active ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {step.label}
                {done ? <span className="sr-only"> (completed)</span> : null}
                {active ? <span className="sr-only"> (current)</span> : null}
              </span>
            </div>
            {index < STEPS.length - 1 ? (
              <span className={cn("mx-2 hidden h-px min-w-6 flex-1 sm:block", done ? "bg-primary" : "bg-border")} aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function AutomationTile({ icon: Icon, label, value, hint }: { icon: typeof Repeat; label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Billing automation status: what the billing engine will do next for this subscription. */
export function BillingAutomationPanel({ subscription: s, invoiceHref }: { subscription: Subscription; invoiceHref: (id: number) => string }) {
  const unit = BILLING_PERIOD_UNIT[s.plan.billing_period];
  let nextHint: ReactNode = "Generated automatically on this date";
  if (s.status === "closed") nextHint = "Closed — no further invoices";
  else if (s.is_paused) nextHint = "Paused — billing is on hold";
  else if (s.is_expired) nextHint = s.plan.renewable ? "Term ended — renew to continue billing" : "Term ended — not billed";
  else if (s.status !== "active") nextHint = `Billing starts when it becomes active on ${formatDate(s.start_date)}`;

  return (
    <Section title="Billing automation" description="Invoices are generated from this subscription automatically; nothing is billed twice or skipped.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AutomationTile
          icon={Repeat}
          label="Billing frequency"
          value={BILLING_PERIOD_LABEL[s.plan.billing_period]}
          hint={`${formatMoney(s.amount_total)} per ${unit}`}
        />
        <AutomationTile
          icon={CalendarClock}
          label="Next billing date"
          value={s.status === "closed" || s.is_paused ? "—" : formatDate(s.next_invoice_date)}
          hint={nextHint}
        />
        <AutomationTile
          icon={CalendarX2}
          label="Expiry date"
          value={formatDate(s.end_date)}
          hint={`${pluralize(s.term_periods, unit)} from ${formatDate(s.start_date)}${s.plan.auto_close ? " · closes automatically" : ""}`}
        />
        <AutomationTile
          icon={FileText}
          label="Last invoice"
          value={
            s.last_invoice ? (
              <Link href={invoiceHref(s.last_invoice.id)} className="text-primary hover:underline">
                {s.last_invoice.number ?? `Draft #${s.last_invoice.id}`}
              </Link>
            ) : (
              "None yet"
            )
          }
          hint={
            s.last_invoice ? (
              <span className="flex flex-wrap items-center gap-1">
                {formatDate(s.last_invoice.invoice_date)} · {formatMoney(s.last_invoice.amount_total)}
                <StatusBadge kind="invoice" value={s.last_invoice.status} className="h-5" />
              </span>
            ) : undefined
          }
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Timer className="size-3.5" aria-hidden /> Payment terms: {s.payment_term.name}
        </span>
        <span>Automatic collection: {s.auto_collect ? "On (saved payment method)" : "Off — paid manually"}</span>
        {s.is_paused && s.paused_at ? <span>Paused since {formatDateTime(s.paused_at)}</span> : null}
        {s.quotation_valid_until && (s.status === "draft" || s.status === "quotation") ? (
          <span>Quotation valid until {formatDate(s.quotation_valid_until)}</span>
        ) : null}
      </div>
    </Section>
  );
}

export function SubscriptionStatusBadges({ subscription: s }: { subscription: Subscription }) {
  return (
    <>
      <StatusBadge kind="subscription" value={s.status} />
      {s.is_paused ? <PausedBadge /> : null}
      {s.is_expired ? <ExpiredBadge /> : null}
    </>
  );
}

export function LinesTable({
  lines,
  totals,
  caption,
}: {
  lines: SubscriptionLine[];
  totals: { amount_untaxed: string; amount_discount: string; amount_tax: string; amount_total: string };
  caption: string;
}) {
  return (
    <div className="relative overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" tabIndex={0} role="region" aria-label={caption}>
      <Table className="min-w-[640px]">
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="px-5">Product</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead>Tax</TableHead>
            <TableHead className="text-right">Discount</TableHead>
            <TableHead className="pr-5 text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, index) => (
            <TableRow key={line.id ?? `line-${index}`}>
              <TableCell className="px-5">
                <p className="font-medium">{line.description}</p>
                <p className="text-xs text-muted-foreground">{line.line_type === "plan" ? "Plan seats" : "Product"}</p>
              </TableCell>
              <TableCell className="tabular text-right">{line.quantity}</TableCell>
              <TableCell className="tabular text-right">{formatMoney(line.unit_price)}</TableCell>
              <TableCell className="text-sm">
                {line.tax ? `${line.tax.name} (${formatRate(line.tax.rate)})` : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="tabular text-right text-sm">
                {Number(line.discount_amount) > 0 ? `−${formatMoney(line.discount_amount)}` : "—"}
              </TableCell>
              <TableCell className="tabular pr-5 text-right font-medium">{formatMoney(line.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="bg-transparent">
          <TotalsRows totals={totals} colSpan={5} />
        </TableFooter>
      </Table>
    </div>
  );
}

export function TotalsRows({
  totals,
  colSpan,
  totalLabel = "Total per period",
}: {
  totals: { amount_untaxed: string; amount_discount: string; amount_tax: string; amount_total: string };
  colSpan: number;
  totalLabel?: string;
}) {
  const rows: [string, string, boolean?][] = [
    ["Untaxed amount", formatMoney(totals.amount_untaxed)],
    ["Discount", Number(totals.amount_discount) > 0 ? `−${formatMoney(totals.amount_discount)}` : formatMoney(0)],
    ["Tax", formatMoney(totals.amount_tax)],
    [totalLabel, formatMoney(totals.amount_total), true],
  ];
  return (
    <>
      {rows.map(([label, value, strong]) => (
        <TableRow key={label} className="border-0 hover:bg-transparent">
          <TableCell colSpan={colSpan} className={cn("px-5 py-1.5 text-right text-sm", strong ? "pt-3 font-semibold" : "text-muted-foreground")}>
            {label}
          </TableCell>
          <TableCell className={cn("tabular py-1.5 pr-5 text-right", strong ? "pt-3 text-base font-semibold" : "text-sm")}>{value}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function SubscriptionSummary({ subscription: s, customerHref }: { subscription: Subscription; customerHref?: string }) {
  return (
    <DetailList
      columns={3}
      items={[
        {
          label: "Customer",
          value: customerHref ? (
            <Link href={customerHref} className="font-medium text-primary hover:underline">
              {s.customer.name}
            </Link>
          ) : (
            s.customer.name
          ),
        },
        { label: "Plan", value: `${s.plan.name} (${BILLING_PERIOD_LABEL[s.plan.billing_period]})` },
        { label: "Start date", value: formatDate(s.start_date) },
        { label: "Expiry date", value: formatDate(s.end_date) },
        { label: "Payment terms", value: s.payment_term.name },
        { label: "Discount", value: s.discount ? s.discount.name : "None" },
        { label: "Confirmed", value: formatDateTime(s.confirmed_at), hidden: !s.confirmed_at },
        { label: "Activated", value: formatDateTime(s.activated_at), hidden: !s.activated_at },
        { label: "Closed", value: `${formatDateTime(s.closed_at)}${s.close_reason ? ` — ${s.close_reason}` : ""}`, hidden: !s.closed_at },
        { label: "Notes", value: <span className="whitespace-pre-line">{s.notes}</span>, hidden: !s.notes },
      ]}
    />
  );
}
