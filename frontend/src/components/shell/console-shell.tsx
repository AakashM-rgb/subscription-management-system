"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { BrandName } from "@/components/brand";
import { SessionProvider } from "@/components/session";
import { isActive, navForRole } from "@/components/shell/nav-config";
import { UserMenu } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Me } from "@/lib/api/types";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function SidebarNav({ user, onNavigate }: { user: Me; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {navForRole(user.role).map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      active
                        ? "bg-sidebar-accent text-white"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
                    )}
                  >
                    <item.icon className={cn("size-4 shrink-0", active ? "text-sidebar-primary" : "opacity-80")} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarContents({ user, onNavigate }: { user: Me; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center px-5">
        <Link href="/console" onClick={onNavigate} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <BrandName tone="light" />
        </Link>
      </div>
      <SidebarNav user={user} onNavigate={onNavigate} />
      <div className="border-t border-sidebar-border p-3">
        <UserMenu variant="dark" accountHref="/console/account" />
      </div>
    </div>
  );
}

export function ConsoleShell({ user, children }: { user: Me; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SessionProvider user={user}>
      <div className="min-h-dvh lg:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block" data-print="hide">
          <SidebarContents user={user} />
        </aside>

        <header
          className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:hidden"
          data-print="hide"
        >
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Link href="/console" className="rounded-lg">
            <BrandName />
          </Link>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {ROLE_LABEL[user.role]}
          </span>
        </header>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 border-none p-0" showCloseButton={false}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
            <SidebarContents user={user} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <main id="main" tabIndex={-1} className="px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </SessionProvider>
  );
}
