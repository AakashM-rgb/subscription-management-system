import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { Product, ProductVariant } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { Plus, Tag, Layers, Check } from 'lucide-react';
import { StatusBadge } from '../../components/common/Badge';

interface VariantManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  onSaved: () => void;
}

export const VariantManagerModal: React.FC<VariantManagerModalProps> = ({
  isOpen,
  onClose,
  product,
  onSaved,
}) => {
  const [variantName, setVariantName] = useState('Brand Integration');
  const [variantValue, setVariantValue] = useState('');
  const [priceSurcharge, setPriceSurcharge] = useState<number>(560);
  const [sku, setSku] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingVariants = SubflowStore.getProductVariants().filter(
    v => v.product_id === product.id
  );

  const handleAddVariant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantValue.trim()) {
      setError('Variant value (e.g. "Odoo Edition") is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const newVariant: ProductVariant = {
        id: crypto.randomUUID(),
        product_id: product.id,
        variant_name: variantName.trim(),
        variant_value: variantValue.trim(),
        price_surcharge: Number(priceSurcharge) || 0,
        sku: sku.trim() || `${product.code || 'PRD'}-${variantValue.toUpperCase().slice(0, 4)}`,
        is_active: true,
        created_at: new Date().toISOString(),
      };

      SubflowStore.saveProductVariant(newVariant);
      setVariantValue('');
      setPriceSurcharge(0);
      setSku('');
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to add variant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Variants for ${product.name}`}
      description={`Base Product Price: ${formatCurrency(product.sales_price)}`}
      maxWidth="xl"
    >
      <div className="space-y-6">
        {/* Existing Variants Table */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Configured Variants ({existingVariants.length})
          </h4>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Variant Dimension</th>
                  <th className="px-4 py-2.5">Option / Value</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5 text-right">Price Surcharge</th>
                  <th className="px-4 py-2.5 text-right">Final Variant Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {existingVariants.map(v => {
                  const finalPrice = product.sales_price + v.price_surcharge;
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {v.variant_name}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-blue-500" />
                        <span>{v.variant_value}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{v.sku || '—'}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                        +{formatCurrency(v.price_surcharge)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 bg-slate-50/50">
                        {formatCurrency(finalPrice)}
                      </td>
                    </tr>
                  );
                })}
                {existingVariants.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      No variants configured yet. Add one below (e.g. Odoo Edition).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add New Variant Form */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
            Add Product Variant
          </h4>
          {error && <p className="text-xs text-rose-600 mb-2 font-medium">{error}</p>}
          <form onSubmit={handleAddVariant} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Variant Name / Dimension"
                placeholder="e.g. Brand, Tier, Edition"
                value={variantName}
                onChange={e => setVariantName(e.target.value)}
                required
              />
              <Input
                label="Variant Option Value"
                placeholder="e.g. Odoo Edition"
                value={variantValue}
                onChange={e => setVariantValue(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Price Surcharge (₹)"
                type="number"
                step="0.01"
                placeholder="560.00"
                value={priceSurcharge}
                onChange={e => setPriceSurcharge(parseFloat(e.target.value) || 0)}
                hint={`Calculated Final Price: ${formatCurrency(product.sales_price + (Number(priceSurcharge) || 0))}`}
                required
              />
              <Input
                label="Variant SKU"
                placeholder="e.g. PRD-CORE-ODOO"
                value={sku}
                onChange={e => setSku(e.target.value)}
              />
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={loading}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Variant
              </Button>
            </div>
          </form>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
