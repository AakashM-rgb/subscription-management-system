import { decodeJwt } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "bl_session";

/**
 * Optimistic routing only: sends signed-out visitors to /login and keeps customers and internal
 * users in their own area based on the (unverified) role claim. The server layouts re-check the
 * session against the backend, and the API enforces every permission itself.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? readClaims(token) : null;

  if (!claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/console") && claims.role === "customer") {
    return NextResponse.redirect(new URL("/portal", request.url));
  }
  if (pathname.startsWith("/portal") && claims.role !== "customer") {
    return NextResponse.redirect(new URL("/console", request.url));
  }
  return NextResponse.next();
}

function readClaims(token: string): { role: string } | null {
  try {
    const claims = decodeJwt(token);
    if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return null;
    return typeof claims.role === "string" ? { role: claims.role } : null;
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/console/:path*", "/portal/:path*"],
};
