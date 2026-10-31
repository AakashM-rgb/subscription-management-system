import React, { useState, useEffect } from 'react';
import {
  Repeat,
  Plus,
  Search,
  Play,
  Pause,
  XCircle,
  RotateCcw,
  Calendar,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { StatusBadge, Badge } from '../../components/common/Badge';
import { Subscription, SubscriptionStatus } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import { SubscriptionFormModal } from './SubscriptionFormModal';
import { SubscriptionLifecycleModal } from './SubscriptionLifecycleModal';

export const SubscriptionListPage: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Lifecycle modal state
  const [selectedSubForAction, setSelectedSubForAction] = useState<Subscription | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<'pause' | 'resume' | 'close' | 'renew'>('pause');
  const [isLifecycleModalOpen, setIsLifecycleModalOpen] = useState(false);

  // Billing trigger feedback
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  const loadSubscriptions = () => {
    setSubscriptions(SubflowStore.getSubscriptions());
  };

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const handleRunBilling = () => {
    setBillingLoading(true);
    setBillingMessage(null);
    try {
      const res = SubflowStore.generateRecurringInvoices();
      if (res.success) {
        setBillingMessage(
          `Recurring billing engine run complete! ${res.processed_count} invoice(s) generated. ${res.skipped_count} skipped (idempotent duplicate protection).`
        );
        loadSubscriptions();
      }
    } catch (err: any) {
      setBillingMessage(`Error running billing: ${err.message}`);
    } finally {
      setBillingLoading(false);
      setTimeout(() => setBillingMessage(null), 6000);
    }
  };

  const triggerAction = (sub: Subscription, action: 'pause' | 'resume' | 'close' | 'renew') => {
    setSelectedSubForAction(sub);
    setLifecycleAction(action);
    setIsLifecycleModalOpen(true);
  };

  const filtered = subscriptions.filter(s => {
    const matchesSearch =
      s.subscription_number.toLowerCase().includes(search.toLowerCase()) ||
      (s.customer_name && s.customer_name.toLowerCase().includes(search.toLowerCase())) ||
      (s.plan_name && s.plan_name.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Subscription Lifecycle Engine
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage contract states: Draft → Quotation → Confirmed → Active → Closed (with Pause & Renewal)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="success"
            onClick={handleRunBilling}
            isLoading={billingLoading}
            leftIcon={<Play className="w-4 h-4 fill-current" />}
          >
            Run Billing Now
          </Button>
          <Button
            variant="primary"
            onClick={() => setIsCreateModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            New Subscription
          </Button>
        </div>
      </div>

      {/* Billing Feedback Message */}
      {billingMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <p className="text-xs font-medium">{billingMessage}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setBillingMessage(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Filter and Search */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full">
            <Input
              placeholder="Search subscriptions by number, customer name or plan..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Statuses ({subscriptions.length})</option>
            <option value="active">Active Only</option>
            <option value="confirmed">Confirmed Only</option>
            <option value="paused">Paused Only</option>
            <option value="closed">Closed Only</option>
            <option value="draft">Draft Only</option>
          </select>
        </div>
      </Card>

      {/* Subscriptions Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Subscription #</th>
                <th className="px-4 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Plan / Cadence</th>
                <th className="px-4 py-3.5">Next Billing</th>
                <th className="px-4 py-3.5 text-right">Cycle Value</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Lifecycle Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(sub => (
                <tr key={sub.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {sub.subscription_number}
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <span className="font-medium block">{sub.customer_name}</span>
                    <span className="text-[11px] text-slate-400">{sub.customer_email}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-semibold text-slate-800">{sub.plan_name}</span>
                    <span className="block text-[11px] text-slate-400 capitalize">
                      {sub.billing_frequency} ({sub.payment_terms})
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-slate-700 font-medium">
                      {formatDate(sub.next_billing_date)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-bold text-slate-900">
                    {formatCurrency(sub.total_amount)}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <StatusBadge status={sub.status} />
                  </td>
                  <td className="px-6 py-4 text-right space-x-1.5">
                    {sub.status === 'active' && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => triggerAction(sub, 'pause')}
                          leftIcon={<Pause className="w-3.5 h-3.5 text-amber-600" />}
                        >
                          Pause
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => triggerAction(sub, 'close')}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          leftIcon={<XCircle className="w-3.5 h-3.5" />}
                        >
                          Close
                        </Button>
                      </>
                    )}

                    {sub.status === 'paused' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => triggerAction(sub, 'resume')}
                        leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
                      >
                        Resume
                      </Button>
                    )}

                    {sub.status === 'closed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => triggerAction(sub, 'renew')}
                        leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                      >
                        Renew
                      </Button>
                    )}

                    {['draft', 'confirmed'].includes(sub.status) && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => triggerAction(sub, 'resume')}
                        leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
                      >
                        Activate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    No subscriptions found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modals */}
      <SubscriptionFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSaved={loadSubscriptions}
      />

      {selectedSubForAction && (
        <SubscriptionLifecycleModal
          isOpen={isLifecycleModalOpen}
          onClose={() => {
            setIsLifecycleModalOpen(false);
            setSelectedSubForAction(null);
          }}
          subscription={selectedSubForAction}
          targetAction={lifecycleAction}
          onUpdated={loadSubscriptions}
        />
      )}
    </div>
  );
};
