import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  back,
  badges,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  badges?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-print="hide">
      <div className="min-w-0 space-y-1.5">
        {back ? (
          <Link
            href={back.href}
            className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {badges}
        </div>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl space-y-6", className)}>{children}</div>;
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0 shadow-xs", className)}>
      {title ? (
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b px-5 py-4 [.border-b]:pb-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">
              <h2 className="leading-snug">{title}</h2>
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("px-5 py-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "danger";
  href?: string;
}) {
  const toneClass = {
    default: "bg-indigo-50 text-indigo-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
  }[tone];
  const body = (
    <Card className="h-full gap-0 py-0 shadow-xs transition-colors hover:border-indigo-200">
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="tabular truncate text-2xl font-semibold tracking-tight">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", toneClass)}>
            <Icon className="size-5" aria-hidden />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Two-column label/value list for detail pages. */
export function DetailList({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode; hidden?: boolean }[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {items
        .filter((item) => !item.hidden)
        .map((item) => (
          <div key={item.label} className="min-w-0 space-y-1">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{item.label}</dt>
            <dd className="text-sm break-words text-foreground">{item.value}</dd>
          </div>
        ))}
    </dl>
  );
}

export function Money({ value, className }: { value: ReactNode; className?: string }) {
  return <span className={cn("tabular font-medium", className)}>{value}</span>;
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {children}
    </Link>
  );
}
