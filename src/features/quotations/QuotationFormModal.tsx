import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { Quotation, QuotationLine, Product, Customer, Plan } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { Plus, Trash2, Calculator } from 'lucide-react';

interface QuotationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const QuotationFormModal: React.FC<QuotationFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [planId, setPlanId] = useState('');
  const [validityDays, setValidityDays] = useState(30);
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
      const tList = SubflowStore.getQuotationTemplates();

      setCustomers(cList);
      setPlans(pList);
      setProducts(prList);
      setTemplates(tList);

      if (cList.length > 0) setCustomerId(cList[0].id);
      if (pList.length > 0) setPlanId(pList[0].id);

      // Default line item
      if (prList.length > 0) {
        const base = prList[0];
        setLines([
          {
            product_id: base.id,
            quantity: 1,
            unit_price: base.sales_price,
            discount_amount: 0,
            tax_rate: 18.0,
          },
        ]);
      }
    }
  }, [isOpen]);

  const handleTemplateSelect = (templateId: string) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;

    if (tmpl.default_plan_id) setPlanId(tmpl.default_plan_id);
    if (tmpl.validity_days) setValidityDays(tmpl.validity_days);
    if (tmpl.notes) setNotes(tmpl.notes);

    if (tmpl.lines && tmpl.lines.length > 0) {
      setLines(
        tmpl.lines.map((l: any) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_amount: (l.unit_price * (l.discount_percentage || 0)) / 100,
          tax_rate: 18.0,
        }))
      );
    }
  };

  const handleAddLine = () => {
    if (products.length === 0) return;
    const prod = products[0];
    setLines(prev => [
      ...prev,
      {
        product_id: prod.id,
        quantity: 1,
        unit_price: prod.sales_price,
        discount_amount: 0,
        tax_rate: 18.0,
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const updateLineProduct = (idx: number, productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    setLines(prev =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              product_id: productId,
              variant_id: undefined,
              unit_price: prod.sales_price,
            }
          : l
      )
    );
  };

  const updateLineVariant = (idx: number, variantId: string) => {
    const currentLine = lines[idx];
    const prod = products.find(p => p.id === currentLine.product_id);
    if (!prod) return;

    if (!variantId) {
      setLines(prev =>
        prev.map((l, i) =>
          i === idx ? { ...l, variant_id: undefined, unit_price: prod.sales_price } : l
        )
      );
      return;
    }

    const variant = prod.variants?.find(v => v.id === variantId);
    const surcharge = variant?.price_surcharge || 0;
    const newPrice = prod.sales_price + surcharge;

    setLines(prev =>
      prev.map((l, i) =>
        i === idx ? { ...l, variant_id: variantId, unit_price: newPrice } : l
      )
    );
  };

  // Calculations
  const subtotal = lines.reduce((acc, l) => acc + l.unit_price * l.quantity, 0);
  const discountTotal = lines.reduce((acc, l) => acc + l.discount_amount * l.quantity, 0);
  const taxableAmount = Math.max(0, subtotal - discountTotal);
  const taxTotal = lines.reduce(
    (acc, l) =>
      acc +
      ((l.unit_price * l.quantity - l.discount_amount * l.quantity) * l.tax_rate) / 100,
    0
  );
  const totalAmount = taxableAmount + taxTotal;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError('Please select a customer');
      return;
    }
    if (!planId) {
      setError('Please select a plan');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one product line');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const cust = customers.find(c => c.id === customerId);
      const plan = plans.find(p => p.id === planId);
      const quoNumber = `QUO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const today = new Date();
      const validUntil = new Date(today.getTime() + validityDays * 86400000)
        .toISOString()
        .split('T')[0];

      const newQuo: Quotation = {
        id: crypto.randomUUID(),
        quotation_number: quoNumber,
        customer_id: customerId,
        customer_name: cust?.name,
        customer_email: cust?.email,
        plan_id: planId,
        plan_name: plan?.name,
        status: 'draft',
        issue_date: today.toISOString().split('T')[0],
        valid_until: validUntil,
        subtotal: Number(subtotal.toFixed(2)),
        discount_amount: Number(discountTotal.toFixed(2)),
        tax_amount: Number(taxTotal.toFixed(2)),
        total_amount: Number(totalAmount.toFixed(2)),
        notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lines: lines.map(l => {
          const prod = products.find(p => p.id === l.product_id);
          const variant = prod?.variants?.find(v => v.id === l.variant_id);
          const lineTotal = l.unit_price * l.quantity - l.discount_amount * l.quantity;
          return {
            id: crypto.randomUUID(),
            quotation_id: '',
            product_id: l.product_id,
            product_name: prod?.name,
            variant_id: l.variant_id || null,
            variant_name: variant?.variant_value || null,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_amount: l.discount_amount,
            tax_rate: l.tax_rate,
            line_total: Number(lineTotal.toFixed(2)),
          };
        }),
      };

      SubflowStore.saveQuotation(newQuo);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create quotation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Customer Quotation"
      description="Assemble custom quotation lines, plans, variants and validity terms"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

        {/* Template Quick Loader */}
        {templates.length > 0 && (
          <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
            <span className="font-semibold text-blue-900">
              Apply Preconfigured Quotation Template:
            </span>
            <select
              onChange={e => handleTemplateSelect(e.target.value)}
              className="bg-white border border-blue-300 rounded-lg px-2.5 py-1 text-xs text-blue-900 focus:outline-none"
            >
              <option value="">Select a template...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

          <Input
            label="Validity (Days)"
            type="number"
            min="1"
            max="180"
            value={validityDays}
            onChange={e => setValidityDays(parseInt(e.target.value) || 30)}
            hint="Prevents conversion after expiry"
            required
          />
        </div>

        {/* Product Line Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Product & Variant Line Items
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddLine}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Item
            </Button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {lines.map((line, idx) => {
              const currentProd = products.find(p => p.id === line.product_id);
              const variants = currentProd?.variants || [];

              return (
                <div key={idx} className="p-3 bg-white grid grid-cols-12 gap-3 items-center text-xs">
                  <div className="col-span-4">
                    <label className="text-[10px] text-slate-400 font-medium">Product</label>
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

                  <div className="col-span-3">
                    <label className="text-[10px] text-slate-400 font-medium">Variant</label>
                    <select
                      value={line.variant_id || ''}
                      onChange={e => updateLineVariant(idx, e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded p-1 text-xs"
                    >
                      <option value="">Base Variant (₹0)</option>
                      {variants.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.variant_value} (+₹{v.price_surcharge})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-400 font-medium">Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={e =>
                        setLines(prev =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, quantity: parseInt(e.target.value) || 1 } : l
                          )
                        )
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded p-1 text-xs"
                    />
                  </div>

                  <div className="col-span-2 text-right">
                    <label className="text-[10px] text-slate-400 font-medium block">Total</label>
                    <span className="font-bold text-slate-900 block mt-1">
                      {formatCurrency(line.unit_price * line.quantity)}
                    </span>
                  </div>

                  <div className="col-span-1 text-right">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
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

        {/* Totals Summary */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5 text-xs text-right">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discounts Applied:</span>
              <span className="font-medium">-{formatCurrency(discountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>Estimated GST 18%:</span>
            <span className="font-medium">{formatCurrency(taxTotal)}</span>
          </div>
          <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
            <span>Total Quotation Value:</span>
            <span>{formatCurrency(totalAmount)}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Terms & Proposal Notes
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Payment terms, SLAs and validity remarks..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            Save Quotation
          </Button>
        </div>
      </form>
    </Modal>
  );
};
