-- ============================================================================
-- SUBFLOW: Subscription Lifecycle and Recurring Billing Platform
-- Database Migration 002: Realistic Seed Data for Brightloop Software
-- 5 Customers, 5 Products, 3 Variants, 4 Plans, 8 Subscriptions, 10 Invoices, 5 Payments
-- ============================================================================

-- Constant UUIDs for deterministic relationships
DO $$
DECLARE
    -- Admin & Staff Profiles
    v_admin_id UUID := 'a0000000-0000-0000-0000-000000000001';
    v_staff_id UUID := 'a0000000-0000-0000-0000-000000000002';
    v_cust_user_id UUID := 'a0000000-0000-0000-0000-000000000003';

    -- Customers
    v_c1 UUID := 'c0000000-0000-0000-0000-000000000001';
    v_c2 UUID := 'c0000000-0000-0000-0000-000000000002';
    v_c3 UUID := 'c0000000-0000-0000-0000-000000000003';
    v_c4 UUID := 'c0000000-0000-0000-0000-000000000004';
    v_c5 UUID := 'c0000000-0000-0000-0000-000000000005';

    -- Products
    v_p1 UUID := 'p0000000-0000-0000-0000-000000000001'; -- Brightloop Core SaaS
    v_p2 UUID := 'p0000000-0000-0000-0000-000000000002'; -- Advanced Analytics Addon
    v_p3 UUID := 'p0000000-0000-0000-0000-000000000003'; -- Enterprise SLA Support
    v_p4 UUID := 'p0000000-0000-0000-0000-000000000004'; -- Odoo Bi-directional Sync
    v_p5 UUID := 'p0000000-0000-0000-0000-000000000005'; -- Custom Webhook Automation

    -- Product Variants
    v_pv1 UUID := 'v0000000-0000-0000-0000-000000000001'; -- Odoo Enterprise Connector
    v_pv2 UUID := 'v0000000-0000-0000-0000-000000000002'; -- Dedicated Cloud Instance
    v_pv3 UUID := 'v0000000-0000-0000-0000-000000000003'; -- 24x7 Dedicated TAM

    -- Plans
    v_pl_daily UUID := 'f0000000-0000-0000-0000-000000000001';   -- Daily Micro-Billing
    v_pl_weekly UUID := 'f0000000-0000-0000-0000-000000000002';  -- Growth Weekly Sprint
    v_pl_monthly UUID := 'f0000000-0000-0000-0000-000000000003'; -- Professional Monthly
    v_pl_yearly UUID := 'f0000000-0000-0000-0000-000000000004';  -- Enterprise Annual

    -- Tax Rates & Discounts
    v_tax_gst UUID := 't0000000-0000-0000-0000-000000000001';
    v_tax_zero UUID := 't0000000-0000-0000-0000-000000000002';
    v_disc_early UUID := 'd0000000-0000-0000-0000-000000000001';
    v_disc_flat UUID := 'd0000000-0000-0000-0000-000000000002';

    -- Quotations & Subscriptions & Invoices
    v_s1 UUID := 's0000000-0000-0000-0000-000000000001';
    v_s2 UUID := 's0000000-0000-0000-0000-000000000002';
    v_s3 UUID := 's0000000-0000-0000-0000-000000000003';
    v_s4 UUID := 's0000000-0000-0000-0000-000000000004';
    v_s5 UUID := 's0000000-0000-0000-0000-000000000005';
    v_s6 UUID := 's0000000-0000-0000-0000-000000000006';
    v_s7 UUID := 's0000000-0000-0000-0000-000000000007';
    v_s8 UUID := 's0000000-0000-0000-0000-000000000008';

    v_inv1 UUID := 'i0000000-0000-0000-0000-000000000001';
    v_inv2 UUID := 'i0000000-0000-0000-0000-000000000002';
    v_inv3 UUID := 'i0000000-0000-0000-0000-000000000003';
    v_inv4 UUID := 'i0000000-0000-0000-0000-000000000004';
    v_inv5 UUID := 'i0000000-0000-0000-0000-000000000005';
    v_inv6 UUID := 'i0000000-0000-0000-0000-000000000006';
    v_inv7 UUID := 'i0000000-0000-0000-0000-000000000007';
    v_inv8 UUID := 'i0000000-0000-0000-0000-000000000008';
    v_inv9 UUID := 'i0000000-0000-0000-0000-000000000009';
    v_inv10 UUID := 'i0000000-0000-0000-0000-000000000010';

