"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandName } from "@/components/brand";
import { SessionProvider } from "@/components/session";
import { PORTAL_NAV, isActive } from "@/components/shell/nav-config";
import { UserMenu } from "@/components/shell/user-menu";
import type { Me } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function PortalShell({ user, children }: { user: Me; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <SessionProvider user={user}>
      <div className="flex min-h-dvh flex-col pb-16 lg:pb-0">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur" data-print="hide">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
            <Link href="/portal" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <BrandName />
            </Link>
            <nav aria-label="Portal" className="hidden flex-1 lg:block">
              <ul className="flex items-center gap-1">
                {PORTAL_NAV.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="ml-auto w-56">
              <UserMenu accountHref="/portal/profile" />
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8">
          {children}
        </main>

        <nav
          aria-label="Portal"
          className="fixed inset-x-0 bottom-0 z-20 border-t bg-background lg:hidden"
          data-print="hide"
        >
          <ul className="grid grid-cols-6">
            {PORTAL_NAV.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium outline-none focus-visible:bg-muted",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <item.icon className="size-5" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </SessionProvider>
  );
}
