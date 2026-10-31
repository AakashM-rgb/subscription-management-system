/**
 * Response and request shapes from docs/BACKEND_CONTRACT.md (feat/backend-core @ 9e0ec6a).
 * Money and rates are decimal strings ("1560.00", "18.000"); dates are "YYYY-MM-DD".
 * Fields the contract does not pin down are optional so the UI renders whatever the server sends.
 */

export type Money = string;
export type ISODate = string;
export type ISODateTime = string;

export type Role = "admin" | "staff" | "customer";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ------------------------------------------------------------------ auth & users

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface Me extends User {
  customer_id: number | null;
}

// ------------------------------------------------------------------ customers & catalog

/** CustomerOut (feat/backend-business @ 5b8bfe7). */
export interface Customer {
  id: number;
  user_id: number | null;
  name: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  address: string | null;
  tax_id: string | null;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface CustomerBalance {
  customer_id: number;
  outstanding_amount: Money;
  overdue_amount: Money;
  overdue_count: number;
  open_invoice_count: number;
}

export interface Tax {
  id: number;
  name: string;
  rate: string;
  is_active: boolean;
}

export type TaxRef = Pick<Tax, "id" | "name" | "rate">;

export interface PaymentTerm {
  id: number;
  name: string;
  due_days: number;
  is_active: boolean;
}

export type ProductType = "service" | "goods";

export interface ProductVariant {
  id: number;
  product_id: number;
  attribute: string;
  value: string;
  extra_price: Money;
  is_active: boolean;
}

/** ProductOut / ProductDetailOut. Writes take tax_id; reads return tax. */
export interface Product {
  id: number;
  name: string;
  product_type: ProductType;
  sales_price: Money;
  cost_price: Money;
  notes: string | null;
  tax: TaxRef | null;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface ProductDetail extends Product {
  variants: ProductVariant[];
}

export type BillingPeriod = "daily" | "weekly" | "monthly" | "yearly";

export interface Plan {
  id: number;
  name: string;
  price: Money;
  billing_period: BillingPeriod;
  min_quantity: number;
  available_from: ISODate;
  available_until: ISODate | null;
  auto_close: boolean;
  closable: boolean;
  pausable: boolean;
  renewable: boolean;
  tax: TaxRef | null;
  is_active: boolean;
  created_at: ISODateTime;
}

export type DiscountKind = "fixed" | "percentage";
export type DiscountScope = "subscription" | "product";
export type DiscountState = "active" | "scheduled" | "expired" | "exhausted" | "inactive";

/** DiscountOut. usage_count is read-only (billing consumes uses). */
export interface Discount {
  id: number;
  name: string;
  kind: DiscountKind;
  value: Money;
  scope: DiscountScope;
  products: { id: number; name: string }[];
  min_purchase_amount: Money | null;
  min_quantity: number | null;
  valid_from: ISODate;
  valid_until: ISODate | null;
  usage_limit: number | null;
  usage_count: number;
  is_active: boolean;
  state: DiscountState;
  created_at: ISODateTime;
}

// ------------------------------------------------------------------ quotations & subscriptions

/** Quotation templates (feat/backend-core @ 853e5fb). */
export interface TemplateLine {
  id?: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  unit_price: Money | null;
}

export interface QuotationTemplate {
  id: number;
  name: string;
  plan_id: number;
  plan_quantity: number;
  payment_term_id: number | null;
  term_periods: number;
  validity_days: number;
  notes: string | null;
  is_active: boolean;
  lines: TemplateLine[];
  created_at: ISODateTime;
}

/** POST /pricing/preview (feat/backend-core @ 8c7525e, PricingPreviewOut). */
export interface PricingPreview {
  lines: SubscriptionLine[];
  amount_untaxed: Money;
  amount_discount: Money;
  amount_tax: Money;
  amount_total: Money;
  discount_applied: boolean;
  discount_skipped_reason: string | null;
}

export interface LineInput {
  product_id: number;
  variant_id?: number | null;
  quantity: number;
  unit_price?: Money | null;
  description?: string | null;
}

export interface PricingPreviewInput {
  plan_id: number;
  plan_quantity: number;
  lines: LineInput[];
  discount_id?: number | null;
  on?: ISODate | null;
}

export type SubscriptionStatus = "draft" | "quotation" | "confirmed" | "active" | "closed";

export interface SubscriptionLine {
  id: number | null;
  line_type: "plan" | "product";
  product_id: number | null;
  variant_id: number | null;
  description: string;
  quantity: number;
  unit_price: Money;
  tax: TaxRef | null;
  subtotal: Money;
  discount_amount: Money;
  tax_amount: Money;
  total: Money;
}

export interface InvoiceRef {
  id: number;
  number: string | null;
  status: InvoiceStatus;
  amount_total: Money;
  invoice_date: ISODate;
}

export interface PlanRef {
  id: number;
  name: string;
  price: Money;
  billing_period: BillingPeriod;
  min_quantity: number;
  auto_close: boolean;
  closable: boolean;
  pausable: boolean;
  renewable: boolean;
}

/** SubscriptionListItem (feat/backend-core @ 8c7525e). */
export interface SubscriptionListItem {
  id: number;
  number: string;
  status: SubscriptionStatus;
  customer: { id: number; name: string; email: string };
  plan: PlanRef;
  start_date: ISODate;
  end_date: ISODate;
  next_invoice_date: ISODate | null;
  is_paused: boolean;
  is_expired: boolean;
  amount_total: Money;
  created_at: ISODateTime;
}

/** SubscriptionOut (feat/backend-core @ 8c7525e). Portal responses use the same shape. */
export interface Subscription extends SubscriptionListItem {
  payment_term: { id: number; name: string; due_days: number };
  discount: { id: number; name: string; kind: DiscountKind; value: Money; scope: DiscountScope } | null;
  term_periods: number;
  quotation_valid_until: ISODate | null;
  paused_at: ISODateTime | null;
  confirmed_at: ISODateTime | null;
  activated_at: ISODateTime | null;
  closed_at: ISODateTime | null;
  close_reason: string | null;
  template_id: number | null;
  amount_untaxed: Money;
  amount_discount: Money;
  amount_tax: Money;
  notes: string | null;
  auto_collect: boolean;
  lines: SubscriptionLine[];
  last_invoice: InvoiceRef | null;
  available_actions: string[];
}

/** EventOut: newest first; actions look like "subscription.paused" or "invoice.confirmed". */
export interface AuditEvent {
  id: number;
  action: string;
  actor_type: string;
  actor_name: string | null;
  data: Record<string, unknown>;
  created_at: ISODateTime;
}

export interface SubscriptionInput {
  customer_id: number;
  template_id?: number | null;
  plan_id?: number | null;
  plan_quantity?: number | null;
  start_date: ISODate;
  term_periods?: number | null;
  payment_term_id?: number | null;
  discount_id?: number | null;
  notes?: string | null;
  lines?: LineInput[] | null;
}

// ------------------------------------------------------------------ invoices, payments, billing

export type InvoiceStatus = "draft" | "confirmed" | "paid" | "cancelled";
export type PaymentState = "unpaid" | "partially_paid" | "paid";
export type CollectionStatus = "none" | "pending" | "failed" | "succeeded";

export interface InvoiceLine {
  id: number;
  line_type: "plan" | "product";
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: Money;
  subtotal: Money;
  discount_amount: Money;
  taxable_amount: Money;
  tax_name: string | null;
  tax_rate: string;
  tax_amount: Money;
  total: Money;
}

/** Payment as embedded in InvoiceOut. */
export interface InvoicePayment {
  id: number;
  number: string;
  method: PaymentMethod;
  amount: Money;
  payment_date: ISODate;
  note: string | null;
  status: PaymentStatus;
  provider: string | null;
  created_at: ISODateTime;
}

export type PaymentMethod = "cash" | "bank_transfer" | "card" | "upi" | "cheque" | "other";
export type PaymentStatus = "posted" | "voided";

/** PaymentOut (feat/backend-business @ 5b8bfe7). */
export interface Payment {
  id: number;
  number: string;
  invoice_id: number;
  invoice_number: string | null;
  customer_id: number;
  method: PaymentMethod;
  amount: Money;
  payment_date: ISODate;
  note: string | null;
  status: PaymentStatus;
  recorded_by: number | null;
  voided_at: ISODateTime | null;
  voided_by: number | null;
  void_reason: string | null;
  created_at: ISODateTime;
}

/** PortalPaymentOut: what a customer sees about their own payments. */
export interface PortalPayment {
  id: number;
  number: string;
  invoice_id: number;
  invoice_number: string | null;
  method: PaymentMethod;
  amount: Money;
  payment_date: ISODate;
  status: PaymentStatus;
}

/** InvoiceListItem (feat/backend-core @ 8c7525e). */
export interface InvoiceListItem {
  id: number;
  number: string | null;
  status: InvoiceStatus;
  payment_state: PaymentState;
  is_overdue: boolean;
  days_overdue: number;
  collection_status: CollectionStatus;
  subscription: { id: number; number: string };
  customer_id: number;
  bill_to_name: string;
  period_start: ISODate;
  period_end: ISODate;
  invoice_date: ISODate;
  due_date: ISODate;
  currency: string;
  amount_total: Money;
  amount_paid: Money;
  amount_due: Money;
}

/** InvoiceOut (feat/backend-core @ 8c7525e). Portal responses use the same shape. */
export interface Invoice extends InvoiceListItem {
  bill_to_email: string;
  bill_to_address: string | null;
  payment_term_name: string;
  discount_name: string | null;
  amount_untaxed: Money;
  amount_discount: Money;
  amount_tax: Money;
  confirmed_at: ISODateTime | null;
  paid_at: ISODateTime | null;
  cancelled_at: ISODateTime | null;
  cancel_reason: string | null;
  replaces_invoice_id: number | null;
  sent_at: ISODateTime | null;
  sent_count: number;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  available_actions: string[];
}

export interface BulkConfirmResult {
  confirmed: number[];
  errors: { id: number; code: string; message: string }[];
}

/** GET /invoices/{id}/payment-attempts (feat/backend-business @ 971b487). */
export type AttemptStatus = "created" | "processing" | "succeeded" | "failed" | "cancelled";

export interface PaymentAttempt {
  id: number;
  invoice_id: number;
  mandate_id: number | null;
  provider: string;
  provider_reference: string | null;
  amount: Money;
  status: AttemptStatus;
  attempt_number: number;
  failure_code: string | null;
  failure_message: string | null;
  next_retry_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type MandateStatus = "pending" | "active" | "paused" | "cancelled" | "failed";

/** Saved payment authorisation for automatic collection (GET /mandates). */
export interface Mandate {
  id: number;
  customer_id?: number;
  provider: string;
  status: MandateStatus;
  method_type: string;
  display_hint: string | null;
  max_amount: Money | null;
  authorized_at: ISODateTime | null;
  cancelled_at?: ISODateTime | null;
  created_at: ISODateTime;
}

export interface RazorpayCheckout {
  provider: "razorpay";
  key: string;
  order_id: string;
  customer_id: string;
  recurring: string | boolean;
  amount: number;
  currency: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

export interface MandateSetup {
  mandate: Mandate;
  checkout: RazorpayCheckout | Record<string, unknown>;
}

export interface PaymentInput {
  invoice_id: number;
  method: PaymentMethod;
  amount: Money;
  payment_date: ISODate;
  note?: string | null;
}

/** BillingRunItemOut / BillingRunOut / BillingRunDetailOut (feat/backend-core @ 8c7525e). */
export interface BillingRunItem {
  id: number;
  subscription_id: number;
  status: string;
  invoices_created: number;
  error: string | null;
  created_at: ISODateTime;
}

export interface BillingRun {
  id: number;
  trigger: string;
  as_of: ISODate;
  status: string;
  triggered_by: number | null;
  subscriptions_due: number;
  invoices_created: number;
  failures: number;
  error: string | null;
  started_at: ISODateTime;
  finished_at: ISODateTime | null;
}

export interface BillingRunDetail extends BillingRun {
  items: BillingRunItem[];
}

// ------------------------------------------------------------------ reports & portal

/** SummaryReportOut: flows use the date range; active/outstanding/overdue are as of today. */
export interface ReportSummary {
  date_from: ISODate | null;
  date_to: ISODate | null;
  as_of: ISODate;
  active_subscriptions: number;
  new_subscriptions: number;
  closed_subscriptions: number;
  revenue_received: Money;
  payments_count: number;
  invoiced_amount: Money;
  invoices_count: number;
  outstanding_amount: Money;
  outstanding_count: number;
  overdue_amount: Money;
  overdue_count: number;
}

export interface RevenuePoint {
  period: ISODate;
  amount: Money;
  payments_count: number;
}

export interface MethodBreakdown {
  method: PaymentMethod;
  amount: Money;
  payments_count: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface OverdueInvoiceRow {
  id: number;
  number: string | null;
  customer_id: number;
  customer_name: string;
  subscription_id: number;
  invoice_date: ISODate;
  due_date: ISODate;
  amount_total: Money;
  amount_paid: Money;
  amount_due: Money;
  days_overdue: number;
}

/** GET /portal/summary (feat/backend-core @ 853e5fb). */
export interface PortalSummary {
  active_subscriptions: number;
  pending_quotations: number;
  outstanding_amount: Money;
  overdue_amount: Money;
  overdue_invoices: number;
  next_invoice_date: ISODate | null;
}

/** GET/PATCH /portal/profile. Email is read-only. */
export interface PortalProfile {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  address: string | null;
  tax_id: string | null;
}

/** GET /reports/unapplied-payments: provider payments that could not be applied and need a refund. */
export interface UnappliedPayment {
  audit_event_id: number;
  recorded_at: ISODateTime;
  provider: string;
  provider_payment_id: string;
  amount: Money;
  invoice_id: number | null;
  attempt_id: number | null;
  reason: string;
}
