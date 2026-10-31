-- ============================================================================
-- SUBFLOW: Subscription Lifecycle and Recurring Billing Platform
-- Database Migration 001: Core Schema, RLS, Indexes, and Atomic RPC Functions
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean existing if re-running
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS invoice_lines CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS subscription_lines CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS quotation_lines CASCADE;
DROP TABLE IF EXISTS quotations CASCADE;
DROP TABLE IF EXISTS quotation_template_lines CASCADE;
DROP TABLE IF EXISTS quotation_templates CASCADE;
DROP TABLE IF EXISTS discount_rules CASCADE;
DROP TABLE IF EXISTS tax_rates CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS product_variants CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ----------------------------------------------------------------------------
-- 1. Profiles Table (Linked with Supabase auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'staff', 'customer')),
    customer_id UUID, -- NULL for admin/staff; populated for customers
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Customers Table
-- ----------------------------------------------------------------------------
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    company TEXT,
    tax_id TEXT, -- GSTIN / VAT / Tax ID
    billing_address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT NOT NULL DEFAULT 'India',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link profile customer_id to customers(id)
ALTER TABLE profiles ADD CONSTRAINT fk_profile_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3. Products & Product Variants
-- ----------------------------------------------------------------------------
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    product_type TEXT NOT NULL DEFAULT 'software' CHECK (product_type IN ('software', 'service', 'hardware', 'addon')),
    sales_price NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (sales_price >= 0),
    cost_price NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0),
    description TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL, -- e.g. "Brand", "Tier", "Edition"
    variant_value TEXT NOT NULL, -- e.g. "Brightloop Cloud", "Odoo Integration"
    price_surcharge NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    sku TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. Subscription Plans
-- ----------------------------------------------------------------------------
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    description TEXT,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
    available_from DATE NOT NULL DEFAULT CURRENT_DATE,
    available_until DATE,
    auto_close BOOLEAN NOT NULL DEFAULT false,
    early_close_allowed BOOLEAN NOT NULL DEFAULT true,
    pause_allowed BOOLEAN NOT NULL DEFAULT true,
    renewal_allowed BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. Tax Rates & Discount Rules
-- ----------------------------------------------------------------------------
CREATE TABLE tax_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    rate NUMERIC(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    is_compound BOOLEAN NOT NULL DEFAULT false,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE discount_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    value NUMERIC(12,2) NOT NULL CHECK (value >= 0),
    min_purchase_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    max_usage_count INTEGER,
    current_usage_count INTEGER NOT NULL DEFAULT 0 CHECK (current_usage_count >= 0),
    applicable_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    is_subscription_wide BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. Quotation Templates & Lines
-- ----------------------------------------------------------------------------
CREATE TABLE quotation_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days >= 1),
    default_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
    default_tax_id UUID REFERENCES tax_rates(id) ON DELETE SET NULL,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotation_template_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. Customer Quotations & Lines
-- ----------------------------------------------------------------------------
CREATE TABLE quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    template_id UUID REFERENCES quotation_templates(id) ON DELETE SET NULL,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'converted', 'expired', 'rejected')),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    converted_subscription_id UUID,
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotation_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_id UUID REFERENCES tax_rates(id) ON DELETE SET NULL,
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    line_total NUMERIC(12,2) NOT NULL DEFAULT 0.00
);

-- ----------------------------------------------------------------------------
-- 8. Subscriptions & Subscription Lines
-- ----------------------------------------------------------------------------
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed', 'expired')),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE,
    next_billing_date DATE,
    billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    payment_terms TEXT NOT NULL DEFAULT 'Net 15',
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    paused_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    close_reason TEXT,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link back converted_subscription_id in quotations
ALTER TABLE quotations ADD CONSTRAINT fk_quotation_subscription FOREIGN KEY (converted_subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL;

CREATE TABLE subscription_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    discount_rule_id UUID REFERENCES discount_rules(id) ON DELETE SET NULL,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_rate_id UUID REFERENCES tax_rates(id) ON DELETE SET NULL,
    tax_rate_snapshot NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    line_total NUMERIC(12,2) NOT NULL DEFAULT 0.00
);

-- ----------------------------------------------------------------------------
-- 9. Invoices & Invoice Lines
-- ----------------------------------------------------------------------------
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    billing_period TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'paid', 'cancelled')),
    idempotency_key TEXT UNIQUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_rate_snapshot NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    line_total NUMERIC(12,2) NOT NULL DEFAULT 0.00
);

