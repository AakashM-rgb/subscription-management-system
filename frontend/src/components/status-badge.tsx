import {
  AlertCircle,
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  FileText,
  Loader2,
  PauseCircle,
  PlayCircle,
  Send,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";

import { humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "primary" | "success" | "warning" | "danger" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  primary: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-rose-50 text-rose-800 ring-rose-200",
  muted: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

interface BadgeSpec {
  label: string;
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
}

/** Every status in the app is shown with text and an icon, never colour alone. */
const SPECS: Record<string, Record<string, BadgeSpec>> = {
  subscription: {
    draft: { label: "Draft", tone: "neutral", icon: CircleDashed },
    quotation: { label: "Quotation", tone: "info", icon: Send },
    confirmed: { label: "Confirmed", tone: "primary", icon: CheckCircle2 },
    active: { label: "Active", tone: "success", icon: PlayCircle },
    closed: { label: "Closed", tone: "muted", icon: XCircle },
  },
  invoice: {
    draft: { label: "Draft", tone: "neutral", icon: FileText },
    confirmed: { label: "Confirmed", tone: "info", icon: CheckCircle2 },
    paid: { label: "Paid", tone: "success", icon: CheckCircle2 },
    cancelled: { label: "Cancelled", tone: "danger", icon: Ban },
  },
  payment_state: {
    unpaid: { label: "Unpaid", tone: "warning", icon: Clock },
    partially_paid: { label: "Partially paid", tone: "info", icon: CircleDot },
    paid: { label: "Paid", tone: "success", icon: CheckCircle2 },
  },
  collection: {
    none: { label: "Manual collection", tone: "neutral", icon: CircleDashed },
    pending: { label: "Collection pending", tone: "info", icon: Loader2 },
    failed: { label: "Payment failed", tone: "danger", icon: AlertCircle },
    succeeded: { label: "Collected", tone: "success", icon: CheckCircle2 },
  },
  payment: {
    posted: { label: "Posted", tone: "success", icon: CheckCircle2 },
    voided: { label: "Voided", tone: "danger", icon: Ban },
  },
  discount: {
    active: { label: "Active", tone: "success", icon: PlayCircle },
    scheduled: { label: "Scheduled", tone: "info", icon: Clock },
    expired: { label: "Expired", tone: "muted", icon: XCircle },
    exhausted: { label: "Used up", tone: "warning", icon: Ban },
    inactive: { label: "Inactive", tone: "muted", icon: CircleDashed },
  },
  run: {
    running: { label: "Running", tone: "info", icon: Loader2 },
    completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
    succeeded: { label: "Succeeded", tone: "success", icon: CheckCircle2 },
    success: { label: "Succeeded", tone: "success", icon: CheckCircle2 },
    completed_with_errors: { label: "Completed with errors", tone: "warning", icon: AlertCircle },
    partial: { label: "Partial", tone: "warning", icon: AlertCircle },
    failed: { label: "Failed", tone: "danger", icon: AlertCircle },
    error: { label: "Error", tone: "danger", icon: AlertCircle },
    skipped: { label: "Skipped", tone: "neutral", icon: CircleDashed },
    billed: { label: "Billed", tone: "success", icon: CheckCircle2 },
  },
  active: {
    true: { label: "Active", tone: "success", icon: CheckCircle2 },
    false: { label: "Inactive", tone: "muted", icon: CircleDashed },
  },
};

export type BadgeKind = keyof typeof SPECS;

export function StatusBadge({
  kind,
  value,
  className,
}: {
  kind: BadgeKind;
  value: string | boolean | null | undefined;
  className?: string;
}) {
  const key = String(value ?? "");
  const spec: BadgeSpec = SPECS[kind]?.[key] ?? { label: humanize(key), tone: "neutral", icon: CircleDot };
  return <Pill tone={spec.tone} icon={spec.icon} label={spec.label} className={className} />;
}

export function Pill({
  tone,
  icon: Icon,
  label,
  className,
}: {
  tone: Tone;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
      {label}
    </span>
  );
}

export function OverdueBadge({ days }: { days: number }) {
  return <Pill tone="danger" icon={AlertCircle} label={days > 0 ? `Overdue ${days}d` : "Overdue"} />;
}

export function PausedBadge() {
  return <Pill tone="warning" icon={PauseCircle} label="Paused" />;
}

export function ExpiredBadge() {
  return <Pill tone="warning" icon={Clock} label="Expired" />;
}
