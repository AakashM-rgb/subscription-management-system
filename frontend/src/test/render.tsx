import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

import { SessionProvider } from "@/components/session";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Me, Role } from "@/lib/api/types";

export function me(role: Role = "admin"): Me {
  return { id: 1, email: "a@e2e.example.com", full_name: "Asha Admin", role, is_active: true, created_at: "2026-10-01T00:00:00Z", customer_id: role === "customer" ? 7 : null };
}

/** Renders with the app's real providers (query client, session, toasts). */
export function renderWithApp(ui: ReactElement, role: Role = "admin") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SessionProvider user={me(role)}>{ui}</SessionProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

type Route = { method?: string; path: string | RegExp; status?: number; body?: unknown };

/**
 * Stubs fetch with responses keyed by method + path (after /api/v1). Unmatched calls fail the test,
 * so a component can't silently call an endpoint the test didn't expect.
 */
export function mockApi(routes: Route[]) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, path: path + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes.find(
      (r) => (r.method ?? "GET") === method && (typeof r.path === "string" ? r.path === path : r.path.test(path)),
    );
    if (!route) throw new Error(`Unexpected API call: ${method} ${path}`);
    const status = route.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(route.body ?? {}), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}
