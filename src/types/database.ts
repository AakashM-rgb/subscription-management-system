// Database schema types for SUBFLOW (Brightloop Software)

export type UserRole = 'admin' | 'staff' | 'customer';

export type BillingFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type SubscriptionStatus =
  | 'draft'
  | 'quotation'
  | 'confirmed'
  | 'active'
  | 'paused'
  | 'closed'
  | 'expired';

export type QuotationStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'converted'
  | 'expired'
  | 'rejected';

export type InvoiceStatus = 'draft' | 'confirmed' | 'paid' | 'cancelled';

export type PaymentMethod =
  | 'bank_transfer'
  | 'credit_card'
  | 'upi'
  | 'cash'
  | 'stripe'
  | 'check';

export type DiscountType = 'percentage' | 'fixed';

export type ProductType = 'software' | 'service' | 'hardware' | 'addon';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  customer_id?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  tax_id?: string | null;
  billing_address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country: string;
  status: 'active' | 'inactive';
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  variant_name: string;
  variant_value: string;
  price_surcharge: number;
  sku?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  code?: string | null;
  product_type: ProductType;
  sales_price: number;
  cost_price: number;
  description?: string | null;
  notes?: string | null;
  is_active: boolean;
  variants?: ProductVariant[];
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  price: number;
  billing_frequency: BillingFrequency;
  min_quantity: number;
  available_from: string;
  available_until?: string | null;
  auto_close: boolean;
  early_close_allowed: boolean;
  pause_allowed: boolean;
  renewal_allowed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  is_compound: boolean;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface DiscountRule {
  id: string;
  code: string;
  description?: string | null;
  discount_type: DiscountType;
  value: number;
  min_purchase_amount: number;
  min_quantity: number;
  start_date: string;
  end_date?: string | null;
  max_usage_count?: number | null;
  current_usage_count: number;
  applicable_product_id?: string | null;
  is_subscription_wide: boolean;
  is_active: boolean;
  created_at: string;
}

export interface QuotationLine {
  id: string;
  quotation_id: string;
  product_id: string;
  product_name?: string;
  variant_id?: string | null;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_id?: string | null;
  tax_rate: number;
  line_total: number;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  template_id?: string | null;
  plan_id: string;
  plan_name?: string;
  status: QuotationStatus;
  issue_date: string;
  valid_until: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  converted_subscription_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  lines?: QuotationLine[];
  created_at: string;
  updated_at: string;
}

export interface QuotationTemplateLine {
  id: string;
  template_id: string;
  product_id: string;
  product_name?: string;
  variant_id?: string | null;
  quantity: number;
  unit_price: number;
  discount_percentage: number;
  created_at: string;
}

export interface QuotationTemplate {
  id: string;
  name: string;
  description?: string | null;
  validity_days: number;
  default_plan_id?: string | null;
  default_tax_id?: string | null;
  notes?: string | null;
  is_active: boolean;
  lines?: QuotationTemplateLine[];
  created_at: string;
}

export interface SubscriptionLine {
  id: string;
  subscription_id: string;
  product_id: string;
  product_name?: string;
  variant_id?: string | null;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  discount_rule_id?: string | null;
  discount_amount: number;
  tax_rate_id?: string | null;
  tax_rate_snapshot: number;
  line_total: number;
}

export interface Subscription {
  id: string;
  subscription_number: string;
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  plan_id: string;
  plan_name?: string;
  quotation_id?: string | null;
  status: SubscriptionStatus;
  start_date: string;
  expiry_date?: string | null;
  next_billing_date?: string | null;
  billing_frequency: BillingFrequency;
  payment_terms: string;
  auto_renew: boolean;
  paused_at?: string | null;
  closed_at?: string | null;
  close_reason?: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  notes?: string | null;
  lines?: SubscriptionLine[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_rate_snapshot: number;
  tax_amount: number;
  line_total: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  subscription_id?: string | null;
  subscription_number?: string | null;
  billing_period: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  status: InvoiceStatus;
  idempotency_key?: string | null;
  notes?: string | null;
  lines?: InvoiceLine[];
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  payment_number: string;
  invoice_id: string;
  invoice_number?: string;
  customer_id: string;
  customer_name?: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  transaction_reference?: string | null;
  notes?: string | null;
  recorded_by?: string | null;
  created_at: string;
}

export interface DashboardMetrics {
  mrr: number;
  active_subscriptions: number;
  total_customers: number;
  collected_revenue: number;
  outstanding_revenue: number;
  overdue_invoices_count: number;
  subscription_status_distribution: Record<string, number>;
  revenue_by_month: Array<{ month: string; revenue: number }>;
  payment_methods: Array<{ payment_method: string; count: number; total_amount: number }>;
  recent_payments?: Payment[];
  upcoming_renewals?: Subscription[];
  recent_invoices?: Invoice[];
}
