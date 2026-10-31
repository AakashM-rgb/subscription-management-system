import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { Subscription, Customer, Plan, Product, BillingFrequency } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { calculateNextBillingDate } from '../../lib/date';
import { Plus, Trash2 } from 'lucide-react';

interface SubscriptionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SubscriptionFormModal: React.FC<SubscriptionFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentTerms, setPaymentTerms] = useState('Net 15');
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<
    Array<{
      product_id: string;
      variant_id?: string;
      quantity: number;
      unit_price: number;
      discount_amount: number;
      tax_rate: number;
    }>
  >([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const cList = SubflowStore.getCustomers();
      const pList = SubflowStore.getPlans();
      const prList = SubflowStore.getProducts();

      setCustomers(cList);
      setPlans(pList);
      setProducts(prList);

      if (cList.length > 0) setCustomerId(cList[0].id);
      if (pList.length > 0) setPlanId(pList[0].id);

      if (prList.length > 0) {
        setLines([
          {
            product_id: prList[0].id,
            quantity: 1,
            unit_price: prList[0].sales_price,
            discount_amount: 0,
            tax_rate: 18.0,
          },
        ]);
      }
    }
  }, [isOpen]);

  const selectedPlan = plans.find(p => p.id === planId);
  const billingFrequency: BillingFrequency = selectedPlan?.billing_frequency || 'monthly';

  const updateLineProduct = (idx: number, productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    setLines(prev =>
      prev.map((l, i) =>
        i === idx ? { ...l, product_id: productId, variant_id: undefined, unit_price: prod.sales_price } : l
      )
    );
  };

  const updateLineVariant = (idx: number, variantId: string) => {
    const line = lines[idx];
    const prod = products.find(p => p.id === line.product_id);
    if (!prod) return;

    if (!variantId) {
      setLines(prev =>
        prev.map((l, i) => (i === idx ? { ...l, variant_id: undefined, unit_price: prod.sales_price } : l))
      );
      return;
    }

    const v = prod.variants?.find(x => x.id === variantId);
    const surcharge = v?.price_surcharge || 0;
    setLines(prev =>
      prev.map((l, i) => (i === idx ? { ...l, variant_id: variantId, unit_price: prod.sales_price + surcharge } : l))
    );
  };

  const subtotal = lines.reduce((acc, l) => acc + l.unit_price * l.quantity, 0);
  const discountTotal = lines.reduce((acc, l) => acc + l.discount_amount * l.quantity, 0);
  const taxableAmount = Math.max(0, subtotal - discountTotal);
  const taxTotal = lines.reduce(
    (acc, l) => acc + ((l.unit_price * l.quantity - l.discount_amount * l.quantity) * l.tax_rate) / 100,
    0
  );
  const totalAmount = taxableAmount + taxTotal;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !planId) {
      setError('Please select both customer and plan');
      return;
    }
    if (lines.length === 0) {
      setError('Please add at least one line item');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const cust = customers.find(c => c.id === customerId);
      const subNum = `SUB-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
      const nextBilling = startDate;

      const newSub: Subscription = {
        id: crypto.randomUUID(),
        subscription_number: subNum,
        customer_id: customerId,
        customer_name: cust?.name,
        customer_email: cust?.email,
        plan_id: planId,
        plan_name: selectedPlan?.name,
        status: 'active',
        start_date: startDate,
        next_billing_date: nextBilling,
        billing_frequency: billingFrequency,
        payment_terms: paymentTerms,
        auto_renew: true,
        subtotal: Number(subtotal.toFixed(2)),
        discount_amount: Number(discountTotal.toFixed(2)),
        tax_amount: Number(taxTotal.toFixed(2)),
        total_amount: Number(totalAmount.toFixed(2)),
        notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lines: lines.map(l => {
          const prod = products.find(p => p.id === l.product_id);
          const v = prod?.variants?.find(x => x.id === l.variant_id);
          const lineTotal = l.unit_price * l.quantity - l.discount_amount * l.quantity;
          return {
            id: crypto.randomUUID(),
            subscription_id: '',
            product_id: l.product_id,
            product_name: prod?.name,
            variant_id: l.variant_id || null,
            variant_name: v?.variant_value || null,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_amount: l.discount_amount,
            tax_rate_snapshot: l.tax_rate,
            line_total: Number(lineTotal.toFixed(2)),
          };
        }),
      };

      SubflowStore.saveSubscription(newSub);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save subscription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Subscription"
      description="Initialize recurring software contract with automatic billing schedule"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Customer"
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
            options={customers.map(c => ({
              label: `${c.name} (${c.company || 'Direct'})`,
              value: c.id,
            }))}
            required
          />

          <Select
            label="Subscription Plan"
            value={planId}
            onChange={e => setPlanId(e.target.value)}
            options={plans.map(p => ({
              label: `${p.name} (${p.billing_frequency}) - ${formatCurrency(p.price)}`,
              value: p.id,
            }))}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Contract Start Date"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            required
          />

          <Select
            label="Payment Terms"
            value={paymentTerms}
            onChange={e => setPaymentTerms(e.target.value)}
            options={[
              { label: 'Net 15 Days', value: 'Net 15' },
              { label: 'Net 30 Days', value: 'Net 30' },
              { label: 'Due on Receipt', value: 'Due on Receipt' },
            ]}
          />
        </div>

        {/* Lines */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Contract Product Lines
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (products.length > 0) {
                  setLines(prev => [
                    ...prev,
                    {
                      product_id: products[0].id,
                      quantity: 1,
                      unit_price: products[0].sales_price,
                      discount_amount: 0,
                      tax_rate: 18.0,
                    },
                  ]);
                }
              }}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Item
            </Button>
          </div>

          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
            {lines.map((line, idx) => {
              const currentProd = products.find(p => p.id === line.product_id);
              const variants = currentProd?.variants || [];

              return (
                <div key={idx} className="p-3 bg-white grid grid-cols-12 gap-3 items-center text-xs">
                  <div className="col-span-5">
                    <select
                      value={line.product_id}
                      onChange={e => updateLineProduct(idx, e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded p-1 text-xs"
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <select
                      value={line.variant_id || ''}
                      onChange={e => updateLineVariant(idx, e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded p-1 text-xs"
                    >
                      <option value="">Base Variant</option>
                      {variants.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.variant_value} (+₹{v.price_surcharge})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 text-right font-bold text-slate-900">
                    {formatCurrency(line.unit_price * line.quantity)}
                  </div>
                  <div className="col-span-1 text-right">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-500 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Calculation Box */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1 text-xs text-right">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>GST (18%):</span>
            <span>{formatCurrency(taxTotal)}</span>
          </div>
          <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
            <span>Recurring Invoice Total:</span>
            <span>{formatCurrency(totalAmount)}</span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            Create Subscription
          </Button>
        </div>
      </form>
    </Modal>
  );
};
