import React from 'react';
import { Payment } from '../../types/database';
import { formatCurrency } from '../../lib/currency';
import { formatDateTime } from '../../lib/date';
import { Badge } from '../../components/common/Badge';

interface RecentPaymentsTableProps {
  payments: Payment[];
}

export const RecentPaymentsTable: React.FC<RecentPaymentsTableProps> = ({ payments }) => {
  if (!payments || payments.length === 0) {
    return <div className="p-6 text-center text-xs text-slate-400">No payments recorded yet</div>;
  }

  const methodLabels: Record<string, string> = {
    bank_transfer: 'Bank Transfer',
    credit_card: 'Credit Card',
    upi: 'UPI',
    stripe: 'Stripe Gateway',
    cash: 'Cash',
    check: 'Cheque',
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
          <tr>
            <th className="px-4 py-3">Payment #</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Method</th>
            <th className="px-4 py-3">Timestamp</th>
            <th className="px-4 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {payments.map(pay => (
            <tr key={pay.id} className="hover:bg-slate-50/60 transition-colors">
              <td className="px-4 py-3 font-semibold text-slate-900">
                {pay.payment_number}
              </td>
              <td className="px-4 py-3 text-slate-600 truncate max-w-[140px]">
                {pay.customer_name?.split('(')[0] || 'Customer'}
              </td>
              <td className="px-4 py-3 text-slate-500">
                <Badge variant="neutral" size="sm">
                  {methodLabels[pay.payment_method] || pay.payment_method}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-400">
                {formatDateTime(pay.payment_date)}
              </td>
              <td className="px-4 py-3 text-right font-bold text-emerald-600">
                +{formatCurrency(pay.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
