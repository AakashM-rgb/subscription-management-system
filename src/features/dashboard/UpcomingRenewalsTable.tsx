import React from 'react';
import { Link } from 'react-router-dom';
import { Subscription } from '../../types/database';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import { Badge } from '../../components/common/Badge';
import { CalendarClock, ArrowUpRight } from 'lucide-react';

interface UpcomingRenewalsTableProps {
  subscriptions: Subscription[];
}

export const UpcomingRenewalsTable: React.FC<UpcomingRenewalsTableProps> = ({
  subscriptions,
}) => {
  if (!subscriptions || subscriptions.length === 0) {
    return <div className="p-6 text-center text-xs text-slate-400">No renewals pending in pipeline</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
          <tr>
            <th className="px-4 py-3">Subscription</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Plan / Frequency</th>
            <th className="px-4 py-3">Next Billing</th>
            <th className="px-4 py-3 text-right">Value</th>
            <th className="px-3 py-3 text-right">View</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {subscriptions.map(sub => (
            <tr key={sub.id} className="hover:bg-slate-50/60 transition-colors">
              <td className="px-4 py-3 font-semibold text-slate-900">
                {sub.subscription_number}
              </td>
              <td className="px-4 py-3 text-slate-600 truncate max-w-[140px]">
                {sub.customer_name?.split('(')[0] || 'Customer'}
              </td>
              <td className="px-4 py-3">
                <span className="font-medium text-slate-800">{sub.plan_name}</span>
                <span className="block text-[11px] text-slate-400 capitalize">
                  {sub.billing_frequency}
                </span>
              </td>
              <td className="px-4 py-3 font-medium text-blue-600 flex items-center gap-1.5 pt-3.5">
                <CalendarClock className="w-3.5 h-3.5" />
                <span>{formatDate(sub.next_billing_date)}</span>
              </td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">
                {formatCurrency(sub.total_amount)}
              </td>
              <td className="px-3 py-3 text-right">
                <Link
                  to={`/subscriptions`}
                  className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
