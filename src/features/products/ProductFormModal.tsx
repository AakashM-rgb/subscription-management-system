import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { Product, ProductType } from '../../types/database';
import { SubflowStore } from '../../services/mockData';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  onSaved: () => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  product,
  onSaved,
}) => {
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    code: '',
    product_type: 'software',
    sales_price: 0,
    cost_price: 0,
    description: '',
    notes: '',
    is_active: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (product) {
      setFormData(product);
    } else {
      setFormData({
        name: '',
        code: `PRD-${Math.floor(1000 + Math.random() * 9000)}`,
        product_type: 'software',
        sales_price: 2000,
        cost_price: 450,
        description: '',
        notes: '',
        is_active: true,
      });
    }
    setErrors({});
  }, [product, isOpen]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name?.trim()) errs.name = 'Product name is required';
    if (Number(formData.sales_price) < 0) errs.sales_price = 'Sales price cannot be negative';
    if (Number(formData.cost_price) < 0) errs.cost_price = 'Cost price cannot be negative';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const saved: Product = {
        id: product?.id || crypto.randomUUID(),
        name: formData.name!.trim(),
        code: formData.code || null,
        product_type: (formData.product_type as ProductType) || 'software',
        sales_price: Number(formData.sales_price),
        cost_price: Number(formData.cost_price),
        description: formData.description || null,
        notes: formData.notes || null,
        is_active: formData.is_active ?? true,
        created_at: product?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      SubflowStore.saveProduct(saved);
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
      title={product ? 'Edit Catalogue Product' : 'Add New Product'}
      description="Configure recurring software products, add-ons and base pricing"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Product Name"
          placeholder="e.g. Brightloop Core Platform"
          value={formData.name || ''}
          onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
          error={errors.name}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Product SKU / Code"
            placeholder="e.g. PRD-CORE-01"
            value={formData.code || ''}
            onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
          />

          <Select
            label="Product Type"
            value={formData.product_type || 'software'}
            onChange={e => setFormData(prev => ({ ...prev, product_type: e.target.value as any }))}
            options={[
              { label: 'Software License', value: 'software' },
              { label: 'Platform Add-on', value: 'addon' },
              { label: 'Support Service', value: 'service' },
              { label: 'Hardware Module', value: 'hardware' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Base Sales Price (₹)"
            type="number"
            step="0.01"
            placeholder="2000.00"
            value={formData.sales_price ?? ''}
            onChange={e => setFormData(prev => ({ ...prev, sales_price: parseFloat(e.target.value) || 0 }))}
            error={errors.sales_price}
            required
            hint="Price before variant surcharges"
          />

          <Input
            label="Internal Cost Price (₹)"
            type="number"
            step="0.01"
            placeholder="450.00"
            value={formData.cost_price ?? ''}
            onChange={e => setFormData(prev => ({ ...prev, cost_price: parseFloat(e.target.value) || 0 }))}
            error={errors.cost_price}
            hint="For margin analysis"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Description
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Brief product description for customer proposals..."
            value={formData.description || ''}
            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="is_active_prod"
            checked={formData.is_active}
            onChange={e => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
          />
          <label htmlFor="is_active_prod" className="text-xs font-medium text-slate-700">
            Active in sales catalogue (available for quotations & subscriptions)
          </label>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            {product ? 'Update Product' : 'Create Product'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