-- ----------------------------------------------------------------------------
-- 10. Payments
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_number TEXT NOT NULL UNIQUE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'credit_card', 'upi', 'cash', 'stripe', 'check')),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    transaction_reference TEXT,
    notes TEXT,
    recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Indexes for Sub-2-Second High Performance Querying
-- ----------------------------------------------------------------------------
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_plans_frequency ON plans(billing_frequency, is_active);
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_billing_due ON subscriptions(status, next_billing_date);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_date ON payments(payment_date);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_template_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Helper security functions
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_customer_id()
RETURNS UUID AS $$
    SELECT customer_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles: Admin/Staff read all, Users read/update own profile (cannot change role)
CREATE POLICY "Profiles viewable by user and staff" ON profiles
    FOR SELECT USING (
        auth.uid() = id OR current_user_role() IN ('admin', 'staff')
    );

CREATE POLICY "Users can update their own profile name/avatar" ON profiles
    FOR UPDATE USING (
        auth.uid() = id
    ) WITH CHECK (
        auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "Admins full management on profiles" ON profiles
    FOR ALL USING (current_user_role() = 'admin');

-- Customers
CREATE POLICY "Admin and Staff full access to customers" ON customers
    FOR ALL USING (current_user_role() IN ('admin', 'staff'));

CREATE POLICY "Customer can view only their own customer record" ON customers
    FOR SELECT USING (id = current_user_customer_id());

-- Products & Variants: Read for all authenticated; write for Admin only
CREATE POLICY "Anyone authenticated can view active products" ON products
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admin can modify products" ON products
    FOR ALL USING (current_user_role() = 'admin');

CREATE POLICY "Anyone authenticated can view variants" ON product_variants
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admin can modify product variants" ON product_variants
    FOR ALL USING (current_user_role() = 'admin');

-- Plans: Read for all authenticated; write for Admin only
CREATE POLICY "Anyone authenticated can view plans" ON plans
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admin can modify plans" ON plans
    FOR ALL USING (current_user_role() = 'admin');

-- Tax Rates & Discounts: Read for authenticated; write for Admin only
CREATE POLICY "Anyone authenticated can view tax rates" ON tax_rates
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admin can modify tax rates" ON tax_rates
    FOR ALL USING (current_user_role() = 'admin');

CREATE POLICY "Anyone authenticated can view discounts" ON discount_rules
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admin can modify discounts" ON discount_rules
    FOR ALL USING (current_user_role() = 'admin');

-- Quotation Templates: Staff and Admin full access
CREATE POLICY "Staff and Admin can manage quotation templates" ON quotation_templates
    FOR ALL USING (current_user_role() IN ('admin', 'staff'));

CREATE POLICY "Staff and Admin can manage quotation template lines" ON quotation_template_lines
    FOR ALL USING (current_user_role() IN ('admin', 'staff'));

-- Quotations
CREATE POLICY "Staff and Admin can manage quotations" ON quotations
    FOR ALL USING (current_user_role() IN ('admin', 'staff'));

CREATE POLICY "Customer can view own quotations" ON quotations
    FOR SELECT USING (customer_id = current_user_customer_id());

CREATE POLICY "Staff and Admin can manage quotation lines" ON quotation_lines
    FOR ALL USING (current_user_role() IN ('admin', 'staff'));

CREATE POLICY "Customer can view own quotation lines" ON quotation_lines
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM quotations q WHERE q.id = quotation_lines.quotation_id AND q.customer_id = current_user_customer_id())
    );

-- Subscriptions
CREATE POLICY "Staff and Admin can manage subscriptions" ON subscriptions
    FOR ALL USING (current_user_role() IN ('admin', 'staff'));

CREATE POLICY "Customer can view own subscriptions" ON subscriptions
    FOR SELECT USING (customer_id = current_user_customer_id());

CREATE POLICY "Staff and Admin can manage subscription lines" ON subscription_lines
    FOR ALL USING (current_user_role() IN ('admin', 'staff'));

CREATE POLICY "Customer can view own subscription lines" ON subscription_lines
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = subscription_lines.subscription_id AND s.customer_id = current_user_customer_id())
    );

-- Invoices
CREATE POLICY "Staff and Admin can manage invoices" ON invoices
    FOR ALL USING (current_user_role() IN ('admin', 'staff'));

CREATE POLICY "Customer can view own invoices" ON invoices
    FOR SELECT USING (customer_id = current_user_customer_id());

