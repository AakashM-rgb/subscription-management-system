import {
  BadgePercent,
  CalendarClock,
  ChartColumn,
  CircleUserRound,
  CreditCard,
  FileClock,
  FileSpreadsheet,
  FileText,
  HandCoins,
  LayoutDashboard,
  Layers,
  Package,
  Percent,
  Receipt,
  Repeat,
  ScrollText,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/api/types";
import { can, type Permission } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Exact match only (for index routes like /console). */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const CONSOLE_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/console", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/console/reports", label: "Reports", icon: ChartColumn, permission: "reports.read" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/console/customers", label: "Customers", icon: Users, permission: "customer.read" },
      { href: "/console/quotations", label: "Quotations", icon: ScrollText, permission: "subscription.write" },
      { href: "/console/subscriptions", label: "Subscriptions", icon: Repeat, permission: "subscription.write" },
      { href: "/console/quotation-templates", label: "Quote templates", icon: FileSpreadsheet, permission: "template.write" },
    ],
  },
  {
    label: "Billing",
    items: [
      { href: "/console/invoices", label: "Invoices", icon: FileText, permission: "invoice.act" },
      { href: "/console/receivables", label: "Outstanding & overdue", icon: FileClock, permission: "invoice.act" },
      { href: "/console/payments", label: "Payments", icon: Wallet, permission: "payment.record" },
      { href: "/console/mandates", label: "Autopay mandates", icon: CreditCard, permission: "invoice.act" },
      { href: "/console/billing", label: "Billing runs", icon: CalendarClock, permission: "billing.read" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/console/products", label: "Products", icon: Package, permission: "catalog.read" },
      { href: "/console/plans", label: "Plans", icon: Layers, permission: "catalog.read" },
      { href: "/console/discounts", label: "Discounts", icon: BadgePercent, permission: "catalog.read" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/console/settings/taxes", label: "Taxes", icon: Percent, permission: "catalog.read" },
      { href: "/console/settings/payment-terms", label: "Payment terms", icon: HandCoins, permission: "catalog.read" },
      { href: "/console/settings/staff", label: "Staff", icon: ShieldCheck, permission: "staff.manage" },
    ],
  },
];

export const PORTAL_NAV: NavItem[] = [
  { href: "/portal", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/portal/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/portal/quotations", label: "Quotations", icon: ScrollText },
  { href: "/portal/invoices", label: "Invoices", icon: Receipt },
  { href: "/portal/payments", label: "Payments", icon: CreditCard },
  { href: "/portal/profile", label: "Profile", icon: CircleUserRound },
];

export function navForRole(role: Role): NavGroup[] {
  return CONSOLE_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can(role, item.permission)),
  })).filter((group) => group.items.length > 0);
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
