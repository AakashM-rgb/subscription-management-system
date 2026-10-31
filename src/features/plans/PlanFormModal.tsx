import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { Plan, BillingFrequency } from '../../types/database';
import { SubflowStore } from '../../services/mockData';

interface PlanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan?: Plan | null;
  onSaved: () => void;
}

export const PlanFormModal: React.FC<PlanFormModalProps> = ({
  isOpen,
  onClose,
  plan,
  onSaved,
}) => {
  const [formData, setFormData] = useState<Partial<Plan>>({
    name: '',
    code: '',
    description: '',
    price: 0,
    billing_frequency: 'monthly',
    min_quantity: 1,
    available_from: new Date().toISOString().split('T')[0],
    available_until: null,
    auto_close: false,
    early_close_allowed: true,
    pause_allowed: true,
    renewal_allowed: true,
    is_active: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (plan) {
      setFormData(plan);
    } else {
      setFormData({
        name: '',
        code: `PLAN-${Math.floor(1000 + Math.random() * 9000)}`,
        description: '',
        price: 2560,
        billing_frequency: 'monthly',
        min_quantity: 1,
        available_from: new Date().toISOString().split('T')[0],
        available_until: null,
        auto_close: false,
        early_close_allowed: true,
        pause_allowed: true,
        renewal_allowed: true,
        is_active: true,
      });
    }
    setErrors({});
  }, [plan, isOpen]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name?.trim()) errs.name = 'Plan name is required';
    if (Number(formData.price) < 0) errs.price = 'Price cannot be negative';
    if (Number(formData.min_quantity) < 1) errs.min_quantity = 'Minimum quantity must be at least 1';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const saved: Plan = {
        id: plan?.id || crypto.randomUUID(),
        name: formData.name!.trim(),
        code: formData.code || null,
        description: formData.description || null,
        price: Number(formData.price),
        billing_frequency: (formData.billing_frequency as BillingFrequency) || 'monthly',
        min_quantity: Number(formData.min_quantity) || 1,
        available_from: formData.available_from || new Date().toISOString().split('T')[0],
        available_until: formData.available_until || null,
        auto_close: formData.auto_close ?? false,
        early_close_allowed: formData.early_close_allowed ?? true,
        pause_allowed: formData.pause_allowed ?? true,
        renewal_allowed: formData.renewal_allowed ?? true,
        is_active: formData.is_active ?? true,
        created_at: plan?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      SubflowStore.savePlan(saved);
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
      title={plan ? 'Edit Subscription Plan' : 'Create Subscription Plan'}
      description="Configure billing interval, minimum commitments and lifecycle permissions"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Plan Title"
          placeholder="e.g. Professional Monthly"
          value={formData.name || ''}
          onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
          error={errors.name}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Plan Code"
            placeholder="PLAN-PRO-MO"
            value={formData.code || ''}
            onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
          />

          <Select
            label="Billing Frequency"
            value={formData.billing_frequency || 'monthly'}
            onChange={e =>
              setFormData(prev => ({ ...prev, billing_frequency: e.target.value as any }))
            }
            options={[
              { label: 'Daily (Every 1 Day)', value: 'daily' },
              { label: 'Weekly (Every 7 Days)', value: 'weekly' },
              { label: 'Monthly (Calendar Month)', value: 'monthly' },
              { label: 'Yearly (Annual Contract)', value: 'yearly' },
            ]}
          />

          <Input
            label="Recurring Price (₹)"
            type="number"
            step="0.01"
            placeholder="2560.00"
            value={formData.price ?? ''}
            onChange={e => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
            error={errors.price}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Min Quantity Commitment"
            type="number"
            min="1"
            value={formData.min_quantity ?? 1}
            onChange={e => setFormData(prev => ({ ...prev, min_quantity: parseInt(e.target.value) || 1 }))}
            error={errors.min_quantity}
            required
          />

          <Input
            label="Available From"
            type="date"
            value={formData.available_from || ''}
            onChange={e => setFormData(prev => ({ ...prev, available_from: e.target.value }))}
            required
          />

          <Input
            label="Available Until (Optional)"
            type="date"
            value={formData.available_until || ''}
            onChange={e => setFormData(prev => ({ ...prev, available_until: e.target.value || null }))}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Plan Description
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Included entitlements, support tiers, service notes..."
            value={formData.description || ''}
            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
          />
        </div>

        {/* Lifecycle Permissions Grid */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Subscription Lifecycle Permissions
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.pause_allowed}
                onChange={e => setFormData(prev => ({ ...prev, pause_allowed: e.target.checked }))}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              <span>Allow customer to <strong>Pause</strong> subscription</span>
            </label>

            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.early_close_allowed}
                onChange={e => setFormData(prev => ({ ...prev, early_close_allowed: e.target.checked }))}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              <span>Allow customer <strong>Early Close</strong> / Cancel</span>
            </label>

            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.renewal_allowed}
                onChange={e => setFormData(prev => ({ ...prev, renewal_allowed: e.target.checked }))}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              <span>Allow contract <strong>Renewal</strong> after close</span>
            </label>

            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.auto_close}
                onChange={e => setFormData(prev => ({ ...prev, auto_close: e.target.checked }))}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              <span><strong>Auto-Close</strong> automatically at expiry</span>
            </label>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            {plan ? 'Update Plan' : 'Create Plan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
