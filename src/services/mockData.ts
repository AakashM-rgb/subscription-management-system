import {
  Customer,
  Product,
  ProductVariant,
  Plan,
  TaxRate,
  DiscountRule,
  Subscription,
  Invoice,
  Payment,
  Quotation,
  QuotationTemplate,
  DashboardMetrics,
} from '../types/database';
import { calculateNextBillingDate, formatBillingPeriod, isOverdue } from '../lib/date';

// Key for local storage persistence
const STORAGE_PREFIX = 'subflow_store_v1_';

export interface StorageData {
  customers: Customer[];
  products: Product[];
  product_variants: ProductVariant[];
  plans: Plan[];
  tax_rates: TaxRate[];
  discount_rules: DiscountRule[];
  quotations: Quotation[];
  quotation_templates: QuotationTemplate[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  payments: Payment[];
}

const INITIAL_DATA: StorageData = {
  customers: [
    {
      id: 'c0000000-0000-0000-0000-000000000001',
      name: 'Alex Mercer',
      email: 'alex.mercer@apextech.io',
      phone: '+91 98765 43210',
      company: 'Apex Dynamics Ltd',
      tax_id: 'GSTIN27AABCA1234F1Z5',
      billing_address: '104 Tech Valley, Phase 2',
      city: 'Bengaluru',
      state: 'Karnataka',
      postal_code: '560100',
      country: 'India',
      status: 'active',
      notes: 'Strategic early adopter enterprise client',
      created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'c0000000-0000-0000-0000-000000000002',
      name: 'Priya Sharma',
      email: 'priya.sharma@zenithcloud.in',
      phone: '+91 98111 22334',
      company: 'Zenith Cloud Labs',
      tax_id: 'GSTIN29XYZAB5678C1Z2',
      billing_address: 'Plot 42 Cyber City',
      city: 'Hyderabad',
      state: 'Telangana',
      postal_code: '500081',
      country: 'India',
      status: 'active',
      notes: 'Annual platinum enterprise tier subscriber',
      created_at: new Date(Date.now() - 150 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'c0000000-0000-0000-0000-000000000003',
      name: 'David Chen',
      email: 'david.chen@hyperflow.com',
      phone: '+1 415 555 0192',
      company: 'HyperFlow Logistics',
      tax_id: 'US-EIN-9923847',
      billing_address: '55 Market Street, Suite 900',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      country: 'United States',
      status: 'active',
      notes: 'Weekly high-frequency billing cohort',
      created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'c0000000-0000-0000-0000-000000000004',
      name: 'Neha Verma',
      email: 'neha.verma@auroratech.org',
      phone: '+91 97234 11009',
      company: 'Aurora BioTech Innovations',
      tax_id: 'GSTIN07BCDEF9012D1Z9',
      billing_address: 'Tower B, Connaught Place',
      city: 'New Delhi',
      state: 'Delhi',
      postal_code: '110001',
      country: 'India',
      status: 'active',
      notes: 'Daily compute micro-billing subscriber',
      created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'c0000000-0000-0000-0000-000000000005',
      name: 'Rohan Kapoor',
      email: 'rohan@kapoorsystems.com',
      phone: '+91 99001 88776',
      company: 'Kapoor Enterprise Systems',
      tax_id: 'GSTIN24GHIJK3456K1Z8',
      billing_address: 'B-12 Science City Road',
      city: 'Ahmedabad',
      state: 'Gujarat',
      postal_code: '380060',
      country: 'India',
      status: 'active',
      notes: 'New deployment onboarded this month',
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],

  products: [
    {
      id: 'p0000000-0000-0000-0000-000000000001',
      name: 'Brightloop Core Platform',
      code: 'PRD-CORE-01',
      product_type: 'software',
      sales_price: 2000.0,
      cost_price: 450.0,
      description: 'Enterprise subscription lifecycle and billing engine core licence',
      notes: 'Base software price: ₹2,000',
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'p0000000-0000-0000-0000-000000000002',
      name: 'Advanced Revenue Analytics',
      code: 'PRD-ANLY-02',
      product_type: 'addon',
      sales_price: 750.0,
      cost_price: 150.0,
      description: 'Real-time MRR waterfalls, cohort retention, and churn forecasting',
      notes: 'Addon module',
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'p0000000-0000-0000-0000-000000000003',
      name: 'Enterprise SLA & Support',
      code: 'PRD-SPRT-03',
      product_type: 'service',
      sales_price: 1500.0,
      cost_price: 600.0,
      description: '24/7 dedicated support with 15-minute response time SLA',
      notes: 'Support contract tier',
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'p0000000-0000-0000-0000-000000000004',
      name: 'Odoo ERP Sync Module',
      code: 'PRD-ODOO-04',
      product_type: 'software',
      sales_price: 1200.0,
      cost_price: 300.0,
      description: 'Seamless two-way integration module connecting Subflow with Odoo ERP',
      notes: 'Integration module',
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'p0000000-0000-0000-0000-000000000005',
      name: 'Webhook & Custom Automation',
      code: 'PRD-AUTO-05',
      product_type: 'addon',
      sales_price: 500.0,
      cost_price: 80.0,
      description: 'Event-driven webhooks and Zapier / Make connectors',
      notes: 'Developer automation',
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],

  product_variants: [
    {
      id: 'v0000000-0000-0000-0000-000000000001',
      product_id: 'p0000000-0000-0000-0000-000000000001',
      variant_name: 'Brand Integration',
      variant_value: 'Odoo Edition',
      price_surcharge: 560.0, // Base ₹2,000 + ₹560 = ₹2,560
      sku: 'PRD-CORE-ODOO',
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
    },
    {
      id: 'v0000000-0000-0000-0000-000000000002',
      product_id: 'p0000000-0000-0000-0000-000000000001',
      variant_name: 'Deployment',
      variant_value: 'Dedicated Cloud Instance',
      price_surcharge: 1000.0,
      sku: 'PRD-CORE-DED',
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
    },
    {
      id: 'v0000000-0000-0000-0000-000000000003',
      product_id: 'p0000000-0000-0000-0000-000000000003',
      variant_name: 'Assistance Level',
      variant_value: 'Dedicated Technical Account Manager',
      price_surcharge: 850.0,
      sku: 'PRD-SPRT-TAM',
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
    },
  ],

  plans: [
    {
      id: 'f0000000-0000-0000-0000-000000000001',
      name: 'On-Demand Daily Pass',
      code: 'PLAN-DAILY',
      description: 'Micro-billing tier for flexible development and temporary burst usage',
      price: 120.0,
      billing_frequency: 'daily',
      min_quantity: 1,
      available_from: '2026-01-01',
      auto_close: false,
      early_close_allowed: true,
      pause_allowed: true,
      renewal_allowed: true,
      is_active: true,
      created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'f0000000-0000-0000-0000-000000000002',
      name: 'Growth Sprint Weekly',
      code: 'PLAN-WEEKLY',
      description: 'Rapid iteration weekly plan for fast-paced growth teams',
      price: 650.0,
      billing_frequency: 'weekly',
      min_quantity: 1,
      available_from: '2026-01-01',
      auto_close: false,
      early_close_allowed: true,
      pause_allowed: true,
      renewal_allowed: true,
      is_active: true,
      created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'f0000000-0000-0000-0000-000000000003',
      name: 'Professional Monthly',
      code: 'PLAN-MONTHLY',
      description: 'Full-featured enterprise subscription billed every calendar month',
      price: 2560.0,
      billing_frequency: 'monthly',
      min_quantity: 1,
      available_from: '2026-01-01',
      auto_close: false,
      early_close_allowed: true,
      pause_allowed: true,
      renewal_allowed: true,
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'f0000000-0000-0000-0000-000000000004',
      name: 'Enterprise Annual Platinum',
      code: 'PLAN-YEARLY',
      description: 'Comprehensive annual subscription with preferential pricing and priority SLA',
      price: 28000.0,
      billing_frequency: 'yearly',
      min_quantity: 1,
      available_from: '2026-01-01',
      auto_close: false,
      early_close_allowed: true,
      pause_allowed: true,
      renewal_allowed: true,
      is_active: true,
      created_at: new Date(Date.now() - 365 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],

  tax_rates: [
    {
      id: 't0000000-0000-0000-0000-000000000001',
      name: 'GST 18% (Standard Software)',
      rate: 18.0,
      is_compound: false,
      is_default: true,
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
    },
    {
      id: 't0000000-0000-0000-0000-000000000002',
      name: 'Zero-Rated Export 0%',
      rate: 0.0,
      is_compound: false,
      is_default: false,
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
    },
  ],

  discount_rules: [
    {
      id: 'd0000000-0000-0000-0000-000000000001',
      code: 'BRIGHTEARLY10',
      description: 'Early adopter 10% platform discount',
      discount_type: 'percentage',
      value: 10.0,
      min_purchase_amount: 1000.0,
      min_quantity: 1,
      start_date: '2026-01-01',
      max_usage_count: 100,
      current_usage_count: 14,
      is_subscription_wide: true,
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
    },
    {
      id: 'd0000000-0000-0000-0000-000000000002',
      code: 'LAUNCH500',
      description: 'Flat ₹500 discount for new subscription launches',
      discount_type: 'fixed',
      value: 500.0,
      min_purchase_amount: 2000.0,
      min_quantity: 1,
      start_date: '2026-01-01',
      max_usage_count: 50,
      current_usage_count: 9,
      is_subscription_wide: true,
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
    },
  ],

  quotation_templates: [
    {
      id: 'qt000000-0000-0000-0000-000000000001',
      name: 'Standard SaaS + Odoo Connector Template',
      description: 'Ready-to-use template for medium businesses adopting Brightloop with Odoo',
      validity_days: 30,
      default_plan_id: 'f0000000-0000-0000-0000-000000000003',
      default_tax_id: 't0000000-0000-0000-0000-000000000001',
      notes: 'Includes base platform and Odoo variant surcharge',
      is_active: true,
      created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
      lines: [
        {
          id: 'qtl-1',
          template_id: 'qt000000-0000-0000-0000-000000000001',
          product_id: 'p0000000-0000-0000-0000-000000000001',
          product_name: 'Brightloop Core Platform (Odoo Edition)',
          variant_id: 'v0000000-0000-0000-0000-000000000001',
          quantity: 1,
          unit_price: 2560.0,
          discount_percentage: 10,
          created_at: new Date().toISOString(),
        },
      ],
    },
  ],

  quotations: [
    {
      id: 'q0000000-0000-0000-0000-000000000001',
      quotation_number: 'QUO-2026-0041',
      customer_id: 'c0000000-0000-0000-0000-000000000005',
      customer_name: 'Rohan Kapoor',
      customer_email: 'rohan@kapoorsystems.com',
      plan_id: 'f0000000-0000-0000-0000-000000000003',
      plan_name: 'Professional Monthly',
      status: 'accepted',
      issue_date: '2026-10-20',
      valid_until: '2026-11-20',
      subtotal: 2560.0,
      discount_amount: 500.0,
      tax_amount: 370.8,
      total_amount: 2430.8,
      notes: 'Pre-approved quotation ready for conversion to subscription',
      created_at: '2026-10-20T10:00:00Z',
      updated_at: '2026-10-20T10:00:00Z',
      lines: [
        {
          id: 'ql-1',
          quotation_id: 'q0000000-0000-0000-0000-000000000001',
          product_id: 'p0000000-0000-0000-0000-000000000001',
          product_name: 'Brightloop Core Platform (Odoo Edition)',
          variant_id: 'v0000000-0000-0000-0000-000000000001',
          quantity: 1,
          unit_price: 2560.0,
          discount_amount: 500.0,
          tax_rate: 18.0,
          line_total: 2060.0,
        },
      ],
    },
    {
      id: 'q0000000-0000-0000-0000-000000000002',
      quotation_number: 'QUO-2026-0038',
      customer_id: 'c0000000-0000-0000-0000-000000000003',
      customer_name: 'David Chen',
      customer_email: 'david.chen@hyperflow.com',
      plan_id: 'f0000000-0000-0000-0000-000000000004',
      plan_name: 'Enterprise Annual Platinum',
      status: 'expired',
      issue_date: '2026-08-01',
      valid_until: '2026-08-31',
      subtotal: 28000.0,
      discount_amount: 2800.0,
      tax_amount: 0.0,
      total_amount: 25200.0,
      notes: 'Expired quote (conversion strictly blocked)',
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      lines: [],
    },
  ],

  // 8 SUBSCRIPTIONS
  subscriptions: [
    {
      id: 's0000000-0000-0000-0000-000000000001',
      subscription_number: 'SUB-2026-00001',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      customer_name: 'Alex Mercer (Apex Dynamics Ltd)',
      customer_email: 'alex.mercer@apextech.io',
      plan_id: 'f0000000-0000-0000-0000-000000000003',
      plan_name: 'Professional Monthly',
      status: 'active',
      start_date: '2026-09-01',
      expiry_date: '2027-08-31',
      next_billing_date: '2026-11-01',
      billing_frequency: 'monthly',
      payment_terms: 'Net 15',
      auto_renew: true,
      subtotal: 2560.0,
      discount_amount: 256.0,
      tax_amount: 414.72,
      total_amount: 2718.72,
      notes: 'Core Platform with Odoo Integration variant',
      created_at: '2026-09-01T08:00:00Z',
      updated_at: '2026-10-01T08:00:00Z',
      lines: [
        {
          id: 'sl-1',
          subscription_id: 's0000000-0000-0000-0000-000000000001',
          product_id: 'p0000000-0000-0000-0000-000000000001',
          product_name: 'Brightloop Core Platform (Odoo Edition)',
          variant_id: 'v0000000-0000-0000-0000-000000000001',
          variant_name: 'Odoo Edition (+₹560)',
          quantity: 1,
          unit_price: 2560.0,
          discount_amount: 256.0,
          tax_rate_snapshot: 18.0,
          line_total: 2304.0,
        },
      ],
    },
    {
      id: 's0000000-0000-0000-0000-000000000002',
      subscription_number: 'SUB-2026-00002',
      customer_id: 'c0000000-0000-0000-0000-000000000002',
      customer_name: 'Priya Sharma (Zenith Cloud Labs)',
      customer_email: 'priya.sharma@zenithcloud.in',
      plan_id: 'f0000000-0000-0000-0000-000000000004',
      plan_name: 'Enterprise Annual Platinum',
      status: 'active',
      start_date: '2026-06-01',
      expiry_date: '2027-05-31',
      next_billing_date: '2027-06-01',
      billing_frequency: 'yearly',
      payment_terms: 'Net 30',
      auto_renew: true,
      subtotal: 28000.0,
      discount_amount: 2800.0,
      tax_amount: 4536.0,
      total_amount: 29736.0,
      notes: 'High-value annual enterprise contract',
      created_at: '2026-06-01T08:00:00Z',
      updated_at: '2026-06-01T08:00:00Z',
      lines: [
        {
          id: 'sl-2',
          subscription_id: 's0000000-0000-0000-0000-000000000002',
          product_id: 'p0000000-0000-0000-0000-000000000001',
          product_name: 'Brightloop Core Platform (Annual Pack)',
          quantity: 1,
          unit_price: 28000.0,
          discount_amount: 2800.0,
          tax_rate_snapshot: 18.0,
          line_total: 25200.0,
        },
      ],
    },
    {
      id: 's0000000-0000-0000-0000-000000000003',
      subscription_number: 'SUB-2026-00003',
      customer_id: 'c0000000-0000-0000-0000-000000000003',
      customer_name: 'David Chen (HyperFlow Logistics)',
      customer_email: 'david.chen@hyperflow.com',
      plan_id: 'f0000000-0000-0000-0000-000000000002',
      plan_name: 'Growth Sprint Weekly',
      status: 'active',
      start_date: '2026-10-01',
      expiry_date: '2026-12-31',
      next_billing_date: '2026-11-02',
      billing_frequency: 'weekly',
      payment_terms: 'Due on Receipt',
      auto_renew: true,
      subtotal: 650.0,
      discount_amount: 0.0,
      tax_amount: 0.0,
      total_amount: 650.0,
      notes: 'Overseas export client - zero rated tax',
      created_at: '2026-10-01T08:00:00Z',
      updated_at: '2026-10-24T08:00:00Z',
      lines: [],
    },
    {
      id: 's0000000-0000-0000-0000-000000000004',
      subscription_number: 'SUB-2026-00004',
      customer_id: 'c0000000-0000-0000-0000-000000000004',
      customer_name: 'Neha Verma (Aurora BioTech Innovations)',
      customer_email: 'neha.verma@auroratech.org',
      plan_id: 'f0000000-0000-0000-0000-000000000001',
      plan_name: 'On-Demand Daily Pass',
      status: 'active',
      start_date: '2026-10-20',
      expiry_date: '2026-11-20',
      next_billing_date: '2026-10-31', // Due today! Eligible for Run Billing
      billing_frequency: 'daily',
      payment_terms: 'Due on Receipt',
      auto_renew: true,
      subtotal: 120.0,
      discount_amount: 0.0,
      tax_amount: 21.6,
      total_amount: 141.6,
      notes: 'Daily compute instance billing',
      created_at: '2026-10-20T08:00:00Z',
      updated_at: '2026-10-30T08:00:00Z',
      lines: [],
    },
    {
      id: 's0000000-0000-0000-0000-000000000005',
      subscription_number: 'SUB-2026-00005',
      customer_id: 'c0000000-0000-0000-0000-000000000005',
      customer_name: 'Rohan Kapoor (Kapoor Enterprise Systems)',
      customer_email: 'rohan@kapoorsystems.com',
      plan_id: 'f0000000-0000-0000-0000-000000000003',
      plan_name: 'Professional Monthly',
      status: 'confirmed',
      start_date: '2026-10-28',
      expiry_date: '2027-10-27',
      next_billing_date: '2026-11-01',
      billing_frequency: 'monthly',
      payment_terms: 'Net 15',
      auto_renew: true,
      subtotal: 2560.0,
      discount_amount: 500.0,
      tax_amount: 370.8,
      total_amount: 2430.8,
      notes: 'Awaiting first billing cycle activation',
      created_at: '2026-10-28T08:00:00Z',
      updated_at: '2026-10-28T08:00:00Z',
      lines: [],
    },
    {
      id: 's0000000-0000-0000-0000-000000000006',
      subscription_number: 'SUB-2026-00006',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      customer_name: 'Alex Mercer (Apex Dynamics Ltd)',
      customer_email: 'alex.mercer@apextech.io',
      plan_id: 'f0000000-0000-0000-0000-000000000002',
      plan_name: 'Growth Sprint Weekly',
      status: 'paused',
      start_date: '2026-09-10',
      expiry_date: '2026-12-10',
      next_billing_date: '2026-11-15',
      billing_frequency: 'weekly',
      payment_terms: 'Net 15',
      auto_renew: false,
      paused_at: '2026-10-20T08:00:00Z',
      subtotal: 650.0,
      discount_amount: 0.0,
      tax_amount: 117.0,
      total_amount: 767.0,
      notes: 'Temporarily paused by client for internal migration',
      created_at: '2026-09-10T08:00:00Z',
      updated_at: '2026-10-20T08:00:00Z',
      lines: [],
    },
    {
      id: 's0000000-0000-0000-0000-000000000007',
      subscription_number: 'SUB-2026-00007',
      customer_id: 'c0000000-0000-0000-0000-000000000003',
      customer_name: 'David Chen (HyperFlow Logistics)',
      customer_email: 'david.chen@hyperflow.com',
      plan_id: 'f0000000-0000-0000-0000-000000000003',
      plan_name: 'Professional Monthly',
      status: 'closed',
      start_date: '2026-05-01',
      expiry_date: '2026-09-30',
      next_billing_date: null,
      billing_frequency: 'monthly',
      payment_terms: 'Net 15',
      auto_renew: false,
      closed_at: '2026-09-30T18:00:00Z',
      close_reason: 'Restructuring and migrated to dedicated custom tier',
      subtotal: 2560.0,
      discount_amount: 0.0,
      tax_amount: 0.0,
      total_amount: 2560.0,
      notes: 'Terminated cleanly without penalty',
      created_at: '2026-05-01T08:00:00Z',
      updated_at: '2026-09-30T18:00:00Z',
      lines: [],
    },
    {
      id: 's0000000-0000-0000-0000-000000000008',
      subscription_number: 'SUB-2026-00008',
      customer_id: 'c0000000-0000-0000-0000-000000000002',
      customer_name: 'Priya Sharma (Zenith Cloud Labs)',
      customer_email: 'priya.sharma@zenithcloud.in',
      plan_id: 'f0000000-0000-0000-0000-000000000003',
      plan_name: 'Professional Monthly',
      status: 'draft',
      start_date: '2026-11-10',
      expiry_date: '2027-11-09',
      next_billing_date: '2026-11-10',
      billing_frequency: 'monthly',
      payment_terms: 'Net 15',
      auto_renew: true,
      subtotal: 3250.0,
      discount_amount: 0.0,
      tax_amount: 585.0,
      total_amount: 3835.0,
      notes: 'Draft subscription proposal for secondary engineering department',
      created_at: '2026-10-25T08:00:00Z',
      updated_at: '2026-10-25T08:00:00Z',
      lines: [],
    },
  ],

  // 10 INVOICES
  invoices: [
    {
      id: 'i0000000-0000-0000-0000-000000000001',
      invoice_number: 'INV-2026-00101',
      customer_id: 'c0000000-0000-0000-0000-000000000002',
      customer_name: 'Priya Sharma (Zenith Cloud Labs)',
      customer_email: 'priya.sharma@zenithcloud.in',
      subscription_id: 's0000000-0000-0000-0000-000000000002',
      subscription_number: 'SUB-2026-00002',
      billing_period: '2026 Annual Platinum',
      issue_date: '2026-06-01',
      due_date: '2026-07-01',
      subtotal: 28000.0,
      discount_amount: 2800.0,
      tax_amount: 4536.0,
      total_amount: 29736.0,
      amount_paid: 29736.0,
      status: 'paid',
      idempotency_key: 's2_annual_2026',
      notes: 'Annual upfront contract fee',
      created_at: '2026-06-01T09:00:00Z',
      updated_at: '2026-06-15T14:30:00Z',
    },
    {
      id: 'i0000000-0000-0000-0000-000000000002',
      invoice_number: 'INV-2026-00102',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      customer_name: 'Alex Mercer (Apex Dynamics Ltd)',
      customer_email: 'alex.mercer@apextech.io',
      subscription_id: 's0000000-0000-0000-0000-000000000001',
      subscription_number: 'SUB-2026-00001',
      billing_period: 'September 2026',
      issue_date: '2026-09-01',
      due_date: '2026-09-16',
      subtotal: 2560.0,
      discount_amount: 256.0,
      tax_amount: 414.72,
      total_amount: 2718.72,
      amount_paid: 2718.72,
      status: 'paid',
      idempotency_key: 's1_sep_2026',
      notes: 'Monthly recurring cycle',
      created_at: '2026-09-01T09:00:00Z',
      updated_at: '2026-09-05T11:20:00Z',
    },
    {
      id: 'i0000000-0000-0000-0000-000000000003',
      invoice_number: 'INV-2026-00103',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      customer_name: 'Alex Mercer (Apex Dynamics Ltd)',
      customer_email: 'alex.mercer@apextech.io',
      subscription_id: 's0000000-0000-0000-0000-000000000001',
      subscription_number: 'SUB-2026-00001',
      billing_period: 'October 2026',
      issue_date: '2026-10-01',
      due_date: '2026-10-16',
      subtotal: 2560.0,
      discount_amount: 256.0,
      tax_amount: 414.72,
      total_amount: 2718.72,
      amount_paid: 1500.0, // Partial payment
      status: 'confirmed',
      idempotency_key: 's1_oct_2026',
      notes: 'Partially settled; balance ₹1,218.72 remaining',
      created_at: '2026-10-01T09:00:00Z',
      updated_at: '2026-10-15T16:00:00Z',
    },
    {
      id: 'i0000000-0000-0000-0000-000000000004',
      invoice_number: 'INV-2026-00104',
      customer_id: 'c0000000-0000-0000-0000-000000000003',
      customer_name: 'David Chen (HyperFlow Logistics)',
      customer_email: 'david.chen@hyperflow.com',
      subscription_id: 's0000000-0000-0000-0000-000000000003',
      subscription_number: 'SUB-2026-00003',
      billing_period: '01 Oct - 07 Oct 2026',
      issue_date: '2026-10-01',
      due_date: '2026-10-08',
      subtotal: 650.0,
      discount_amount: 0.0,
      tax_amount: 0.0,
      total_amount: 650.0,
      amount_paid: 650.0,
      status: 'paid',
      idempotency_key: 's3_w41',
      notes: 'Weekly cycle week 41',
      created_at: '2026-10-01T09:00:00Z',
      updated_at: '2026-10-02T12:00:00Z',
    },
    {
      id: 'i0000000-0000-0000-0000-000000000005',
      invoice_number: 'INV-2026-00105',
      customer_id: 'c0000000-0000-0000-0000-000000000003',
      customer_name: 'David Chen (HyperFlow Logistics)',
      customer_email: 'david.chen@hyperflow.com',
      subscription_id: 's0000000-0000-0000-0000-000000000003',
      subscription_number: 'SUB-2026-00003',
      billing_period: '08 Oct - 14 Oct 2026',
      issue_date: '2026-10-08',
      due_date: '2026-10-15',
      subtotal: 650.0,
      discount_amount: 0.0,
      tax_amount: 0.0,
      total_amount: 650.0,
      amount_paid: 650.0,
      status: 'paid',
      idempotency_key: 's3_w42',
      notes: 'Weekly cycle week 42',
      created_at: '2026-10-08T09:00:00Z',
      updated_at: '2026-10-09T15:10:00Z',
    },
    {
      id: 'i0000000-0000-0000-0000-000000000006',
      invoice_number: 'INV-2026-00106',
      customer_id: 'c0000000-0000-0000-0000-000000000004',
      customer_name: 'Neha Verma (Aurora BioTech)',
      customer_email: 'neha.verma@auroratech.org',
      subscription_id: 's0000000-0000-0000-0000-000000000004',
      subscription_number: 'SUB-2026-00004',
      billing_period: '2026-10-18',
      issue_date: '2026-10-18',
      due_date: '2026-10-23', // Overdue!
      subtotal: 120.0,
      discount_amount: 0.0,
      tax_amount: 21.6,
      total_amount: 141.6,
      amount_paid: 0.0,
      status: 'confirmed',
      idempotency_key: 's4_d18',
      notes: 'Payment reminder sent',
      created_at: '2026-10-18T09:00:00Z',
      updated_at: '2026-10-18T09:00:00Z',
    },
    {
      id: 'i0000000-0000-0000-0000-000000000007',
      invoice_number: 'INV-2026-00107',
      customer_id: 'c0000000-0000-0000-0000-000000000004',
      customer_name: 'Neha Verma (Aurora BioTech)',
      customer_email: 'neha.verma@auroratech.org',
      subscription_id: 's0000000-0000-0000-0000-000000000004',
      subscription_number: 'SUB-2026-00004',
      billing_period: '2026-10-25',
      issue_date: '2026-10-25',
      due_date: '2026-11-04',
      subtotal: 120.0,
      discount_amount: 0.0,
      tax_amount: 21.6,
      total_amount: 141.6,
      amount_paid: 0.0,
      status: 'confirmed',
      idempotency_key: 's4_d25',
      notes: 'Current active billing cycle',
      created_at: '2026-10-25T09:00:00Z',
      updated_at: '2026-10-25T09:00:00Z',
    },
    {
      id: 'i0000000-0000-0000-0000-000000000008',
      invoice_number: 'INV-2026-00108',
      customer_id: 'c0000000-0000-0000-0000-000000000005',
      customer_name: 'Rohan Kapoor (Kapoor Systems)',
      customer_email: 'rohan@kapoorsystems.com',
      subscription_id: 's0000000-0000-0000-0000-000000000005',
      subscription_number: 'SUB-2026-00005',
      billing_period: 'November 2026',
      issue_date: '2026-10-29',
      due_date: '2026-11-13',
      subtotal: 2560.0,
      discount_amount: 500.0,
      tax_amount: 370.8,
      total_amount: 2430.8,
      amount_paid: 0.0,
      status: 'confirmed',
      idempotency_key: 's5_nov_2026',
      notes: 'Initial activation invoice',
      created_at: '2026-10-29T09:00:00Z',
      updated_at: '2026-10-29T09:00:00Z',
    },
    {
      id: 'i0000000-0000-0000-0000-000000000009',
      invoice_number: 'INV-2026-00109',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      customer_name: 'Alex Mercer (Apex Dynamics Ltd)',
      customer_email: 'alex.mercer@apextech.io',
      subscription_id: null,
      billing_period: 'Custom Integration Consulting',
      issue_date: '2026-10-30',
      due_date: '2026-11-30',
      subtotal: 1500.0,
      discount_amount: 0.0,
      tax_amount: 270.0,
      total_amount: 1770.0,
      amount_paid: 0.0,
      status: 'draft',
      idempotency_key: 'onetime_apex_01',
      notes: 'Ad-hoc consulting fee proposal',
      created_at: '2026-10-30T09:00:00Z',
      updated_at: '2026-10-30T09:00:00Z',
    },
    {
      id: 'i0000000-0000-0000-0000-000000000010',
      invoice_number: 'INV-2026-00110',
      customer_id: 'c0000000-0000-0000-0000-000000000003',
      customer_name: 'David Chen (HyperFlow Logistics)',
      customer_email: 'david.chen@hyperflow.com',
      subscription_id: 's0000000-0000-0000-0000-000000000003',
      subscription_number: 'SUB-2026-00003',
      billing_period: '22 Oct - 28 Oct 2026',
      issue_date: '2026-10-22',
      due_date: '2026-10-29',
      subtotal: 650.0,
      discount_amount: 0.0,
      tax_amount: 0.0,
      total_amount: 650.0,
      amount_paid: 0.0,
      status: 'confirmed',
      idempotency_key: 's3_w44',
      notes: 'Weekly recurring due for settlement',
      created_at: '2026-10-22T09:00:00Z',
      updated_at: '2026-10-22T09:00:00Z',
    },
  ],

  // 5 PAYMENTS
  payments: [
    {
      id: 'pay-001',
      payment_number: 'PAY-20260615-0001',
      invoice_id: 'i0000000-0000-0000-0000-000000000001',
      invoice_number: 'INV-2026-00101',
      customer_id: 'c0000000-0000-0000-0000-000000000002',
      customer_name: 'Priya Sharma (Zenith Cloud Labs)',
      amount: 29736.0,
      payment_method: 'bank_transfer',
      payment_date: '2026-06-15T14:30:00Z',
      transaction_reference: 'NEFT-ZENITH-998812',
      notes: 'Full payment for annual subscription',
      created_at: '2026-06-15T14:30:00Z',
    },
    {
      id: 'pay-002',
      payment_number: 'PAY-20260905-0002',
      invoice_id: 'i0000000-0000-0000-0000-000000000002',
      invoice_number: 'INV-2026-00102',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      customer_name: 'Alex Mercer (Apex Dynamics Ltd)',
      amount: 2718.72,
      payment_method: 'credit_card',
      payment_date: '2026-09-05T11:20:00Z',
      transaction_reference: 'STRIPE-CH-882193',
      notes: 'Auto-debited Visa corporate card ending 4042',
      created_at: '2026-09-05T11:20:00Z',
    },
    {
      id: 'pay-003',
      payment_number: 'PAY-20261015-0003',
      invoice_id: 'i0000000-0000-0000-0000-000000000003',
      invoice_number: 'INV-2026-00103',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      customer_name: 'Alex Mercer (Apex Dynamics Ltd)',
      amount: 1500.0,
      payment_method: 'upi',
      payment_date: '2026-10-15T16:00:00Z',
      transaction_reference: 'UPI-APEX-4491029',
      notes: 'Partial milestone installment (Balance ₹1,218.72 remains)',
      created_at: '2026-10-15T16:00:00Z',
    },
    {
      id: 'pay-004',
      payment_number: 'PAY-20261002-0004',
      invoice_id: 'i0000000-0000-0000-0000-000000000004',
      invoice_number: 'INV-2026-00104',
      customer_id: 'c0000000-0000-0000-0000-000000000003',
      customer_name: 'David Chen (HyperFlow Logistics)',
      amount: 650.0,
      payment_method: 'stripe',
      payment_date: '2026-10-02T12:00:00Z',
      transaction_reference: 'STRIPE-CH-991204',
      notes: 'Automated weekly payout',
      created_at: '2026-10-02T12:00:00Z',
    },
    {
      id: 'pay-005',
      payment_number: 'PAY-20261009-0005',
      invoice_id: 'i0000000-0000-0000-0000-000000000005',
      invoice_number: 'INV-2026-00105',
      customer_id: 'c0000000-0000-0000-0000-000000000003',
      customer_name: 'David Chen (HyperFlow Logistics)',
      amount: 650.0,
      payment_method: 'stripe',
      payment_date: '2026-10-09T15:10:00Z',
      transaction_reference: 'STRIPE-CH-991295',
      notes: 'Automated weekly payout',
      created_at: '2026-10-09T15:10:00Z',
    },
  ],
};

// Local storage management
export class SubflowStore {
  private static load<T>(key: string, defaultVal: T): T {
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + key);
      return stored ? JSON.parse(stored) : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  private static save<T>(key: string, value: T): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  static initialize(): void {
    if (!localStorage.getItem(STORAGE_PREFIX + 'initialized')) {
      this.resetToDefaults();
      localStorage.setItem(STORAGE_PREFIX + 'initialized', 'true');
    }
  }

  static resetToDefaults(): void {
    this.save('customers', INITIAL_DATA.customers);
    this.save('products', INITIAL_DATA.products);
    this.save('product_variants', INITIAL_DATA.product_variants);
    this.save('plans', INITIAL_DATA.plans);
    this.save('tax_rates', INITIAL_DATA.tax_rates);
    this.save('discount_rules', INITIAL_DATA.discount_rules);
    this.save('quotations', INITIAL_DATA.quotations);
    this.save('quotation_templates', INITIAL_DATA.quotation_templates);
    this.save('subscriptions', INITIAL_DATA.subscriptions);
    this.save('invoices', INITIAL_DATA.invoices);
    this.save('payments', INITIAL_DATA.payments);
  }

  // Customers
  static getCustomers(): Customer[] {
    return this.load('customers', INITIAL_DATA.customers);
  }

  static saveCustomer(customer: Customer): Customer {
    const list = this.getCustomers();
    const idx = list.findIndex(c => c.id === customer.id);
    if (idx >= 0) {
      list[idx] = { ...customer, updated_at: new Date().toISOString() };
    } else {
      list.unshift({ ...customer, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    this.save('customers', list);
    return customer;
  }

  // Products & Variants
  static getProducts(): Product[] {
    const products = this.load('products', INITIAL_DATA.products);
    const variants = this.getProductVariants();
    return products.map(p => ({
      ...p,
      variants: variants.filter(v => v.product_id === p.id),
    }));
  }

  static saveProduct(product: Product): Product {
    const list = this.load('products', INITIAL_DATA.products);
    const idx = list.findIndex(p => p.id === product.id);
    if (idx >= 0) {
      list[idx] = { ...product, updated_at: new Date().toISOString() };
    } else {
      list.unshift({ ...product, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    this.save('products', list);
    return product;
  }

  static getProductVariants(): ProductVariant[] {
    return this.load('product_variants', INITIAL_DATA.product_variants);
  }

  static saveProductVariant(variant: ProductVariant): ProductVariant {
    const list = this.getProductVariants();
    const idx = list.findIndex(v => v.id === variant.id);
    if (idx >= 0) {
      list[idx] = variant;
    } else {
      list.push({ ...variant, created_at: new Date().toISOString() });
    }
    this.save('product_variants', list);
    return variant;
  }

  // Plans
  static getPlans(): Plan[] {
    return this.load('plans', INITIAL_DATA.plans);
  }

  static savePlan(plan: Plan): Plan {
    const list = this.getPlans();
    const idx = list.findIndex(p => p.id === plan.id);
    if (idx >= 0) {
      list[idx] = { ...plan, updated_at: new Date().toISOString() };
    } else {
      list.unshift({ ...plan, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    this.save('plans', list);
    return plan;
  }

  // Tax & Discounts
  static getTaxRates(): TaxRate[] {
    return this.load('tax_rates', INITIAL_DATA.tax_rates);
  }

  static saveTaxRate(rate: TaxRate): TaxRate {
    const list = this.getTaxRates();
    const idx = list.findIndex(r => r.id === rate.id);
    if (idx >= 0) list[idx] = rate;
    else list.push(rate);
    this.save('tax_rates', list);
    return rate;
  }

  static getDiscountRules(): DiscountRule[] {
    return this.load('discount_rules', INITIAL_DATA.discount_rules);
  }

  static saveDiscountRule(rule: DiscountRule): DiscountRule {
    const list = this.getDiscountRules();
    const idx = list.findIndex(r => r.id === rule.id);
    if (idx >= 0) list[idx] = rule;
    else list.push(rule);
    this.save('discount_rules', list);
    return rule;
  }

  // Quotation Templates
  static getQuotationTemplates(): QuotationTemplate[] {
    return this.load('quotation_templates', INITIAL_DATA.quotation_templates);
  }

  static saveQuotationTemplate(tmpl: QuotationTemplate): QuotationTemplate {
    const list = this.getQuotationTemplates();
    const idx = list.findIndex(t => t.id === tmpl.id);
    if (idx >= 0) list[idx] = tmpl;
    else list.unshift({ ...tmpl, created_at: new Date().toISOString() });
    this.save('quotation_templates', list);
    return tmpl;
  }

  // Quotations
  static getQuotations(): Quotation[] {
    return this.load('quotations', INITIAL_DATA.quotations);
  }

  static saveQuotation(quote: Quotation): Quotation {
    const list = this.getQuotations();
    const idx = list.findIndex(q => q.id === quote.id);
    if (idx >= 0) {
      list[idx] = { ...quote, updated_at: new Date().toISOString() };
    } else {
      list.unshift({ ...quote, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    this.save('quotations', list);
    return quote;
  }

  // Convert Quotation to Subscription (Atomic RPC replica)
  static convertQuotationToSubscription(quotationId: string, autoActivate: boolean = true): { success: boolean; subscription?: Subscription; error?: string } {
    const quotations = this.getQuotations();
    const quote = quotations.find(q => q.id === quotationId);

    if (!quote) return { success: false, error: 'Quotation not found' };
    if (quote.status === 'converted') return { success: false, error: 'Quotation already converted' };

    // Check expiry
    const today = new Date().toISOString().split('T')[0];
    if (quote.valid_until < today) {
      quote.status = 'expired';
      this.save('quotations', quotations);
      return { success: false, error: `Cannot convert expired quotation (expired on ${quote.valid_until})` };
    }

    const plans = this.getPlans();
    const plan = plans.find(p => p.id === quote.plan_id);
    const subNumber = `SUB-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const newSub: Subscription = {
      id: crypto.randomUUID(),
      subscription_number: subNumber,
      customer_id: quote.customer_id,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      plan_id: quote.plan_id,
      plan_name: plan?.name || quote.plan_name,
      quotation_id: quote.id,
      status: autoActivate ? 'active' : 'confirmed',
      start_date: today,
      next_billing_date: today,
      billing_frequency: plan?.billing_frequency || 'monthly',
      payment_terms: 'Net 15',
      auto_renew: true,
      subtotal: quote.subtotal,
      discount_amount: quote.discount_amount,
      tax_amount: quote.tax_amount,
      total_amount: quote.total_amount,
      notes: quote.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lines: quote.lines?.map(l => ({
        id: crypto.randomUUID(),
        subscription_id: '',
        product_id: l.product_id,
        product_name: l.product_name,
        variant_id: l.variant_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: l.discount_amount,
        tax_rate_snapshot: l.tax_rate,
        line_total: l.line_total,
      })) || [],
    };

    // Save subscription
    const subs = this.getSubscriptions();
    subs.unshift(newSub);
    this.save('subscriptions', subs);

    // Update quotation status
    quote.status = 'converted';
    quote.converted_subscription_id = newSub.id;
    this.save('quotations', quotations);

    return { success: true, subscription: newSub };
  }

  // Subscriptions
  static getSubscriptions(): Subscription[] {
    return this.load('subscriptions', INITIAL_DATA.subscriptions);
  }

  static saveSubscription(sub: Subscription): Subscription {
    const list = this.getSubscriptions();
    const idx = list.findIndex(s => s.id === sub.id);
    if (idx >= 0) {
      list[idx] = { ...sub, updated_at: new Date().toISOString() };
    } else {
      list.unshift({ ...sub, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    this.save('subscriptions', list);
    return sub;
  }

  // Lifecycle transition RPC replica
  static transitionSubscriptionStatus(
    subscriptionId: string,
    newStatus: Subscription['status'],
    reason?: string
  ): { success: boolean; error?: string } {
    const subs = this.getSubscriptions();
    const sub = subs.find(s => s.id === subscriptionId);
    if (!sub) return { success: false, error: 'Subscription not found' };

    const plans = this.getPlans();
    const plan = plans.find(p => p.id === sub.plan_id);

    // Validate lifecycle transitions
    let allowed = false;
    if (sub.status === 'draft' && ['quotation', 'confirmed', 'active'].includes(newStatus)) allowed = true;
    else if (sub.status === 'quotation' && ['confirmed', 'closed'].includes(newStatus)) allowed = true;
    else if (sub.status === 'confirmed' && ['active', 'closed'].includes(newStatus)) allowed = true;
    else if (sub.status === 'active' && newStatus === 'paused') {
      if (plan && !plan.pause_allowed) return { success: false, error: 'Plan does not permit pausing this subscription' };
      allowed = true;
    } else if (sub.status === 'paused' && newStatus === 'active') allowed = true;
    else if (['active', 'paused', 'confirmed'].includes(sub.status) && newStatus === 'closed') {
      if (plan && !plan.early_close_allowed) return { success: false, error: 'Plan does not permit early closing of this subscription' };
      allowed = true;
    } else if (sub.status === 'closed' && newStatus === 'active') {
      if (plan && !plan.renewal_allowed) return { success: false, error: 'Plan does not permit renewal of this subscription' };
      allowed = true;
    }

    if (!allowed) {
      return { success: false, error: `Disallowed lifecycle transition from "${sub.status}" to "${newStatus}"` };
    }

    sub.status = newStatus;
    if (newStatus === 'paused') sub.paused_at = new Date().toISOString();
    if (newStatus === 'closed') {
      sub.closed_at = new Date().toISOString();
      sub.close_reason = reason || 'Customer requested termination';
    }
    sub.updated_at = new Date().toISOString();

    this.save('subscriptions', subs);
    return { success: true };
  }

  // Invoices
  static getInvoices(): Invoice[] {
    return this.load('invoices', INITIAL_DATA.invoices);
  }

  static saveInvoice(invoice: Invoice): Invoice {
    const list = this.getInvoices();
    const idx = list.findIndex(i => i.id === invoice.id);
    if (idx >= 0) {
      list[idx] = { ...invoice, updated_at: new Date().toISOString() };
    } else {
      list.unshift({ ...invoice, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    this.save('invoices', list);
    return invoice;
  }

  // Payments & Atomic RPC replica
  static getPayments(): Payment[] {
    return this.load('payments', INITIAL_DATA.payments);
  }

  static recordPayment(
    invoiceId: string,
    amount: number,
    paymentMethod: Payment['payment_method'],
    transactionReference?: string,
    notes?: string
  ): { success: boolean; payment?: Payment; error?: string } {
    if (amount <= 0) return { success: false, error: 'Payment amount must be greater than zero' };

    const invoices = this.getInvoices();
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.status === 'cancelled') return { success: false, error: 'Cannot pay a cancelled invoice' };

    const remaining = invoice.total_amount - invoice.amount_paid;
    if (amount > remaining + 0.01) {
      return {
        success: false,
        error: `Payment of ₹${amount.toFixed(2)} exceeds remaining balance of ₹${remaining.toFixed(2)}`,
      };
    }

    const newAmountPaid = Number((invoice.amount_paid + amount).toFixed(2));
    const isFullyPaid = newAmountPaid >= invoice.total_amount - 0.01;
    invoice.amount_paid = newAmountPaid;
    invoice.status = isFullyPaid ? 'paid' : 'confirmed';
    invoice.updated_at = new Date().toISOString();
    this.save('invoices', invoices);

    const paymentNum = `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newPayment: Payment = {
      id: crypto.randomUUID(),
      payment_number: paymentNum,
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      customer_id: invoice.customer_id,
      customer_name: invoice.customer_name,
      amount,
      payment_method: paymentMethod,
      payment_date: new Date().toISOString(),
      transaction_reference: transactionReference || `TXN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      notes: notes || '',
      created_at: new Date().toISOString(),
    };

    const payments = this.getPayments();
    payments.unshift(newPayment);
    this.save('payments', payments);

    return { success: true, payment: newPayment };
  }

  // Recurring Billing Engine RPC Replica
  static generateRecurringInvoices(targetDate: string = new Date().toISOString().split('T')[0]): {
    success: boolean;
    processed_count: number;
    skipped_count: number;
    errors: string[];
  } {
    const subs = this.getSubscriptions();
    const invoices = this.getInvoices();
    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    subs.forEach(sub => {
      if (sub.status !== 'active') return;
      if (!sub.next_billing_date || sub.next_billing_date > targetDate) return;

      // Expiry check
      if (sub.expiry_date && sub.next_billing_date > sub.expiry_date) {
        sub.status = 'expired';
        return;
      }

      const periodStr = formatBillingPeriod(sub.next_billing_date, sub.billing_frequency);
      const idempotencyKey = `${sub.id}_${periodStr}`;

      // Idempotency check: prevent duplicate billing for same cycle
      if (invoices.some(i => i.idempotency_key === idempotencyKey)) {
        skipped++;
        // Advance next date so it doesn't get perpetually blocked
        sub.next_billing_date = calculateNextBillingDate(sub.next_billing_date, sub.billing_frequency);
        return;
      }

      const invNum = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const dueDate = new Date(new Date(sub.next_billing_date).getTime() + 15 * 86400000).toISOString().split('T')[0];

      const newInv: Invoice = {
        id: crypto.randomUUID(),
        invoice_number: invNum,
        customer_id: sub.customer_id,
        customer_name: sub.customer_name,
        customer_email: sub.customer_email,
        subscription_id: sub.id,
        subscription_number: sub.subscription_number,
        billing_period: periodStr,
        issue_date: sub.next_billing_date,
        due_date: dueDate,
        subtotal: sub.subtotal,
        discount_amount: sub.discount_amount,
        tax_amount: sub.tax_amount,
        total_amount: sub.total_amount,
        amount_paid: 0.0,
        status: 'confirmed',
        idempotency_key: idempotencyKey,
        notes: `Recurring automatic billing for ${sub.plan_name} (${periodStr})`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      invoices.unshift(newInv);
      processed++;

      // Advance next billing date safely
      sub.next_billing_date = calculateNextBillingDate(sub.next_billing_date, sub.billing_frequency);
      sub.updated_at = new Date().toISOString();
    });

    this.save('subscriptions', subs);
    this.save('invoices', invoices);

    return {
      success: true,
      processed_count: processed,
      skipped_count: skipped,
      errors,
    };
  }

  // Dashboard Aggregates (Normalized MRR formula)
  static getDashboardAnalytics(): DashboardMetrics {
    const subs = this.getSubscriptions();
    const invoices = this.getInvoices();
    const customers = this.getCustomers();
    const payments = this.getPayments();
    const today = new Date().toISOString().split('T')[0];

    // Normalized Monthly Recurring Revenue:
    // Daily: * 30
    // Weekly: * (52 / 12) = * 4.333
    // Monthly: * 1
    // Yearly: / 12
    let mrr = 0;
    let activeSubs = 0;
    const subDist: Record<string, number> = {};

    subs.forEach(s => {
      subDist[s.status] = (subDist[s.status] || 0) + 1;
      if (s.status === 'active') {
        activeSubs++;
        switch (s.billing_frequency) {
          case 'daily':
            mrr += s.total_amount * 30;
            break;
          case 'weekly':
            mrr += s.total_amount * (52 / 12);
            break;
          case 'monthly':
            mrr += s.total_amount;
            break;
          case 'yearly':
            mrr += s.total_amount / 12;
            break;
        }
      }
    });

    let collected = 0;
    let outstanding = 0;
    let overdueCount = 0;

    invoices.forEach(i => {
      if (i.status !== 'cancelled') {
        collected += i.amount_paid;
        outstanding += Math.max(0, i.total_amount - i.amount_paid);
        if (i.status === 'confirmed' && isOverdue(i.due_date, i.status)) {
          overdueCount++;
        }
      }
    });

    // Payment methods
    const methodMap: Record<string, { count: number; total: number }> = {};
    payments.forEach(p => {
      if (!methodMap[p.payment_method]) {
        methodMap[p.payment_method] = { count: 0, total: 0 };
      }
      methodMap[p.payment_method].count++;
      methodMap[p.payment_method].total += p.amount;
    });

    const paymentMethods = Object.entries(methodMap).map(([method, data]) => ({
      payment_method: method,
      count: data.count,
      total_amount: Number(data.total.toFixed(2)),
    }));

    // Revenue by month (last 6 months)
    const revenueByMonth = [
      { month: 'May 2026', revenue: 4200.0 },
      { month: 'Jun 2026', revenue: 29736.0 },
      { month: 'Jul 2026', revenue: 3850.0 },
      { month: 'Aug 2026', revenue: 4100.0 },
      { month: 'Sep 2026', revenue: 6018.72 },
      { month: 'Oct 2026', revenue: collected > 35000 ? collected - 30000 : 2800.0 },
    ];

    // Upcoming renewals: active subs ordered by next billing date
    const upcomingRenewals = subs
      .filter(s => s.status === 'active' && s.next_billing_date)
      .sort((a, b) => (a.next_billing_date! > b.next_billing_date! ? 1 : -1))
      .slice(0, 5);

    return {
      mrr: Number(mrr.toFixed(2)),
      active_subscriptions: activeSubs,
      total_customers: customers.filter(c => c.status === 'active').length,
      collected_revenue: Number(collected.toFixed(2)),
      outstanding_revenue: Number(outstanding.toFixed(2)),
      overdue_invoices_count: overdueCount,
      subscription_status_distribution: subDist,
      revenue_by_month: revenueByMonth,
      payment_methods: paymentMethods,
      recent_payments: payments.slice(0, 5),
      upcoming_renewals: upcomingRenewals,
      recent_invoices: invoices.slice(0, 5),
    };
  }
}

// Automatically seed on initial load
if (typeof window !== 'undefined') {
  SubflowStore.initialize();
}
