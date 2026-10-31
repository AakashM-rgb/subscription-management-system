import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Subscription, SubscriptionStatus } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { AlertCircle, PauseCircle, PlayCircle, XCircle, RotateCcw } from 'lucide-react';

interface SubscriptionLifecycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: Subscription;
  targetAction: 'pause' | 'resume' | 'close' | 'renew';
  onUpdated: () => void;
}

export const SubscriptionLifecycleModal: React.FC<SubscriptionLifecycleModalProps> = ({
  isOpen,
  onClose,
  subscription,
  targetAction,
  onUpdated,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actionConfig = {
    pause: {
      title: 'Pause Subscription',
      description: `Temporarily suspend recurring billing for ${subscription.subscription_number}`,
      confirmText: 'Confirm Pause',
      variant: 'warning' as const,
      nextStatus: 'paused' as SubscriptionStatus,
      icon: <PauseCircle className="w-6 h-6 text-amber-600" />,
    },
    resume: {
      title: 'Resume Active Billing',
      description: `Re-activate subscription ${subscription.subscription_number} and resume scheduled billing cycles`,
      confirmText: 'Resume Subscription',
      variant: 'primary' as const,
      nextStatus: 'active' as SubscriptionStatus,
      icon: <PlayCircle className="w-6 h-6 text-blue-600" />,
    },
    close: {
      title: 'Early Close / Terminate Contract',
      description: `Permanently close subscription ${subscription.subscription_number}. Future billing cycles will halt.`,
      confirmText: 'Close Subscription',
      variant: 'danger' as const,
      nextStatus: 'closed' as SubscriptionStatus,
      icon: <XCircle className="w-6 h-6 text-rose-600" />,
    },
    renew: {
      title: 'Renew Closed Contract',
      description: `Re-open and renew closed contract ${subscription.subscription_number} for an additional cycle`,
      confirmText: 'Renew Contract',
      variant: 'primary' as const,
      nextStatus: 'active' as SubscriptionStatus,
      icon: <RotateCcw className="w-6 h-6 text-blue-600" />,
    },
  }[targetAction];

  const handleAction = () => {
    if (targetAction === 'close' && !reason.trim()) {
      setError('Please provide a reason for early contract closure');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = SubflowStore.transitionSubscriptionStatus(
        subscription.id,
        actionConfig.nextStatus,
        reason
      );

      if (result.success) {
        onUpdated();
        onClose();
      } else {
        setError(result.error || 'Disallowed status transition');
      }
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={actionConfig.title}
      description={actionConfig.description}
      maxWidth="md"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Customer:</span>
            <span className="font-semibold text-slate-800">{subscription.customer_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Current Status:</span>
            <span className="capitalize font-semibold text-slate-800">{subscription.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Next Billing:</span>
            <span className="font-semibold text-slate-800">{subscription.next_billing_date || 'None'}</span>
          </div>
        </div>

        {targetAction === 'close' && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Reason for Early Closure <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="e.g. Customer migrated to alternate stack / mutual agreement..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
            />
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={
              actionConfig.variant === 'danger'
                ? 'danger'
                : actionConfig.variant === 'warning'
                ? 'primary'
                : 'primary'
            }
            isLoading={loading}
            onClick={handleAction}
          >
            {actionConfig.confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
