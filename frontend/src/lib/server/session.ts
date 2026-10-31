import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { Me, Role } from "@/lib/api/types";
import { homeFor } from "@/lib/permissions";

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "bl_session";
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

export class BackendUnavailableError extends Error {
  constructor(message = "The application server is not reachable right now.") {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

/**
 * Authoritative session check: asks the backend who the cookie belongs to (it validates the
 * signature, expiry, token version and active flag). Deduplicated per request with React cache.
 */
export const getSessionUser = cache(async (): Promise<Me | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/v1/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}`, accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new BackendUnavailableError();
  }
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new BackendUnavailableError(`Session check failed (HTTP ${response.status}).`);
  return (await response.json()) as Me;
});

/** Redirects to login (or the user's own area) unless the session user has one of `roles`. */
export async function requireRole(roles: Role[], currentPath: string): Promise<Me> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
