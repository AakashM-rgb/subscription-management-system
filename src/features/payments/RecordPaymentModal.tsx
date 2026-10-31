import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { Invoice, PaymentMethod } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  onSuccess: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}) => {
  const remainingBalance = Math.max(0, invoice.total_amount - invoice.amount_paid);

  const [amount, setAmount] = useState<number>(Number(remainingBalance.toFixed(2)));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      setError('Payment amount must be greater than zero');
      return;
    }

    if (amount > remainingBalance + 0.01) {
      setError(
        `Payment of ${formatCurrency(amount)} exceeds the remaining balance of ${formatCurrency(remainingBalance)}`
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = SubflowStore.recordPayment(
        invoice.id,
        amount,
        paymentMethod,
        transactionRef,
        notes
      );

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error || 'Failed to record payment');
      }
    } catch (err: any) {
      setError(err.message || 'Payment execution error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Payment Settlement"
      description={`Invoice ${invoice.invoice_number} • ${invoice.customer_name}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Balance Card */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
          <div className="flex justify-between text-slate-500">
            <span>Invoice Total:</span>
            <span className="font-semibold text-slate-900">
              {formatCurrency(invoice.total_amount)}
            </span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Already Settled:</span>
            <span className="font-semibold text-emerald-600">
              {formatCurrency(invoice.amount_paid)}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-900">
            <span>Remaining Outstanding:</span>
            <span className="text-blue-600">{formatCurrency(remainingBalance)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Payment Amount (₹)"
            type="number"
            step="0.01"
            max={remainingBalance}
            value={amount}
            onChange={e => setAmount(parseFloat(e.target.value) || 0)}
            hint={
              amount < remainingBalance
                ? `Partial settlement (leaves ${formatCurrency(remainingBalance - amount)})`
                : 'Full settlement'
            }
            required
          />

          <Select
            label="Payment Method"
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
            options={[
              { label: 'Bank Transfer (NEFT/RTGS)', value: 'bank_transfer' },
              { label: 'Corporate Credit Card', value: 'credit_card' },
              { label: 'UPI / Instant Pay', value: 'upi' },
              { label: 'Stripe Gateway', value: 'stripe' },
              { label: 'Bank Cheque', value: 'check' },
              { label: 'Cash Settlement', value: 'cash' },
            ]}
          />
        </div>

        <Input
          label="Transaction / Reference #"
          placeholder="e.g. UTR-9821039 or CH-4042"
          value={transactionRef}
          onChange={e => setTransactionRef(e.target.value)}
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Reconciliation Notes
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Deposit account or verification remark..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
            leftIcon={<CreditCard className="w-4 h-4" />}
          >
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
};
