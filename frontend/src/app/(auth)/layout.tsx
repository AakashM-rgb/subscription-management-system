import { CheckCircle2 } from "lucide-react";

import { BrandName } from "@/components/brand";

const HIGHLIGHTS = [
  "Plans, quotations and subscriptions in one place",
  "Invoices generated automatically on billing day",
  "Payments matched to invoices, overdue ones flagged",
  "Live revenue, outstanding and overdue reporting",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute -top-32 -right-24 size-[28rem] rounded-full bg-indigo-500/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 size-[24rem] rounded-full bg-sky-500/15 blur-3xl"
          aria-hidden
        />
        <BrandName tone="light" className="relative" />
        <div className="relative mt-auto max-w-md space-y-6">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-white">
            The billing backbone for a business that earns every month.
          </h2>
          <ul className="space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-sidebar-foreground/90">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-indigo-300" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-10 text-xs text-sidebar-muted">© Brightloop Software</p>
      </aside>
      <main id="main" className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <BrandName className="mb-8 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
