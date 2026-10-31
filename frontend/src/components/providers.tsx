"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/client";

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (!pathname.startsWith("/console") && !pathname.startsWith("/portal")) return;
  // A full navigation (not router.push) drops all cached data from the expired session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(pathname + search)}&expired=1`);
}

function onAnyError(error: unknown) {
  // INVALID_CREDENTIALS is a wrong password in a form (login, password change), not an expired session.
  if (error instanceof ApiError && error.status === 401 && error.code !== "INVALID_CREDENTIALS") redirectToLogin();
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: onAnyError }),
    mutationCache: new MutationCache({ onError: onAnyError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) return failureCount < 2;
          return false;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster position="top-right" richColors={false} closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
