import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Search,
  ExternalLink,
  ShieldCheck,
  Building2,
  Calendar,
  CheckCircle,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Badge } from '../../components/common/Badge';
import { Payment } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { formatDateTime } from '../../lib/date';

export const PaymentListPage: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  const loadPayments = () => {
    setPayments(SubflowStore.getPayments());
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const filtered = payments.filter(p => {
    const matchesSearch =
      p.payment_number.toLowerCase().includes(search.toLowerCase()) ||
      (p.customer_name && p.customer_name.toLowerCase().includes(search.toLowerCase())) ||
      (p.invoice_number && p.invoice_number.toLowerCase().includes(search.toLowerCase())) ||
      (p.transaction_reference &&
        p.transaction_reference.toLowerCase().includes(search.toLowerCase()));

    const matchesMethod = methodFilter === 'all' || p.payment_method === methodFilter;
    return matchesSearch && matchesMethod;
  });

  const totalCollected = payments.reduce((acc, p) => acc + p.amount, 0);

  const methodLabels: Record<string, string> = {
    bank_transfer: 'Bank Wire / NEFT',
    credit_card: 'Corporate Card',
    upi: 'UPI Instant',
    stripe: 'Stripe Gateway',
    cash: 'Cash',
    check: 'Cheque',
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Total */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Payment Reconciliation & Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Atomic payment records linked to invoices with transaction proofs and methods
          </p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl text-right">
          <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">
            Total Settled Cash
          </span>
          <span className="text-lg font-extrabold text-emerald-700">
            {formatCurrency(totalCollected)}
          </span>
        </div>
      </div>

      {/* Filter and Search */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full">
            <Input
              placeholder="Search by payment #, invoice, customer or transaction ref..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Payment Methods</option>
            <option value="bank_transfer">Bank Wire / NEFT</option>
            <option value="credit_card">Corporate Card</option>
            <option value="upi">UPI</option>
            <option value="stripe">Stripe</option>
          </select>
        </div>
      </Card>

      {/* Payments Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Payment #</th>
                <th className="px-4 py-3.5">Target Invoice</th>
                <th className="px-4 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Method</th>
                <th className="px-4 py-3.5">Transaction Ref</th>
                <th className="px-4 py-3.5">Settlement Timestamp</th>
                <th className="px-6 py-3.5 text-right">Amount Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {p.payment_number}
                  </td>
                  <td className="px-4 py-4 font-mono font-medium text-blue-600">
                    {p.invoice_number || '—'}
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <span className="font-medium block">{p.customer_name}</span>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant="neutral" size="sm">
                      {methodLabels[p.payment_method] || p.payment_method}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 font-mono text-slate-500">
                    {p.transaction_reference || 'DIRECT'}
                  </td>
                  <td className="px-4 py-4 text-slate-500">
                    {formatDateTime(p.payment_date)}
                  </td>
                  <td className="px-6 py-4 text-right font-extrabold text-emerald-600">
                    +{formatCurrency(p.amount)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    No payment records match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
