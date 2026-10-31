"use client";

import { Table2 } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

import { Button } from "@/components/ui/button";
import { formatMoney, formatNumber, LOCALE } from "@/lib/format";

const BAR = "var(--chart-1)";

function compactMoney(value: number): string {
  return new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function monthLabel(period: string, granularity: "day" | "month"): string {
  const [y, m, d] = period.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return new Intl.DateTimeFormat(LOCALE, granularity === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
}

interface RevenueDatum {
  label: string;
  amount: number;
  raw: string;
  count: number;
}

function RevenueTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as RevenueDatum;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{d.label}</p>
      <p className="tabular">{formatMoney(d.raw)}</p>
      <p className="text-xs text-muted-foreground">{formatNumber(d.count)} payments</p>
    </div>
  );
}

/** Single-series revenue bars with a tooltip and an accessible table view. */
export function RevenueChart({
  data,
  granularity = "month",
}: {
  data: { period: string; amount: string; payments_count: number }[];
  granularity?: "day" | "month";
}) {
  const [asTable, setAsTable] = useState(false);
  const rows: RevenueDatum[] = data.map((p) => ({
    label: monthLabel(p.period, granularity),
    amount: Number(p.amount),
    raw: p.amount,
    count: p.payments_count,
  }));
  const total = data.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <figure className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <figcaption className="text-xs text-muted-foreground">
          Payments received per {granularity}. Total {formatMoney(total)} across {rows.length} {granularity}s.
        </figcaption>
        <Button variant="ghost" size="xs" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          <Table2 /> {asTable ? "Chart" : "Table"}
        </Button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Period</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Revenue</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Payments</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t">
                  <td className="px-3 py-1.5">{r.label}</td>
                  <td className="tabular px-3 py-1.5 text-right">{formatMoney(r.raw)}</td>
                  <td className="tabular px-3 py-1.5 text-right">{formatNumber(r.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64" role="img" aria-label={`Revenue bar chart, ${rows.length} ${granularity}s, total ${formatMoney(total)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={12} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                tickFormatter={(v: number) => compactMoney(v)}
              />
              <Tooltip cursor={{ fill: "var(--muted)" }} content={(props) => <RevenueTooltip {...(props as TooltipContentProps<number, string>)} />} />
              <Bar dataKey="amount" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

/** Horizontal magnitude bars in plain HTML: readable labels, values in text ink, no colour-only identity. */
export function BarList({
  items,
  format = (v) => formatNumber(v),
  caption,
}: {
  items: { label: string; value: number; hint?: string }[];
  format?: (value: number) => string;
  caption: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{item.label}</span>
              <span className="tabular text-foreground">
                {format(item.value)}
                {item.hint ? <span className="ml-1.5 text-xs text-muted-foreground">{item.hint}</span> : null}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted" aria-hidden>
              <div className="h-2 rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: BAR, minWidth: item.value > 0 ? 4 : 0 }} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
