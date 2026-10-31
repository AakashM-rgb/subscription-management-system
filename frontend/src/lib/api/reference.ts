"use client";

import { useAllPages } from "@/lib/api/hooks";
import type { Customer, Discount, PaymentTerm, Plan, Product, Tax } from "@/lib/api/types";
import { BILLING_PERIOD_LABEL, formatMoney, formatRate } from "@/lib/format";

/** Small reference lists used by pickers. Cached for a minute and refreshed on related mutations. */
export const useTaxOptions = (activeOnly = true) =>
  useAllPages<Tax>("taxes", "/taxes", activeOnly ? { is_active: true } : {});

export const usePaymentTermOptions = () =>
  useAllPages<PaymentTerm>("payment-terms", "/payment-terms", { is_active: true });

export const usePlanOptions = (params: { available_on?: string } = {}) =>
  useAllPages<Plan>("plans", "/plans", { is_active: true, ...params });

export const useProductOptions = () => useAllPages<Product>("products", "/products", { is_active: true });

export const useCustomerOptions = () => useAllPages<Customer>("customers", "/customers", { is_active: true });

export const useDiscountOptions = (params: { scope?: string; usable_on_date?: string } = {}) =>
  useAllPages<Discount>("discounts", "/discounts", { is_active: true, ...params });

export const taxOption = (tax: Tax) => ({ value: String(tax.id), label: `${tax.name} (${formatRate(tax.rate)})` });
export const termOption = (term: PaymentTerm) => ({
  value: String(term.id),
  label: term.due_days === 0 ? `${term.name} (due immediately)` : `${term.name} (${term.due_days} days)`,
});
export const planOption = (plan: Plan) => ({
  value: String(plan.id),
  label: `${plan.name} · ${formatMoney(plan.price)} / ${BILLING_PERIOD_LABEL[plan.billing_period].toLowerCase()}`,
});
export const customerOption = (customer: Customer) => ({
  value: String(customer.id),
  label: customer.company_name ? `${customer.name} — ${customer.company_name}` : `${customer.name} (${customer.email})`,
});