CREATE POLICY "Staff and Admin can manage invoice lines" ON invoice_lines
    FOR ALL USING (current_user_role() IN ('admin', 'staff'));

CREATE POLICY "Customer can view own invoice lines" ON invoice_lines
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND i.customer_id = current_user_customer_id())
    );

-- Payments
CREATE POLICY "Staff and Admin can manage payments" ON payments
    FOR ALL USING (current_user_role() IN ('admin', 'staff'));

CREATE POLICY "Customer can view own payments" ON payments
    FOR SELECT USING (customer_id = current_user_customer_id());

-- ============================================================================
-- POSTGRESQL RPC FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPC 1: record_payment
-- Atomic payment recording with row locking, balance check, and status update
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_payment(
    p_invoice_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_method TEXT,
    p_transaction_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_recorded_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_inv RECORD;
    v_new_paid NUMERIC(12,2);
    v_new_status TEXT;
    v_payment_id UUID;
    v_payment_num TEXT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- Lock invoice row for update to prevent concurrent race condition
    SELECT * INTO v_inv
    FROM invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    IF v_inv.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot record payment on a cancelled invoice';
    END IF;

    IF (v_inv.amount_paid + p_amount) > v_inv.total_amount THEN
        RAISE EXCEPTION 'Payment of % exceeds remaining balance of %', 
            p_amount, (v_inv.total_amount - v_inv.amount_paid);
    END IF;

    v_new_paid := v_inv.amount_paid + p_amount;
    IF v_new_paid >= v_inv.total_amount THEN
        v_new_status := 'paid';
    ELSE
        v_new_status := 'confirmed';
    END IF;

    -- Generate payment number
    v_payment_num := 'PAY-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    -- Insert payment record
    INSERT INTO payments (
        payment_number,
        invoice_id,
        customer_id,
        amount,
        payment_method,
        payment_date,
        transaction_reference,
        notes,
        recorded_by
    ) VALUES (
        v_payment_num,
        p_invoice_id,
        v_inv.customer_id,
        p_amount,
        p_payment_method,
        now(),
        p_transaction_reference,
        p_notes,
        p_recorded_by
    ) RETURNING id INTO v_payment_id;

    -- Update invoice
    UPDATE invoices
    SET amount_paid = v_new_paid,
        status = v_new_status,
        updated_at = now()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'payment_number', v_payment_num,
        'invoice_id', p_invoice_id,
        'amount_paid_total', v_new_paid,
        'remaining_balance', (v_inv.total_amount - v_new_paid),
        'invoice_status', v_new_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- RPC 2: transition_subscription_status
-- Validates allowed lifecycle state transitions
-- Allowed:
--   draft -> quotation
--   quotation -> confirmed
--   confirmed -> active
--   active -> paused (if plan permits)
--   paused -> active
--   active/paused/confirmed -> closed (if permitted or admin)
--   closed -> active (renewal)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION transition_subscription_status(
    p_subscription_id UUID,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
    v_allowed BOOLEAN := false;
BEGIN
    SELECT * INTO v_sub FROM subscriptions WHERE id = p_subscription_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription not found';
    END IF;

    SELECT * INTO v_plan FROM plans WHERE id = v_sub.plan_id;

    IF v_sub.status = p_new_status THEN
        RETURN jsonb_build_object('success', true, 'message', 'Status already ' || p_new_status);
    END IF;

    -- State transition checks
    IF v_sub.status = 'draft' AND p_new_status IN ('quotation', 'confirmed', 'active') THEN
        v_allowed := true;
    ELSIF v_sub.status = 'quotation' AND p_new_status IN ('confirmed', 'closed') THEN
        v_allowed := true;
    ELSIF v_sub.status = 'confirmed' AND p_new_status IN ('active', 'closed') THEN
        v_allowed := true;
    ELSIF v_sub.status = 'active' AND p_new_status = 'paused' THEN
        IF NOT COALESCE(v_plan.pause_allowed, true) THEN
            RAISE EXCEPTION 'Plan does not permit pausing this subscription';
        END IF;
        v_allowed := true;
    ELSIF v_sub.status = 'paused' AND p_new_status = 'active' THEN
        v_allowed := true;
    ELSIF v_sub.status IN ('active', 'paused', 'confirmed') AND p_new_status = 'closed' THEN
        IF NOT COALESCE(v_plan.early_close_allowed, true) AND current_user_role() != 'admin' THEN
            RAISE EXCEPTION 'Plan does not permit early closing of this subscription';
        END IF;
        v_allowed := true;
    ELSIF v_sub.status = 'closed' AND p_new_status = 'active' THEN
        IF NOT COALESCE(v_plan.renewal_allowed, true) THEN
            RAISE EXCEPTION 'Plan does not permit renewal of this subscription';
        END IF;
        v_allowed := true;
    END IF;

    IF NOT v_allowed THEN
        RAISE EXCEPTION 'Disallowed status transition from % to %', v_sub.status, p_new_status;
    END IF;

    UPDATE subscriptions
    SET status = p_new_status,
        paused_at = CASE WHEN p_new_status = 'paused' THEN now() ELSE paused_at END,
        closed_at = CASE WHEN p_new_status = 'closed' THEN now() ELSE closed_at END,
        close_reason = CASE WHEN p_new_status = 'closed' THEN p_reason ELSE close_reason END,
        updated_at = now()
    WHERE id = p_subscription_id;

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', p_subscription_id,
        'old_status', v_sub.status,
        'new_status', p_new_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- RPC 3: convert_quotation_to_subscription
-- Converts an active, unexpired quotation into a Confirmed or Active Subscription
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION convert_quotation_to_subscription(
    p_quotation_id UUID,
    p_auto_activate BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
    v_quot RECORD;
    v_sub_id UUID;
    v_sub_num TEXT;
    v_qline RECORD;
    v_initial_status TEXT;
    v_next_bill DATE;
BEGIN
    SELECT * INTO v_quot FROM quotations WHERE id = p_quotation_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quotation not found';
    END IF;

    IF v_quot.status = 'converted' THEN
        RAISE EXCEPTION 'Quotation has already been converted to a subscription';
    END IF;

    IF v_quot.valid_until < CURRENT_DATE THEN
        -- Mark as expired and throw
        UPDATE quotations SET status = 'expired' WHERE id = p_quotation_id;
        RAISE EXCEPTION 'Cannot convert expired quotation (Expired on %)', v_quot.valid_until;
    END IF;

    -- Generate subscription number
    v_sub_num := 'SUB-' || TO_CHAR(now(), 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
    v_initial_status := CASE WHEN p_auto_activate THEN 'active' ELSE 'confirmed' END;
    v_next_bill := CURRENT_DATE;

    -- Insert subscription
    INSERT INTO subscriptions (
        subscription_number,
        customer_id,
        plan_id,
        quotation_id,
        status,
        start_date,
        next_billing_date,
        billing_frequency,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        notes,
        created_by
    )
    SELECT
        v_sub_num,
        v_quot.customer_id,
        v_quot.plan_id,
        v_quot.id,
        v_initial_status,
        CURRENT_DATE,
        v_next_bill,
        p.billing_frequency,
        v_quot.subtotal,
        v_quot.discount_amount,
        v_quot.tax_amount,
        v_quot.total_amount,
        v_quot.notes,
        v_quot.created_by
    FROM plans p WHERE p.id = v_quot.plan_id
    RETURNING id INTO v_sub_id;

    -- Copy quotation lines to subscription lines
    FOR v_qline IN SELECT * FROM quotation_lines WHERE quotation_id = p_quotation_id LOOP
        INSERT INTO subscription_lines (
            subscription_id,
            product_id,
            variant_id,
            quantity,
            unit_price,
            discount_amount,
            tax_rate_id,
            tax_rate_snapshot,
            line_total
        ) VALUES (
            v_sub_id,
            v_qline.product_id,
            v_qline.variant_id,
            v_qline.quantity,
            v_qline.unit_price,
            v_qline.discount_amount,
            v_qline.tax_id,
            v_qline.tax_rate,
            v_qline.line_total
        );
    END LOOP;

    -- Update quotation status
    UPDATE quotations
    SET status = 'converted',
        converted_subscription_id = v_sub_id,
        updated_at = now()
    WHERE id = p_quotation_id;

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_sub_id,
        'subscription_number', v_sub_num,
        'status', v_initial_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- RPC 4: generate_recurring_invoices
-- The transactional billing engine.
-- Processes active subscriptions due for billing up to p_target_date (default CURRENT_DATE).
-- Idempotency key: sub_id + billing_period.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_recurring_invoices(
    p_target_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
    v_sline RECORD;
    v_inv_id UUID;
    v_inv_num TEXT;
    v_period_str TEXT;
    v_idempotency_key TEXT;
    v_next_date DATE;
    v_due_date DATE;
    v_processed_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
    v_errors JSONB := '[]'::JSONB;
BEGIN
    FOR v_sub IN 
        SELECT s.* 
        FROM subscriptions s
        WHERE s.status = 'active'
          AND s.next_billing_date <= p_target_date
        ORDER BY s.next_billing_date ASC
        FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            -- Check expiry date if specified
            IF v_sub.expiry_date IS NOT NULL AND v_sub.next_billing_date > v_sub.expiry_date THEN
                UPDATE subscriptions
                SET status = 'expired', updated_at = now()
                WHERE id = v_sub.id;
                CONTINUE;
            END IF;

            SELECT * INTO v_plan FROM plans WHERE id = v_sub.plan_id;

            -- Calculate period string & next billing date based on frequency
            IF v_sub.billing_frequency = 'daily' THEN
                v_period_str := TO_CHAR(v_sub.next_billing_date, 'YYYY-MM-DD');
                v_next_date := v_sub.next_billing_date + INTERVAL '1 day';
            ELSIF v_sub.billing_frequency = 'weekly' THEN
                v_period_str := TO_CHAR(v_sub.next_billing_date, 'YYYY-MM-DD') || ' to ' || TO_CHAR(v_sub.next_billing_date + INTERVAL '6 days', 'YYYY-MM-DD');
                v_next_date := v_sub.next_billing_date + INTERVAL '7 days';
            ELSIF v_sub.billing_frequency = 'monthly' THEN
                v_period_str := TO_CHAR(v_sub.next_billing_date, 'Month YYYY');
                v_next_date := v_sub.next_billing_date + INTERVAL '1 month';
            ELSIF v_sub.billing_frequency = 'yearly' THEN
                v_period_str := TO_CHAR(v_sub.next_billing_date, 'YYYY') || ' Annual';
                v_next_date := v_sub.next_billing_date + INTERVAL '1 year';
            ELSE
                v_period_str := TO_CHAR(v_sub.next_billing_date, 'YYYY-MM-DD');
                v_next_date := v_sub.next_billing_date + INTERVAL '1 month';
            END IF;

            v_idempotency_key := v_sub.id::TEXT || '_' || v_period_str;

            -- Check if invoice for this period already exists
            IF EXISTS (SELECT 1 FROM invoices WHERE idempotency_key = v_idempotency_key) THEN
                v_skipped_count := v_skipped_count + 1;
                -- Still advance next billing date so it does not get stuck
                UPDATE subscriptions SET next_billing_date = v_next_date, updated_at = now() WHERE id = v_sub.id;
                CONTINUE;
            END IF;

            v_due_date := v_sub.next_billing_date + INTERVAL '15 days';
            v_inv_num := 'INV-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

            -- Create invoice
            INSERT INTO invoices (
                invoice_number,
                customer_id,
                subscription_id,
                billing_period,
                issue_date,
                due_date,
                subtotal,
                discount_amount,
                tax_amount,
                total_amount,
                amount_paid,
                status,
                idempotency_key,
                notes
            ) VALUES (
                v_inv_num,
                v_sub.customer_id,
                v_sub.id,
                v_period_str,
                v_sub.next_billing_date,
                v_due_date,
                v_sub.subtotal,
                v_sub.discount_amount,
                v_sub.tax_amount,
                v_sub.total_amount,
                0.00,
                'confirmed',
                v_idempotency_key,
                'Recurring invoice for ' || v_plan.name || ' (' || v_period_str || ')'
            ) RETURNING id INTO v_inv_id;

            -- Copy subscription lines into invoice lines
            FOR v_sline IN 
                SELECT sl.*, p.name AS prod_name, pv.variant_value
                FROM subscription_lines sl
                JOIN products p ON p.id = sl.product_id
                LEFT JOIN product_variants pv ON pv.id = sl.variant_id
                WHERE sl.subscription_id = v_sub.id
            LOOP
                INSERT INTO invoice_lines (
                    invoice_id,
                    product_id,
                    description,
                    quantity,
                    unit_price,
                    discount_amount,
                    tax_rate_snapshot,
                    tax_amount,
                    line_total
                ) VALUES (
                    v_inv_id,
                    v_sline.product_id,
                    v_sline.prod_name || COALESCE(' - ' || v_sline.variant_value, ''),
                    v_sline.quantity,
                    v_sline.unit_price,
                    v_sline.discount_amount,
                    v_sline.tax_rate_snapshot,
                    ROUND((v_sline.line_total * v_sline.tax_rate_snapshot / 100.0), 2),
                    v_sline.line_total
                );
            END LOOP;

            -- Advance next billing date only upon successful invoice creation
            UPDATE subscriptions
            SET next_billing_date = v_next_date,
                status = CASE 
                    WHEN v_plan.auto_close AND v_sub.expiry_date IS NOT NULL AND v_next_date > v_sub.expiry_date 
                    THEN 'closed'
                    ELSE status 
                END,
                updated_at = now()
            WHERE id = v_sub.id;

            v_processed_count := v_processed_count + 1;

        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors || jsonb_build_object('subscription_id', v_sub.id, 'error', SQLERRM);
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'processed_count', v_processed_count,
        'skipped_count', v_skipped_count,
        'errors', v_errors,
        'run_at', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- RPC 5: get_dashboard_analytics
-- High-speed aggregation for MRR, collections, status distribution & upcoming renewals
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dashboard_analytics()
RETURNS JSONB AS $$
DECLARE
    v_mrr NUMERIC(12,2) := 0.00;
    v_active_subs INTEGER := 0;
    v_total_customers INTEGER := 0;
    v_collected_rev NUMERIC(12,2) := 0.00;
    v_outstanding_rev NUMERIC(12,2) := 0.00;
    v_overdue_count INTEGER := 0;
    v_sub_status_dist JSONB;
    v_rev_by_month JSONB;
    v_payment_methods JSONB;
BEGIN
    -- MRR normalization:
    -- Daily: total_amount * 30
    -- Weekly: total_amount * 4.3333
    -- Monthly: total_amount * 1
    -- Yearly: total_amount / 12
    SELECT COALESCE(SUM(
        CASE 
            WHEN billing_frequency = 'daily' THEN total_amount * 30
            WHEN billing_frequency = 'weekly' THEN total_amount * (52.0 / 12.0)
            WHEN billing_frequency = 'monthly' THEN total_amount
            WHEN billing_frequency = 'yearly' THEN total_amount / 12.0
            ELSE total_amount
        END
    ), 0.00),
    COUNT(*)
    INTO v_mrr, v_active_subs
    FROM subscriptions
    WHERE status = 'active';

    -- Total customers
    SELECT COUNT(*) INTO v_total_customers FROM customers WHERE status = 'active';

    -- Revenue metrics from invoices
    SELECT 
        COALESCE(SUM(amount_paid), 0.00),
        COALESCE(SUM(total_amount - amount_paid), 0.00),
        COUNT(*) FILTER (WHERE status = 'confirmed' AND due_date < CURRENT_DATE)
    INTO v_collected_rev, v_outstanding_rev, v_overdue_count
    FROM invoices
    WHERE status != 'cancelled';

    -- Subscription status distribution
    SELECT jsonb_object_agg(status, count)
    INTO v_sub_status_dist
    FROM (
        SELECT status, count(*) AS count
        FROM subscriptions
        GROUP BY status
    ) s;

    -- Revenue by month (last 6 months)
    SELECT jsonb_agg(m)
    INTO v_rev_by_month
    FROM (
        SELECT 
            TO_CHAR(payment_date, 'Mon YYYY') AS month,
            SUM(amount) AS revenue
        FROM payments
        WHERE payment_date >= now() - INTERVAL '6 months'
        GROUP BY TO_CHAR(payment_date, 'Mon YYYY'), DATE_TRUNC('month', payment_date)
        ORDER BY DATE_TRUNC('month', payment_date) ASC
    ) m;

    -- Payment method breakdown
    SELECT jsonb_agg(p)
    INTO v_payment_methods
    FROM (
        SELECT 
            payment_method,
            COUNT(*) AS count,
            SUM(amount) AS total_amount
        FROM payments
        GROUP BY payment_method
    ) p;

    RETURN jsonb_build_object(
        'mrr', ROUND(v_mrr, 2),
        'active_subscriptions', v_active_subs,
        'total_customers', v_total_customers,
        'collected_revenue', ROUND(v_collected_rev, 2),
        'outstanding_revenue', ROUND(v_outstanding_rev, 2),
        'overdue_invoices_count', v_overdue_count,
        'subscription_status_distribution', COALESCE(v_sub_status_dist, '{}'::JSONB),
        'revenue_by_month', COALESCE(v_rev_by_month, '[]'::JSONB),
        'payment_methods', COALESCE(v_payment_methods, '[]'::JSONB)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
