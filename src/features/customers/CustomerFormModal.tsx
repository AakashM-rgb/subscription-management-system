import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { Customer } from '../../types/database';
import { SubflowStore } from '../../services/mockData';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSaved: () => void;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSaved,
}) => {
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    email: '',
    phone: '',
    company: '',
    tax_id: '',
    billing_address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'India',
    status: 'active',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (customer) {
      setFormData(customer);
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        company: '',
        tax_id: '',
        billing_address: '',
        city: '',
        state: '',
        postal_code: '',
        country: 'India',
        status: 'active',
        notes: '',
      });
    }
    setErrors({});
  }, [customer, isOpen]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name?.trim()) errs.name = 'Customer name is required';
    if (!formData.email?.trim()) {
      errs.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errs.email = 'Please provide a valid email address';
    }
    if (!formData.country?.trim()) errs.country = 'Country is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const savedCustomer: Customer = {
        id: customer?.id || crypto.randomUUID(),
        name: formData.name!.trim(),
        email: formData.email!.trim(),
        phone: formData.phone || null,
        company: formData.company || null,
        tax_id: formData.tax_id || null,
        billing_address: formData.billing_address || null,
        city: formData.city || null,
        state: formData.state || null,
        postal_code: formData.postal_code || null,
        country: formData.country || 'India',
        status: (formData.status as any) || 'active',
        notes: formData.notes || null,
        created_at: customer?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      SubflowStore.saveCustomer(savedCustomer);
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
      title={customer ? 'Edit Customer Account' : 'New Enterprise Customer'}
      description="Manage billing profile, contact details and tax registrations"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Contact Name"
            placeholder="e.g. Priya Sharma"
            value={formData.name || ''}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            error={errors.name}
            required
          />

          <Input
            label="Corporate Email"
            type="email"
            placeholder="priya@company.com"
            value={formData.email || ''}
            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
            error={errors.email}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Company / Legal Entity"
            placeholder="e.g. Apex Dynamics Ltd"
            value={formData.company || ''}
            onChange={e => setFormData(prev => ({ ...prev, company: e.target.value }))}
          />

          <Input
            label="Phone Number"
            placeholder="+91 98765 43210"
            value={formData.phone || ''}
            onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Tax ID / GSTIN / VAT"
            placeholder="e.g. GSTIN27AABCA1234F1Z5"
            value={formData.tax_id || ''}
            onChange={e => setFormData(prev => ({ ...prev, tax_id: e.target.value }))}
            hint="For tax invoicing & regulatory compliance"
          />

          <Select
            label="Account Status"
            value={formData.status || 'active'}
            onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
            options={[
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ]}
          />
        </div>

        <Input
          label="Billing Street Address"
          placeholder="Building 4, Cyber City Phase 2"
          value={formData.billing_address || ''}
          onChange={e => setFormData(prev => ({ ...prev, billing_address: e.target.value }))}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input
            label="City"
            placeholder="Hyderabad"
            value={formData.city || ''}
            onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))}
          />

          <Input
            label="State"
            placeholder="Telangana"
            value={formData.state || ''}
            onChange={e => setFormData(prev => ({ ...prev, state: e.target.value }))}
          />

          <Input
            label="Postal Code"
            placeholder="500081"
            value={formData.postal_code || ''}
            onChange={e => setFormData(prev => ({ ...prev, postal_code: e.target.value }))}
          />

          <Input
            label="Country"
            placeholder="India"
            value={formData.country || 'India'}
            onChange={e => setFormData(prev => ({ ...prev, country: e.target.value }))}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Internal Notes
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Billing terms, account owner or strategic notes..."
            value={formData.notes || ''}
            onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          />
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            {customer ? 'Save Changes' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
