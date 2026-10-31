import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { DiscountRule, DiscountType, Product } from '../../types/database';
import { SubflowStore } from '../../services/mockData';

interface DiscountFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  discount?: DiscountRule | null;
  onSaved: () => void;
}

export const DiscountFormModal: React.FC<DiscountFormModalProps> = ({
  isOpen,
  onClose,
  discount,
  onSaved,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState<Partial<DiscountRule>>({
    code: '',
    description: '',
    discount_type: 'percentage',
    value: 10,
    min_purchase_amount: 1000,
    min_quantity: 1,
    start_date: new Date().toISOString().split('T')[0],
    end_date: null,
    max_usage_count: 100,
    is_subscription_wide: true,
    applicable_product_id: null,
    is_active: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setProducts(SubflowStore.getProducts());
      if (discount) {
        setFormData(discount);
      } else {
        setFormData({
          code: '',
          description: '',
          discount_type: 'percentage',
          value: 10,
          min_purchase_amount: 1000,
          min_quantity: 1,
          start_date: new Date().toISOString().split('T')[0],
          end_date: null,
          max_usage_count: 100,
          is_subscription_wide: true,
          applicable_product_id: null,
          is_active: true,
        });
      }
      setErrors({});
    }
  }, [discount, isOpen]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.code?.trim()) errs.code = 'Discount code is required';
    if (Number(formData.value) <= 0) errs.value = 'Discount value must be greater than zero';
    if (formData.discount_type === 'percentage' && Number(formData.value) > 100) {
      errs.value = 'Percentage discount cannot exceed 100%';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const saved: DiscountRule = {
        id: discount?.id || crypto.randomUUID(),
        code: formData.code!.trim().toUpperCase(),
        description: formData.description || null,
        discount_type: (formData.discount_type as DiscountType) || 'percentage',
        value: Number(formData.value),
        min_purchase_amount: Number(formData.min_purchase_amount) || 0,
        min_quantity: Number(formData.min_quantity) || 1,
        start_date: formData.start_date || new Date().toISOString().split('T')[0],
        end_date: formData.end_date || null,
        max_usage_count: formData.max_usage_count ? Number(formData.max_usage_count) : null,
        current_usage_count: discount?.current_usage_count || 0,
        applicable_product_id: formData.is_subscription_wide ? null : formData.applicable_product_id || null,
        is_subscription_wide: formData.is_subscription_wide ?? true,
        is_active: formData.is_active ?? true,
        created_at: discount?.created_at || new Date().toISOString(),
      };

      SubflowStore.saveDiscountRule(saved);
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={discount ? 'Edit Discount Rule' : 'Create Promotional Discount Rule'}
      description="Configure eligibility thresholds, usage limits and subscription scope"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Discount Code"
            placeholder="e.g. BRIGHTEARLY10"
            value={formData.code || ''}
            onChange={e => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
            error={errors.code}
            required
          />

          <Select
            label="Discount Calculation"
            value={formData.discount_type || 'percentage'}
            onChange={e =>
              setFormData(prev => ({ ...prev, discount_type: e.target.value as any }))
            }
            options={[
              { label: 'Percentage (%) Off', value: 'percentage' },
              { label: 'Fixed Amount (₹) Off', value: 'fixed' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label={formData.discount_type === 'percentage' ? 'Rate (%)' : 'Amount (₹)'}
            type="number"
            step="0.01"
            value={formData.value ?? ''}
            onChange={e => setFormData(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
            error={errors.value}
            required
          />

          <Input
            label="Min Purchase (₹)"
            type="number"
            step="0.01"
            value={formData.min_purchase_amount ?? 0}
            onChange={e =>
              setFormData(prev => ({ ...prev, min_purchase_amount: parseFloat(e.target.value) || 0 }))
            }
          />

          <Input
            label="Max Uses (Limit)"
            type="number"
            min="1"
            placeholder="Unlimited"
            value={formData.max_usage_count ?? ''}
            onChange={e =>
              setFormData(prev => ({
                ...prev,
                max_usage_count: e.target.value ? parseInt(e.target.value) : null,
              }))
            }
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Start Date"
            type="date"
            value={formData.start_date || ''}
            onChange={e => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
            required
          />

          <Input
            label="Expiry Date (Optional)"
            type="date"
            value={formData.end_date || ''}
            onChange={e => setFormData(prev => ({ ...prev, end_date: e.target.value || null }))}
          />
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_subscription_wide}
              onChange={e =>
                setFormData(prev => ({ ...prev, is_subscription_wide: e.target.checked }))
              }
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span>
              <strong>Subscription-Wide:</strong> Applies to full subscription invoice total
            </span>
          </label>

          {!formData.is_subscription_wide && (
            <Select
              label="Applicable Specific Product"
              value={formData.applicable_product_id || ''}
              onChange={e =>
                setFormData(prev => ({ ...prev, applicable_product_id: e.target.value || null }))
              }
              options={[
                { label: 'Select a product...', value: '' },
                ...products.map(p => ({ label: p.name, value: p.id })),
              ]}
            />
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            {discount ? 'Update Rule' : 'Save Rule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
