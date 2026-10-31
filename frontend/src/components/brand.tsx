import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-indigo-600" />
      <path
        d="M10 21.5c0-3 2.2-5.5 5.6-5.5h3.1c1.8 0 3.3-1.4 3.3-3.2S20.5 9.5 18.7 9.5H10"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="10" cy="21.5" r="2.2" fill="white" />
    </svg>
  );
}

export function BrandName({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="leading-tight">
        <span className={cn("block text-sm font-semibold", tone === "light" ? "text-white" : "text-foreground")}>
          Brightloop
        </span>
        <span className={cn("block text-xs", tone === "light" ? "text-sidebar-muted" : "text-muted-foreground")}>
          Billing
        </span>
      </span>
    </span>
  );
}
