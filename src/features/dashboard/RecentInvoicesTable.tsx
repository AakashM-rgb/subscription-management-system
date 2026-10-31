import React from 'react';
import { Link } from 'react-router-dom';
import { Invoice } from '../../types/database';
import { formatCurrency } from '../../lib/currency';
import { formatDate, isOverdue } from '../../lib/date';
import { StatusBadge } from '../../components/common/Badge';
import { ArrowUpRight } from 'lucide-react';

interface RecentInvoicesTableProps {
  invoices: Invoice[];
}

export const RecentInvoicesTable: React.FC<RecentInvoicesTableProps> = ({ invoices }) => {
  if (!invoices || invoices.length === 0) {
    return <div className="p-6 text-center text-xs text-slate-400">No recent invoices</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
          <tr>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Due Date</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-center">Status</th>
            <th className="px-3 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {invoices.map(inv => {
            const overdue = isOverdue(inv.due_date, inv.status);
            return (
              <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {inv.invoice_number}
                </td>
                <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]">
                  {inv.customer_name?.split('(')[0] || 'Customer'}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  <span className={overdue ? 'text-rose-600 font-semibold' : ''}>
                    {formatDate(inv.due_date)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {formatCurrency(inv.total_amount)}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={overdue ? 'overdue' : inv.status} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Link
                    to={`/invoices`}
                    className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
