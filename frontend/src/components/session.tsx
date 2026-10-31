"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { can, type Permission } from "@/lib/permissions";

const SessionContext = createContext<Me | null>(null);

/** The user comes from the server layout's authoritative /auth/me check. */
export function SessionProvider({ user, children }: { user: Me; children: ReactNode }) {
  return <SessionContext value={user}>{children}</SessionContext>;
}

export function useSession(): Me {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSession must be used inside SessionProvider");
  return user;
}

export function useCan(permission: Permission): boolean {
  return can(useSession().role, permission);
}

export function Can({ permission, children }: { permission: Permission; children: ReactNode }) {
  return useCan(permission) ? <>{children}</> : null;
}

export function useLogout() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const logout = useCallback(async () => {
    setPending(true);
    try {
      await api.post("/auth/logout");
    } catch {
      toast.error("Could not reach the server, signing out locally.");
    } finally {
      queryClient.clear();
      // A full navigation drops every client cache and re-runs the server session check.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
  }, [queryClient]);
  return { logout, pending };
}