BEGIN
    -- 1. SEED 5 CUSTOMERS
    INSERT INTO customers (id, name, email, phone, company, tax_id, billing_address, city, state, postal_code, country, status)
    VALUES
    (v_c1, 'Alex Mercer', 'alex.mercer@apextech.io', '+91 98765 43210', 'Apex Dynamics Ltd', 'GSTIN27AABCA1234F1Z5', '104 Tech Valley, Phase 2', 'Bengaluru', 'Karnataka', '560100', 'India', 'active'),
    (v_c2, 'Priya Sharma', 'priya.sharma@zenithcloud.in', '+91 98111 22334', 'Zenith Cloud Labs', 'GSTIN29XYZAB5678C1Z2', 'Plot 42 Cyber City', 'Hyderabad', 'Telangana', '500081', 'India', 'active'),
    (v_c3, 'David Chen', 'david.chen@hyperflow.com', '+1 415 555 0192', 'HyperFlow Logistics', 'US-EIN-9923847', '55 Market Street, Suite 900', 'San Francisco', 'CA', '94105', 'United States', 'active'),
    (v_c4, 'Neha Verma', 'neha.verma@auroratech.org', '+91 97234 11009', 'Aurora BioTech Innovations', 'GSTIN07BCDEF9012D1Z9', 'Tower B, Connaught Place', 'New Delhi', 'Delhi', '110001', 'India', 'active'),
    (v_c5, 'Rohan Kapoor', 'rohan@kapoorsystems.com', '+91 99001 88776', 'Kapoor Enterprise Systems', 'GSTIN24GHIJK3456K1Z8', 'B-12 Science City Road', 'Ahmedabad', 'Gujarat', '380060', 'India', 'active')
    ON CONFLICT (id) DO NOTHING;

    -- 2. SEED 5 PRODUCTS
    INSERT INTO products (id, name, code, product_type, sales_price, cost_price, description, notes, is_active)
    VALUES
    (v_p1, 'Brightloop Core Platform', 'PRD-CORE-01', 'software', 2000.00, 450.00, 'Enterprise subscription billing and recurring invoice engine', 'Base software tier', true),
    (v_p2, 'Advanced Revenue Analytics', 'PRD-ANLY-02', 'addon', 750.00, 150.00, 'Cohorts, retention metrics, and real-time MRR waterfall reporting', 'Optional analytics add-on', true),
    (v_p3, 'Enterprise SLA & Support', 'PRD-SPRT-03', 'service', 1500.00, 600.00, '24/7 dedicated support with 15-minute response time guarantee', 'Standard SLA tier', true),
    (v_p4, 'Odoo ERP Sync Module', 'PRD-ODOO-04', 'software', 1200.00, 300.00, 'Seamless two-way data bridge connecting Subflow to Odoo accounting', 'Integrations tier', true),
    (v_p5, 'Webhook & Custom Automation', 'PRD-AUTO-05', 'addon', 500.00, 80.00, 'Custom event webhooks and Zapier / Make connectors', 'Automation module', true)
    ON CONFLICT (id) DO NOTHING;

    -- 3. SEED 3 PRODUCT VARIANTS (e.g. Base ₹2,000 + Odoo variant adds ₹560)
    INSERT INTO product_variants (id, product_id, variant_name, variant_value, price_surcharge, sku, is_active)
    VALUES
    (v_pv1, v_p1, 'Brand Integration', 'Odoo Edition', 560.00, 'PRD-CORE-ODOO', true),
    (v_pv2, v_p1, 'Deployment', 'Dedicated High-Availability Cloud', 1000.00, 'PRD-CORE-DED', true),
    (v_pv3, v_p3, 'Assistance Level', 'Dedicated Technical Account Manager', 850.00, 'PRD-SPRT-TAM', true)
    ON CONFLICT (id) DO NOTHING;

    -- 4. SEED 4 PLANS (Daily, Weekly, Monthly, Yearly)
    INSERT INTO plans (id, name, code, description, price, billing_frequency, min_quantity, available_from, auto_close, early_close_allowed, pause_allowed, renewal_allowed, is_active)
    VALUES
    (v_pl_daily, 'On-Demand Daily Pass', 'PLAN-DAILY', 'Micro-billing tier for flexible developer environments', 120.00, 'daily', 1, CURRENT_DATE - INTERVAL '60 days', false, true, true, true, true),
    (v_pl_weekly, 'Growth Sprint Weekly', 'PLAN-WEEKLY', 'Rapid iteration tier for sprint projects and seasonal teams', 650.00, 'weekly', 1, CURRENT_DATE - INTERVAL '90 days', false, true, true, true, true),
    (v_pl_monthly, 'Professional Monthly', 'PLAN-MONTHLY', 'Standard enterprise plan with full features billed monthly', 2560.00, 'monthly', 1, CURRENT_DATE - INTERVAL '180 days', false, true, true, true, true),
    (v_pl_yearly, 'Enterprise Annual Platinum', 'PLAN-YEARLY', 'Complete suite with annual billing discount and dedicated support', 28000.00, 'yearly', 1, CURRENT_DATE - INTERVAL '365 days', false, true, true, true, true)
    ON CONFLICT (id) DO NOTHING;

    -- 5. SEED TAX RATES & DISCOUNT RULES
    INSERT INTO tax_rates (id, name, rate, is_compound, is_default, is_active)
    VALUES
    (v_tax_gst, 'GST 18% (Standard Software)', 18.00, false, true, true),
    (v_tax_zero, 'Zero-Rated Export 0%', 0.00, false, false, true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO discount_rules (id, code, description, discount_type, value, min_purchase_amount, min_quantity, start_date, max_usage_count, current_usage_count, is_subscription_wide, is_active)
    VALUES
    (v_disc_early, 'BRIGHTEARLY10', 'Early adopter 10% platform discount', 'percentage', 10.00, 1000.00, 1, CURRENT_DATE - INTERVAL '30 days', 100, 12, true, true),
    (v_disc_flat, 'LAUNCH500', 'Flat ₹500 discount for new subscribers', 'fixed', 500.00, 2000.00, 1, CURRENT_DATE - INTERVAL '45 days', 50, 8, true, true)
    ON CONFLICT (id) DO NOTHING;

    -- 6. SEED 8 SUBSCRIPTIONS ACROSS LIFECYCLE STATES
    -- Sub 1: Active Monthly (Apex Dynamics)
    INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, expiry_date, next_billing_date, billing_frequency, payment_terms, auto_renew, subtotal, discount_amount, tax_amount, total_amount)
    VALUES (v_s1, 'SUB-2026-00001', v_c1, v_pl_monthly, 'active', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '305 days', CURRENT_DATE + INTERVAL '5 days', 'monthly', 'Net 15', true, 2560.00, 256.00, 414.72, 2718.72)
    ON CONFLICT (id) DO NOTHING;

    -- Sub 2: Active Annual (Zenith Cloud)
    INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, expiry_date, next_billing_date, billing_frequency, payment_terms, auto_renew, subtotal, discount_amount, tax_amount, total_amount)
    VALUES (v_s2, 'SUB-2026-00002', v_c2, v_pl_yearly, 'active', CURRENT_DATE - INTERVAL '120 days', CURRENT_DATE + INTERVAL '245 days', CURRENT_DATE + INTERVAL '245 days', 'yearly', 'Net 30', true, 28000.00, 2800.00, 4536.00, 29736.00)
    ON CONFLICT (id) DO NOTHING;

    -- Sub 3: Active Weekly (HyperFlow)
    INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, expiry_date, next_billing_date, billing_frequency, payment_terms, auto_renew, subtotal, discount_amount, tax_amount, total_amount)
    VALUES (v_s3, 'SUB-2026-00003', v_c3, v_pl_weekly, 'active', CURRENT_DATE - INTERVAL '21 days', CURRENT_DATE + INTERVAL '70 days', CURRENT_DATE + INTERVAL '2 days', 'weekly', 'Due on Receipt', true, 650.00, 0.00, 0.00, 650.00)
    ON CONFLICT (id) DO NOTHING;

    -- Sub 4: Active Daily (Aurora BioTech)
    INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, expiry_date, next_billing_date, billing_frequency, payment_terms, auto_renew, subtotal, discount_amount, tax_amount, total_amount)
    VALUES (v_s4, 'SUB-2026-00004', v_c4, v_pl_daily, 'active', CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE + INTERVAL '20 days', CURRENT_DATE, 'daily', 'Due on Receipt', true, 120.00, 0.00, 21.60, 141.60)
    ON CONFLICT (id) DO NOTHING;

    -- Sub 5: Confirmed (Kapoor Enterprise)
    INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, expiry_date, next_billing_date, billing_frequency, payment_terms, auto_renew, subtotal, discount_amount, tax_amount, total_amount)
    VALUES (v_s5, 'SUB-2026-00005', v_c5, v_pl_monthly, 'confirmed', CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days', CURRENT_DATE, 'monthly', 'Net 15', true, 2560.00, 500.00, 370.80, 2430.80)
    ON CONFLICT (id) DO NOTHING;

    -- Sub 6: Paused (Apex Dynamics)
    INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, expiry_date, next_billing_date, billing_frequency, payment_terms, auto_renew, paused_at, subtotal, discount_amount, tax_amount, total_amount)
    VALUES (v_s6, 'SUB-2026-00006', v_c1, v_pl_weekly, 'paused', CURRENT_DATE - INTERVAL '40 days', CURRENT_DATE + INTERVAL '50 days', CURRENT_DATE + INTERVAL '10 days', 'weekly', 'Net 15', false, now() - INTERVAL '5 days', 650.00, 0.00, 117.00, 767.00)
    ON CONFLICT (id) DO NOTHING;

    -- Sub 7: Closed / Cancelled
    INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, expiry_date, next_billing_date, billing_frequency, payment_terms, auto_renew, closed_at, close_reason, subtotal, discount_amount, tax_amount, total_amount)
    VALUES (v_s7, 'SUB-2026-00007', v_c3, v_pl_monthly, 'closed', CURRENT_DATE - INTERVAL '150 days', CURRENT_DATE - INTERVAL '30 days', NULL, 'monthly', 'Net 15', false, now() - INTERVAL '30 days', 'Customer requested early termination due to restructuring', 2560.00, 0.00, 460.80, 3020.80)
    ON CONFLICT (id) DO NOTHING;

    -- Sub 8: Draft Subscription
    INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, expiry_date, next_billing_date, billing_frequency, payment_terms, auto_renew, subtotal, discount_amount, tax_amount, total_amount)
    VALUES (v_s8, 'SUB-2026-00008', v_c2, v_pl_monthly, 'draft', CURRENT_DATE + INTERVAL '7 days', CURRENT_DATE + INTERVAL '372 days', CURRENT_DATE + INTERVAL '7 days', 'monthly', 'Net 15', true, 3250.00, 0.00, 585.00, 3835.00)
    ON CONFLICT (id) DO NOTHING;

    -- Add lines for subscriptions
    INSERT INTO subscription_lines (subscription_id, product_id, variant_id, quantity, unit_price, discount_amount, tax_rate_snapshot, line_total)
    VALUES
    (v_s1, v_p1, v_pv1, 1, 2560.00, 256.00, 18.00, 2304.00),
    (v_s2, v_p1, NULL, 10, 2800.00, 2800.00, 18.00, 25200.00),
    (v_s3, v_p1, NULL, 1, 650.00, 0.00, 0.00, 650.00),
    (v_s4, v_p1, NULL, 1, 120.00, 0.00, 18.00, 120.00),
    (v_s5, v_p1, v_pv1, 1, 2560.00, 500.00, 18.00, 2060.00)
    ON CONFLICT DO NOTHING;

    -- 7. SEED 10 INVOICES (Paid, Confirmed/Pending, Overdue, Draft)
    -- Inv 1: Paid Annual (Zenith)
    INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, billing_period, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, status, idempotency_key)
    VALUES (v_inv1, 'INV-2026-00101', v_c2, v_s2, '2026 Annual', CURRENT_DATE - INTERVAL '120 days', CURRENT_DATE - INTERVAL '90 days', 28000.00, 2800.00, 4536.00, 29736.00, 29736.00, 'paid', 's2_annual_2026')
    ON CONFLICT (id) DO NOTHING;

    -- Inv 2: Paid Monthly (Apex)
    INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, billing_period, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, status, idempotency_key)
    VALUES (v_inv2, 'INV-2026-00102', v_c1, v_s1, 'September 2026', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '45 days', 2560.00, 256.00, 414.72, 2718.72, 2718.72, 'paid', 's1_sep_2026')
    ON CONFLICT (id) DO NOTHING;

    -- Inv 3: Partially Paid Monthly (Apex)
    INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, billing_period, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, status, idempotency_key)
    VALUES (v_inv3, 'INV-2026-00103', v_c1, v_s1, 'October 2026', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '15 days', 2560.00, 256.00, 414.72, 2718.72, 1500.00, 'confirmed', 's1_oct_2026')
    ON CONFLICT (id) DO NOTHING;

    -- Inv 4: Paid Weekly (HyperFlow)
    INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, billing_period, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, status, idempotency_key)
    VALUES (v_inv4, 'INV-2026-00104', v_c3, v_s3, 'Week 41', CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '7 days', 650.00, 0.00, 0.00, 650.00, 650.00, 'paid', 's3_w41')
    ON CONFLICT (id) DO NOTHING;

    -- Inv 5: Paid Weekly (HyperFlow)
    INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, billing_period, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, status, idempotency_key)
    VALUES (v_inv5, 'INV-2026-00105', v_c3, v_s3, 'Week 42', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE, 650.00, 0.00, 0.00, 650.00, 650.00, 'paid', 's3_w42')
    ON CONFLICT (id) DO NOTHING;

    -- Inv 6: Confirmed Overdue (Aurora)
    INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, billing_period, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, status, idempotency_key)
    VALUES (v_inv6, 'INV-2026-00106', v_c4, v_s4, 'Daily Batch Oct 20', CURRENT_DATE - INTERVAL '11 days', CURRENT_DATE - INTERVAL '4 days', 120.00, 0.00, 21.60, 141.60, 0.00, 'confirmed', 's4_d20')
    ON CONFLICT (id) DO NOTHING;

    -- Inv 7: Confirmed Active (Aurora)
    INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, billing_period, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, status, idempotency_key)
    VALUES (v_inv7, 'INV-2026-00107', v_c4, v_s4, 'Daily Batch Oct 25', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '5 days', 120.00, 0.00, 21.60, 141.60, 0.00, 'confirmed', 's4_d25')
    ON CONFLICT (id) DO NOTHING;

    -- Inv 8: Confirmed Current (Kapoor)
    INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, billing_period, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, status, idempotency_key)
    VALUES (v_inv8, 'INV-2026-00108', v_c5, v_s5, 'November 2026', CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days', 2560.00, 500.00, 370.80, 2430.80, 0.00, 'confirmed', 's5_nov_2026')
    ON CONFLICT (id) DO NOTHING;

    -- Inv 9: Draft One-time Addon (Apex)
    INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, billing_period, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, status, idempotency_key)
    VALUES (v_inv9, 'INV-2026-00109', v_c1, NULL, 'One-time Consulting', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 1500.00, 0.00, 270.00, 1770.00, 0.00, 'draft', 'onetime_apex_01')
    ON CONFLICT (id) DO NOTHING;

    -- Inv 10: Confirmed Renewal (HyperFlow)
    INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, billing_period, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, status, idempotency_key)
    VALUES (v_inv10, 'INV-2026-00110', v_c3, v_s3, 'Week 43 Current', CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days', 650.00, 0.00, 0.00, 650.00, 0.00, 'confirmed', 's3_w43')
    ON CONFLICT (id) DO NOTHING;

    -- 8. SEED 5 PAYMENTS LINKED TO INVOICES
    INSERT INTO payments (payment_number, invoice_id, customer_id, amount, payment_method, payment_date, transaction_reference, notes)
    VALUES
    ('PAY-20260701-0001', v_inv1, v_c2, 29736.00, 'bank_transfer', now() - INTERVAL '115 days', 'NEFT-ZENITH-998812', 'Full payment for annual subscription'),
    ('PAY-20260902-0002', v_inv2, v_c1, 2718.72, 'credit_card', now() - INTERVAL '58 days', 'STRIPE-CH-882193', 'Auto-debited Visa card ending 4042'),
    ('PAY-20261015-0003', v_inv3, v_c1, 1500.00, 'upi', now() - INTERVAL '10 days', 'UPI-APEX-4491029', 'Partial milestone installment'),
    ('PAY-20261017-0004', v_inv4, v_c3, 650.00, 'stripe', now() - INTERVAL '13 days', 'STRIPE-CH-991204', 'Automated weekly payout'),
    ('PAY-20261024-0005', v_inv5, v_c3, 650.00, 'stripe', now() - INTERVAL '6 days', 'STRIPE-CH-991295', 'Automated weekly payout')
    ON CONFLICT (payment_number) DO NOTHING;

END $$;
