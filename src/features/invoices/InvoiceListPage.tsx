import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  CreditCard,
  Printer,
  XCircle,
  CheckCircle2,
  Clock,
  Filter,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { StatusBadge, Badge } from '../../components/common/Badge';
import { Invoice } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { formatDate, isOverdue } from '../../lib/date';
import { RecordPaymentModal } from '../payments/RecordPaymentModal';
import { InvoicePrintView } from './InvoicePrintView';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

export const InvoiceListPage: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals state
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<Invoice | null>(null);
  const [cancellingInvoice, setCancellingInvoice] = useState<Invoice | null>(null);

  const loadInvoices = () => {
    setInvoices(SubflowStore.getInvoices());
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleCancelInvoice = () => {
    if (!cancellingInvoice) return;
    const inv = { ...cancellingInvoice, status: 'cancelled' as const };
    SubflowStore.saveInvoice(inv);
    setCancellingInvoice(null);
    loadInvoices();
  };

  const filtered = invoices.filter(inv => {
    const matchesSearch =
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customer_name && inv.customer_name.toLowerCase().includes(search.toLowerCase())) ||
      inv.billing_period.toLowerCase().includes(search.toLowerCase());

    const overdue = isOverdue(inv.due_date, inv.status);

    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'overdue') return matchesSearch && overdue;
    if (statusFilter === 'unpaid') return matchesSearch && inv.status !== 'paid' && inv.status !== 'cancelled';
    return matchesSearch && inv.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Recurring Invoices & Receivables
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Idempotent billing generation, overdue aging, payment tracking and print rendering
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full">
            <Input
              placeholder="Search by invoice #, customer name or billing period..."
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
            <option value="all">All Invoices ({invoices.length})</option>
            <option value="unpaid">Unsettled / Pending</option>
            <option value="overdue">Overdue Invoices</option>
            <option value="confirmed">Confirmed</option>
            <option value="paid">Paid in Full</option>
            <option value="draft">Drafts</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </Card>

      {/* Invoices Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Invoice #</th>
                <th className="px-4 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Billing Period</th>
                <th className="px-4 py-3.5">Due Date</th>
                <th className="px-4 py-3.5 text-right">Total Amount</th>
                <th className="px-4 py-3.5 text-right">Paid</th>
                <th className="px-4 py-3.5 text-right">Balance Due</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(inv => {
                const overdue = isOverdue(inv.due_date, inv.status);
                const remaining = Math.max(0, inv.total_amount - inv.amount_paid);
                const canPay = inv.status !== 'paid' && inv.status !== 'cancelled';
                const canCancel = inv.amount_paid === 0 && inv.status !== 'cancelled' && inv.status !== 'paid';

                return (
                  <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <span className="font-medium block">{inv.customer_name}</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {inv.subscription_number || 'One-time'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{inv.billing_period}</td>
                    <td className="px-4 py-4">
                      <span className={overdue ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
                        {formatDate(inv.due_date)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-slate-900">
                      {formatCurrency(inv.total_amount)}
                    </td>
                    <td className="px-4 py-4 text-right text-emerald-600 font-semibold">
                      {formatCurrency(inv.amount_paid)}
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-slate-900">
                      {remaining > 0 ? (
                        <span className="text-blue-600">{formatCurrency(remaining)}</span>
                      ) : (
                        <span className="text-slate-400">₹0.00</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge status={overdue ? 'overdue' : inv.status} />
                    </td>
                    <td className="px-6 py-4 text-right space-x-1.5">
                      {canPay && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setSelectedInvoiceForPayment(inv)}
                          leftIcon={<CreditCard className="w-3.5 h-3.5" />}
                        >
                          Record Payment
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedInvoiceForPrint(inv)}
                        leftIcon={<Printer className="w-3.5 h-3.5" />}
                        title="Print or render PDF view"
                      >
                        Print
                      </Button>
                      {canCancel && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setCancellingInvoice(inv)}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        >
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    No invoices matching the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Record Payment Modal */}
      {selectedInvoiceForPayment && (
        <RecordPaymentModal
          isOpen={Boolean(selectedInvoiceForPayment)}
          onClose={() => setSelectedInvoiceForPayment(null)}
          invoice={selectedInvoiceForPayment}
          onSuccess={loadInvoices}
        />
      )}

      {/* Print View Modal */}
      {selectedInvoiceForPrint && (
        <InvoicePrintView
          isOpen={Boolean(selectedInvoiceForPrint)}
          onClose={() => setSelectedInvoiceForPrint(null)}
          invoice={selectedInvoiceForPrint}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      {cancellingInvoice && (
        <ConfirmDialog
          isOpen={Boolean(cancellingInvoice)}
          onClose={() => setCancellingInvoice(null)}
          onConfirm={handleCancelInvoice}
          title="Cancel Unpaid Invoice"
          message={`Are you sure you want to cancel invoice ${cancellingInvoice.invoice_number}? This action cannot be reversed.`}
          confirmText="Confirm Cancellation"
          variant="danger"
        />
      )}
    </div>
  );
};
