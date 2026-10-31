import type { Role } from "@/lib/api/types";

/**
 * UI permission map mirroring the backend role rules in BACKEND_CONTRACT.md. It only decides what
 * the interface offers; the API enforces every rule independently (403 on violation).
 */
const PERMISSIONS = {
  "catalog.write": ["admin"],
  "tax.write": ["admin"],
  "paymentTerm.write": ["admin"],
  "discount.write": ["admin"],
  "staff.manage": ["admin"],
  "billing.run": ["admin"],
  "payment.void": ["admin"],
  "catalog.read": ["admin", "staff"],
  "customer.read": ["admin", "staff"],
  "customer.write": ["admin", "staff"],
  "template.write": ["admin", "staff"],
  "subscription.write": ["admin", "staff"],
  "invoice.act": ["admin", "staff"],
  "payment.record": ["admin", "staff"],
  "billing.read": ["admin", "staff"],
  "reports.read": ["admin", "staff"],
  "portal.use": ["customer"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function homeFor(role: Role): string {
  return role === "customer" ? "/portal" : "/console";
}

/** Only same-site relative paths are accepted as post-login destinations (no open redirects). */
export function safeNextPath(next: string | null | undefined, role: Role): string {
  const fallback = homeFor(role);
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  const area = next.startsWith("/portal") ? "customer" : next.startsWith("/console") ? "internal" : null;
  if (area === "customer" && role !== "customer") return fallback;
  if (area === "internal" && role === "customer") return fallback;
  if (!area) return fallback;
  return next;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff",
  customer: "Customer",
};
