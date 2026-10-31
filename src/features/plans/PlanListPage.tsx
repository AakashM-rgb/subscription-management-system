import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Edit,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge, StatusBadge } from '../../components/common/Badge';
import { Plan, BillingFrequency } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import { usePermissions } from '../../hooks/usePermissions';
import { PlanFormModal } from './PlanFormModal';

export const PlanListPage: React.FC = () => {
  const { isAdmin } = usePermissions();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState<string>('all');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadPlans = () => {
    setPlans(SubflowStore.getPlans());
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const filtered = plans.filter(p => {
    if (frequencyFilter === 'all') return true;
    return p.billing_frequency === frequencyFilter;
  });

  const frequencyBadgeColors: Record<BillingFrequency, 'default' | 'info' | 'primary' | 'purple'> = {
    daily: 'default',
    weekly: 'info',
    monthly: 'primary',
    yearly: 'purple',
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Subscription Plans & Cadences
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure Daily, Weekly, Monthly and Yearly recurring billing frequencies
          </p>
        </div>
        {isAdmin ? (
          <Button
            variant="primary"
            onClick={() => {
              setSelectedPlan(null);
              setIsModalOpen(true);
            }}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Plan
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
            <ShieldAlert className="w-4 h-4" />
            <span>Plan configuration restricted to Admin</span>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        {['all', 'daily', 'weekly', 'monthly', 'yearly'].map(freq => (
          <button
            key={freq}
            onClick={() => setFrequencyFilter(freq)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
              frequencyFilter === freq
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {freq === 'all' ? 'All Frequencies' : `${freq} Plans`}
          </button>
        ))}
      </div>

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filtered.map(plan => (
          <Card key={plan.id} className="flex flex-col justify-between" hover>
            <div>
              <div className="p-6 border-b border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant={frequencyBadgeColors[plan.billing_frequency]} size="sm">
                    {plan.billing_frequency.toUpperCase()}
                  </Badge>
                  <StatusBadge status={plan.is_active ? 'active' : 'inactive'} />
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                  <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                    {plan.code || 'NO-CODE'}
                  </span>
                </div>

                <div className="pt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-slate-900">
                      {formatCurrency(plan.price)}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      / {plan.billing_frequency}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Min commitment: {plan.min_quantity} seat(s)
                  </p>
                </div>
              </div>

              <div className="p-6 space-y-3 text-xs">
                {plan.description && (
                  <p className="text-slate-600 leading-relaxed">{plan.description}</p>
                )}

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Permitted Operations
                  </span>
                  <div className="space-y-1.5 text-slate-600">
                    <div className="flex items-center gap-2">
                      {plan.pause_allowed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                      <span>Pause Subscription</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {plan.early_close_allowed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                      <span>Early Close / Termination</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {plan.renewal_allowed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                      <span>Contract Renewal</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50/75 border-t border-slate-100 rounded-b-xl flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Active from {formatDate(plan.available_from)}
              </span>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedPlan(plan);
                    setIsModalOpen(true);
                  }}
                  leftIcon={<Edit className="w-3.5 h-3.5" />}
                >
                  Edit
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Plan Form Modal */}
      <PlanFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        plan={selectedPlan}
        onSaved={loadPlans}
      />
    </div>
  );
};
