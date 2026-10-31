import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { SubflowStore } from './mockData';
import {
  Customer,
  Product,
  Plan,
  Subscription,
  Invoice,
  Payment,
  Quotation,
} from '../types/database';

/**
 * Supabase Data Adapter
 * Bridges live Supabase PostgreSQL database tables with SubflowStore state.
 * Allows transparent dual-mode: live Supabase cloud sync + offline demo resilience.
 */

export async function loadAndSyncSupabaseData(): Promise<{
  synced: boolean;
  counts: { customers: number; products: number; plans: number; subscriptions: number; invoices: number; payments: number };
}> {
  const counts = { customers: 0, products: 0, plans: 0, subscriptions: 0, invoices: 0, payments: 0 };
  
  if (!isSupabaseConfigured || !supabase) {
    return { synced: false, counts };
  }

  try {
    // 1. Fetch Customers
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (!custErr && customers && customers.length > 0) {
      customers.forEach((c: Customer) => SubflowStore.saveCustomer(c));
      counts.customers = customers.length;
    }

    // 2. Fetch Products
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (!prodErr && products && products.length > 0) {
      products.forEach((p: Product) => SubflowStore.saveProduct(p));
      counts.products = products.length;
    }

    // 3. Fetch Plans
    const { data: plans, error: planErr } = await supabase
      .from('plans')
      .select('*')
      .order('price', { ascending: true });

    if (!planErr && plans && plans.length > 0) {
      plans.forEach((pl: Plan) => SubflowStore.savePlan(pl));
      counts.plans = plans.length;
    }

    // 4. Fetch Subscriptions
    const { data: subs, error: subsErr } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (!subsErr && subs && subs.length > 0) {
      subs.forEach((s: Subscription) => SubflowStore.saveSubscription(s));
      counts.subscriptions = subs.length;
    }

    // 5. Fetch Invoices
    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .order('invoice_date', { ascending: false });

    if (!invErr && invoices && invoices.length > 0) {
      invoices.forEach((inv: Invoice) => SubflowStore.saveInvoice(inv));
      counts.invoices = invoices.length;
    }

    // 6. Fetch Payments
    const { data: payments, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .order('payment_date', { ascending: false });

    if (!payErr && payments && payments.length > 0) {
      payments.forEach((pay: Payment) => {
        // Record payment in local store if not already present
        const existing = SubflowStore.getPayments().find(p => p.id === pay.id);
        if (!existing) {
          SubflowStore.recordPayment({
            invoice_id: pay.invoice_id,
            customer_id: pay.customer_id,
            amount: pay.amount,
            payment_method: pay.payment_method,
            reference_number: pay.reference_number,
            notes: pay.notes,
          });
        }
      });
      counts.payments = payments.length;
    }

    const totalSynced = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalSynced > 0) {
      console.log(`✨ [Supabase Sync] Hydrated store with ${totalSynced} records from Supabase database.`);
    }

    return { synced: totalSynced > 0, counts };
  } catch (err) {
    console.warn("⚠️ [Supabase Sync] Could not fetch live database records, falling back to local dataset:", err);
    return { synced: false, counts };
  }
}

/**
 * Save Customer to Supabase (and local store)
 */
export async function syncSaveCustomer(customer: Customer): Promise<void> {
  SubflowStore.saveCustomer(customer);
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('customers').upsert(customer);
    } catch (e) {
      console.warn("Could not sync customer to Supabase:", e);
    }
  }
}

/**
 * Save Product to Supabase (and local store)
 */
export async function syncSaveProduct(product: Product): Promise<void> {
  SubflowStore.saveProduct(product);
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('products').upsert(product);
    } catch (e) {
      console.warn("Could not sync product to Supabase:", e);
    }
  }
}

/**
 * Save Plan to Supabase (and local store)
 */
export async function syncSavePlan(plan: Plan): Promise<void> {
  SubflowStore.savePlan(plan);
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('plans').upsert(plan);
    } catch (e) {
      console.warn("Could not sync plan to Supabase:", e);
    }
  }
}

/**
 * Save Subscription to Supabase (and local store)
 */
export async function syncSaveSubscription(subscription: Subscription): Promise<void> {
  SubflowStore.saveSubscription(subscription);
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('subscriptions').upsert(subscription);
    } catch (e) {
      console.warn("Could not sync subscription to Supabase:", e);
    }
  }
}

/**
 * Save Invoice to Supabase (and local store)
 */
export async function syncSaveInvoice(invoice: Invoice): Promise<void> {
  SubflowStore.saveInvoice(invoice);
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('invoices').upsert(invoice);
    } catch (e) {
      console.warn("Could not sync invoice to Supabase:", e);
    }
  }
}

