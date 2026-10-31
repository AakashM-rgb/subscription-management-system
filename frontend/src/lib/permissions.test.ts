import { describe, expect, it } from "vitest";

import { CONSOLE_NAV, navForRole } from "@/components/shell/nav-config";
import { can, homeFor, safeNextPath } from "@/lib/permissions";

describe("role permissions mirror the backend contract", () => {
  it("only admins manage catalog, taxes, discounts, staff and billing runs", () => {
    for (const p of ["catalog.write", "tax.write", "discount.write", "staff.manage", "billing.run", "payment.void"] as const) {
      expect(can("admin", p)).toBe(true);
      expect(can("staff", p)).toBe(false);
      expect(can("customer", p)).toBe(false);
    }
  });

  it("staff handle day-to-day work", () => {
    for (const p of ["customer.write", "subscription.write", "invoice.act", "payment.record", "reports.read"] as const) {
      expect(can("staff", p)).toBe(true);
      expect(can("customer", p)).toBe(false);
    }
  });

  it("denies everything without a role", () => {
    expect(can(null, "reports.read")).toBe(false);
  });
});

describe("navigation is filtered by role", () => {
  const hrefs = (role: "admin" | "staff" | "customer") => navForRole(role).flatMap((g) => g.items.map((i) => i.href));

  it("admins see every console item", () => {
    expect(hrefs("admin")).toHaveLength(CONSOLE_NAV.flatMap((g) => g.items).length);
  });

  it("staff do not see staff management", () => {
    expect(hrefs("staff")).not.toContain("/console/settings/staff");
    expect(hrefs("staff")).toContain("/console/invoices");
  });

  it("customers get no console items beyond the dashboard", () => {
    expect(hrefs("customer")).toEqual(["/console"]);
  });
});

describe("post-login redirects", () => {
  it("sends each role to its own area", () => {
    expect(homeFor("customer")).toBe("/portal");
    expect(homeFor("staff")).toBe("/console");
  });

  it("keeps a safe same-area destination", () => {
    expect(safeNextPath("/console/invoices?status=draft", "admin")).toBe("/console/invoices?status=draft");
    expect(safeNextPath("/portal/invoices/4", "customer")).toBe("/portal/invoices/4");
  });

  it("blocks open redirects and cross-area destinations", () => {
    expect(safeNextPath("https://evil.example", "admin")).toBe("/console");
    expect(safeNextPath("//evil.example", "admin")).toBe("/console");
    expect(safeNextPath("/\\evil.example", "admin")).toBe("/console");
    expect(safeNextPath("/console", "customer")).toBe("/portal");
    expect(safeNextPath("/portal", "staff")).toBe("/console");
    expect(safeNextPath("/api/v1/users", "admin")).toBe("/console");
  });
});
