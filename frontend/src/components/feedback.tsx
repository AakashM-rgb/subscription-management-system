"use client";

import { AlertTriangle, CloudOff, Construction, Inbox, Lock, RefreshCw, SearchX } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface StateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

function StatePanel({ icon: Icon = Inbox, title, description, action, className, compact }: StateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="max-w-md space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <StatePanel {...props} />;
}

export function NoResults({ onClear, compact }: { onClear?: () => void; compact?: boolean }) {
  return (
    <StatePanel
      icon={SearchX}
      compact={compact}
      title="No results match these filters"
      description="Try a different search or clear the filters."
      action={
        onClear ? (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        ) : null
      }
    />
  );
}

/** Renders the right message for any query error, including endpoints the server does not have yet. */
export function ErrorState({
  error,
  onRetry,
  compact,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}) {
  if (error instanceof ApiError && error.isUnavailable) {
    return (
      <StatePanel
        icon={Construction}
        compact={compact}
        className={className}
        title="Not available yet"
        description="The connected server does not provide this feature yet. It will appear here automatically once the backend module is deployed."
      />
    );
  }
  if (error instanceof ApiError && error.status === 403) {
    return (
      <StatePanel
        icon={Lock}
        compact={compact}
        className={className}
        title="You don't have access"
        description="Your role does not include this area. Ask an administrator if you need access."
      />
    );
  }
  if (error instanceof ApiError && error.isInvalidPath) {
    return (
      <StatePanel icon={SearchX} compact={compact} className={className} title="Not found" description="This link doesn't point to a record that exists." />
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <StatePanel icon={SearchX} compact={compact} className={className} title="Not found" description={error.message} />
    );
  }
  const network = error instanceof ApiError && error.isNetwork;
  return (
    <StatePanel
      icon={network ? CloudOff : AlertTriangle}
      compact={compact}
      className={className}
      title={network ? "Can't reach the server" : "Something went wrong"}
      description={errorMessage(error)}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw /> Try again
          </Button>
        ) : null
      }
    />
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-32" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

export function InlineSpinner({ className }: { className?: string }) {
  return <RefreshCw className={cn("size-3.5 animate-spin text-muted-foreground", className)} aria-hidden />;
}
