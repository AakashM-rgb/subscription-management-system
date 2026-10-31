import React, { useState, useEffect } from 'react';
import { Repeat, Pause, Play, XCircle, RotateCcw } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { StatusBadge, Badge } from '../../components/common/Badge';
import { useAuth } from '../auth/AuthContext';
import { SubflowStore } from '../../services/mockData';
import { Subscription } from '../../types/database';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import { SubscriptionLifecycleModal } from '../subscriptions/SubscriptionLifecycleModal';

export const CustomerPortalSubscriptions: React.FC = () => {
  const { user } = useAuth();
  const customerId = user?.customer_id || 'c0000000-0000-0000-0000-000000000001';

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [action, setAction] = useState<'pause' | 'resume' | 'close' | 'renew'>('pause');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadSubs = () => {
    const list = SubflowStore.getSubscriptions().filter(s => s.customer_id === customerId);
    setSubscriptions(list);
  };

  useEffect(() => {
    loadSubs();
  }, [customerId]);

  const triggerAction = (sub: Subscription, act: 'pause' | 'resume' | 'close' | 'renew') => {
    setSelectedSub(sub);
    setAction(act);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          My Subscriptions & Contracts
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Self-service management for active and historical Brightloop software subscriptions
        </p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Subscription #</th>
                <th className="px-4 py-3.5">Plan Title</th>
                <th className="px-4 py-3.5">Frequency</th>
                <th className="px-4 py-3.5">Contract Term</th>
                <th className="px-4 py-3.5">Next Renewal</th>
                <th className="px-4 py-3.5 text-right">Cycle Cost</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Self-Service Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscriptions.map(sub => (
                <tr key={sub.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {sub.subscription_number}
                  </td>
                  <td className="px-4 py-4 font-medium text-slate-800">{sub.plan_name}</td>
                  <td className="px-4 py-4 capitalize text-slate-600">{sub.billing_frequency}</td>
                  <td className="px-4 py-4 text-slate-500">
                    {formatDate(sub.start_date)} → {formatDate(sub.expiry_date)}
                  </td>
                  <td className="px-4 py-4 font-medium text-blue-600">
                    {formatDate(sub.next_billing_date)}
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
                          Cancel
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
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No active or past subscriptions registered for your account.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedSub && (
        <SubscriptionLifecycleModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedSub(null);
          }}
          subscription={selectedSub}
          targetAction={action}
          onUpdated={loadSubs}
        />
      )}
    </div>
  );
};
