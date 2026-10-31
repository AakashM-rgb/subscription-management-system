import React, { useState, useEffect } from 'react';
import {
  Percent,
  Plus,
  Edit,
  Calendar,
  AlertCircle,
  Tag,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge, StatusBadge } from '../../components/common/Badge';
import { DiscountRule } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import { usePermissions } from '../../hooks/usePermissions';
import { DiscountFormModal } from './DiscountFormModal';

export const DiscountListPage: React.FC = () => {
  const { isAdmin } = usePermissions();
  const [discounts, setDiscounts] = useState<DiscountRule[]>([]);
  const [selectedDiscount, setSelectedDiscount] = useState<DiscountRule | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadDiscounts = () => {
    setDiscounts(SubflowStore.getDiscountRules());
  };

  useEffect(() => {
    loadDiscounts();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Discount Engine & Rules
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Admin promotional codes, percentage deductions, usage counters and non-negative billing limits
          </p>
        </div>
        {isAdmin ? (
          <Button
            variant="primary"
            onClick={() => {
              setSelectedDiscount(null);
              setIsModalOpen(true);
            }}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Discount Rule
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
            <ShieldAlert className="w-4 h-4" />
            <span>Discount configuration restricted to Admin</span>
          </div>
        )}
      </div>

      {/* Rules Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Discount Code</th>
                <th className="px-4 py-3.5">Type & Value</th>
                <th className="px-4 py-3.5">Scope</th>
                <th className="px-4 py-3.5">Min Order</th>
                <th className="px-4 py-3.5">Usage Exhaustion</th>
                <th className="px-4 py-3.5">Validity Dates</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {discounts.map(disc => {
                const isExhausted =
                  disc.max_usage_count !== null &&
                  disc.max_usage_count !== undefined &&
                  disc.current_usage_count >= disc.max_usage_count;

                return (
                  <tr key={disc.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-blue-600">
                      {disc.code}
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-extrabold text-slate-900 text-sm">
                        {disc.discount_type === 'percentage'
                          ? `${disc.value}% OFF`
                          : `-${formatCurrency(disc.value)}`}
                      </span>
                      {disc.description && (
                        <p className="text-[11px] text-slate-400 mt-0.5">{disc.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant="neutral" size="sm">
                        {disc.is_subscription_wide ? 'Subscription-Wide' : 'Specific Product'}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-700">
                      {disc.min_purchase_amount > 0
                        ? formatCurrency(disc.min_purchase_amount)
                        : 'No min'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {disc.current_usage_count}
                        </span>
                        <span className="text-slate-400">
                          / {disc.max_usage_count ? `${disc.max_usage_count} uses` : '∞'}
                        </span>
                      </div>
                      {isExhausted && (
                        <span className="text-[10px] text-rose-600 font-bold block mt-0.5">
                          Exhausted
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-500">
                      <span>{formatDate(disc.start_date)}</span>
                      {disc.end_date && <span> → {formatDate(disc.end_date)}</span>}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge status={disc.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedDiscount(disc);
                            setIsModalOpen(true);
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
              {discounts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No promotional rules active.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      <DiscountFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        discount={selectedDiscount}
        onSaved={loadDiscounts}
      />
    </div>
  );
};
