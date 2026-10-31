import type { BillingPeriod } from "@/lib/api/types";

/** Business defaults from the backend config (CURRENCY=INR, BUSINESS_TIMEZONE=Asia/Kolkata). */
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "INR";
export const LOCALE = process.env.NEXT_PUBLIC_LOCALE ?? "en-IN";
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE ?? "Asia/Kolkata";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats a decimal string for display only. Money is never calculated in the browser; this
 * converts the server's exact value to a number solely to localise it.
 */
export function formatMoney(value: string | number | null | undefined, currency = CURRENCY): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return String(value);
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
}

/** "18.000" → "18%" ; "12.500" → "12.5%". */
export function formatRate(rate: string | number | null | undefined): string {
  if (rate === null || rate === undefined || rate === "") return "—";
  const value = Number(rate);
  if (!Number.isFinite(value)) return String(rate);
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 }).format(value)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(LOCALE).format(value);
}

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Date-only strings are formatted as calendar dates (parsed at UTC midnight and printed in UTC),
 * so "2026-10-31" never shifts to the 30th in a negative-offset browser.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  if (value.length > 10) return formatDateTime(value);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return dateFormatter.format(date);
}

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter.format(date);
}

/** Today's calendar date in the business time zone, as YYYY-MM-DD. */
export function todayISO(timeZone = TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Adds whole days to a YYYY-MM-DD string without time-zone drift. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export const BILLING_PERIOD_LABEL: Record<BillingPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const BILLING_PERIOD_UNIT: Record<BillingPeriod, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const text = value.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
