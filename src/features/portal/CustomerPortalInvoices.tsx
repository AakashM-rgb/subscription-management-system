import React, { useState, useEffect } from 'react';
import { Receipt, CreditCard, Printer, CheckCircle2, Clock } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/Badge';
import { useAuth } from '../auth/AuthContext';
import { SubflowStore } from '../../services/mockData';
import { Invoice } from '../../types/database';
import { formatCurrency } from '../../lib/currency';
import { formatDate, isOverdue } from '../../lib/date';
import { RecordPaymentModal } from '../payments/RecordPaymentModal';
import { InvoicePrintView } from '../invoices/InvoicePrintView';

export const CustomerPortalInvoices: React.FC = () => {
  const { user } = useAuth();
  const customerId = user?.customer_id || 'c0000000-0000-0000-0000-000000000001';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedForPayment, setSelectedForPayment] = useState<Invoice | null>(null);
  const [selectedForPrint, setSelectedForPrint] = useState<Invoice | null>(null);

  const loadInvoices = () => {
    const list = SubflowStore.getInvoices().filter(i => i.customer_id === customerId);
    setInvoices(list);
  };

  useEffect(() => {
    loadInvoices();
  }, [customerId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          My Invoices & Receipts
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          View billing statements, download PDF receipts and settle open balances
        </p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Invoice #</th>
                <th className="px-4 py-3.5">Billing Period</th>
                <th className="px-4 py-3.5">Due Date</th>
                <th className="px-4 py-3.5 text-right">Invoice Amount</th>
                <th className="px-4 py-3.5 text-right">Paid</th>
                <th className="px-4 py-3.5 text-right">Balance Due</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map(inv => {
                const remaining = Math.max(0, inv.total_amount - inv.amount_paid);
                const overdue = isOverdue(inv.due_date, inv.status);
                const canPay = inv.status !== 'paid' && inv.status !== 'cancelled';

                return (
                  <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {inv.invoice_number}
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
                          onClick={() => setSelectedForPayment(inv)}
                          leftIcon={<CreditCard className="w-3.5 h-3.5" />}
                        >
                          Pay Now
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedForPrint(inv)}
                        leftIcon={<Printer className="w-3.5 h-3.5" />}
                      >
                        Receipt
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No invoices generated for your account yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modals */}
      {selectedForPayment && (
        <RecordPaymentModal
          isOpen={Boolean(selectedForPayment)}
          onClose={() => setSelectedForPayment(null)}
          invoice={selectedForPayment}
          onSuccess={loadInvoices}
        />
      )}

      {selectedForPrint && (
        <InvoicePrintView
          isOpen={Boolean(selectedForPrint)}
          onClose={() => setSelectedForPrint(null)}
          invoice={selectedForPrint}
        />
      )}
    </div>
  );
};
