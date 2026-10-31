import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Layers,
  Edit,
  Tag,
  Search,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Badge, StatusBadge } from '../../components/common/Badge';
import { Product } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { usePermissions } from '../../hooks/usePermissions';
import { ProductFormModal } from './ProductFormModal';
import { VariantManagerModal } from './VariantManagerModal';

export const ProductListPage: React.FC = () => {
  const { isAdmin } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<Product | null>(null);

  const loadProducts = () => {
    setProducts(SubflowStore.getProducts());
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const filtered = products.filter(
    p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.code && p.code.toLowerCase().includes(search.toLowerCase())) ||
      p.product_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Product Catalogue & Variants
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure subscription software, add-ons, pricing variants and surcharges
          </p>
        </div>
        {isAdmin ? (
          <Button
            variant="primary"
            onClick={() => {
              setSelectedProductForModal(null);
              setIsProductModalOpen(true);
            }}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Product
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
            <ShieldAlert className="w-4 h-4" />
            <span>Catalogue modifications restricted to Admin</span>
          </div>
        )}
      </div>

      {/* Search */}
      <Card className="p-4">
        <Input
          placeholder="Search products by title, SKU or product type..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
      </Card>

      {/* Product List Cards / Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Product Name</th>
                <th className="px-4 py-3.5">SKU / Code</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5 text-right">Base Price</th>
                <th className="px-4 py-3.5 text-right">Cost Price</th>
                <th className="px-4 py-3.5 text-center">Variants</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(prod => {
                const variantCount = prod.variants?.length || 0;
                return (
                  <tr key={prod.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{prod.name}</div>
                      {prod.description && (
                        <p className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                          {prod.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 font-mono text-slate-600">
                      {prod.code || '—'}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant="neutral" size="sm" className="capitalize">
                        {prod.product_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-slate-900">
                      {formatCurrency(prod.sales_price)}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-500">
                      {formatCurrency(prod.cost_price)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => setSelectedProductForVariants(prod)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 transition-colors"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>{variantCount} variant(s)</span>
                      </button>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge status={prod.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedProductForVariants(prod)}
                        leftIcon={<Layers className="w-3.5 h-3.5" />}
                      >
                        Variants
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedProductForModal(prod);
                            setIsProductModalOpen(true);
                          }}
                          leftIcon={<Edit className="w-3.5 h-3.5" />}
                        >
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No products found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Product Form Modal */}
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        product={selectedProductForModal}
        onSaved={loadProducts}
      />

      {/* Variant Manager Modal */}
      {selectedProductForVariants && (
        <VariantManagerModal
          isOpen={Boolean(selectedProductForVariants)}
          onClose={() => setSelectedProductForVariants(null)}
          product={selectedProductForVariants}
          onSaved={loadProducts}
        />
      )}
    </div>
  );
};
