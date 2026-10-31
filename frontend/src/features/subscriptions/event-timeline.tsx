"use client";

import {
  Ban,
  CheckCircle2,
  CircleDot,
  FilePlus2,
  PauseCircle,
  PlayCircle,
  ReceiptText,
  RefreshCcw,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { AuditEvent } from "@/lib/api/types";
import { formatDateTime, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  created: { icon: FilePlus2, tone: "text-slate-600 bg-slate-100" },
  quotation_sent: { icon: Send, tone: "text-sky-700 bg-sky-50" },
  sent: { icon: Send, tone: "text-sky-700 bg-sky-50" },
  accepted: { icon: CheckCircle2, tone: "text-indigo-700 bg-indigo-50" },
  confirmed: { icon: CheckCircle2, tone: "text-indigo-700 bg-indigo-50" },
  activated: { icon: PlayCircle, tone: "text-emerald-700 bg-emerald-50" },
  paused: { icon: PauseCircle, tone: "text-amber-700 bg-amber-50" },
  resumed: { icon: PlayCircle, tone: "text-emerald-700 bg-emerald-50" },
  renewed: { icon: RefreshCcw, tone: "text-indigo-700 bg-indigo-50" },
  expired: { icon: XCircle, tone: "text-amber-700 bg-amber-50" },
  closed: { icon: XCircle, tone: "text-zinc-600 bg-zinc-100" },
  billed: { icon: ReceiptText, tone: "text-indigo-700 bg-indigo-50" },
  invoiced: { icon: ReceiptText, tone: "text-indigo-700 bg-indigo-50" },
  cancelled: { icon: Ban, tone: "text-rose-700 bg-rose-50" },
};

function actionKey(action: string): string {
  const verb = action.split(".").pop() ?? action;
  return verb.toLowerCase();
}

function describe(event: AuditEvent): string {
  const [entity, verb] = event.action.includes(".") ? event.action.split(".", 2) : ["", event.action];
  const text = humanize(verb);
  return entity && entity !== "subscription" ? `${humanize(entity)} ${text.toLowerCase()}` : text;
}

function details(data: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === null || value === undefined || typeof value === "object") continue;
    parts.push(`${humanize(key)}: ${String(value)}`);
    if (parts.length >= 4) break;
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Audit history, newest first. Pause, resume, renew and close events are highlighted. */
export function EventTimeline({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[17px] before:w-px before:bg-border">
      {events.map((event) => {
        const spec = ICONS[actionKey(event.action)] ?? { icon: CircleDot, tone: "text-slate-600 bg-slate-100" };
        const extra = details(event.data);
        return (
          <li key={event.id} className="relative flex gap-3">
            <span className={cn("relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full ring-4 ring-card", spec.tone)}>
              <spec.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium">{describe(event)}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(event.created_at)} ·{" "}
                {event.actor_name ?? (event.actor_type === "system" ? "Automatic" : humanize(event.actor_type))}
              </p>
              {extra ? <p className="mt-1 text-xs text-muted-foreground">{extra}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
