import React from 'react';
import { Invoice } from '../../types/database';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import { Button } from '../../components/common/Button';
import { Printer, X, Zap } from 'lucide-react';
import { Modal } from '../../components/common/Modal';

interface InvoicePrintViewProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
}

export const InvoicePrintView: React.FC<InvoicePrintViewProps> = ({
  isOpen,
  onClose,
  invoice,
}) => {
  const remaining = Math.max(0, invoice.total_amount - invoice.amount_paid);

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="4xl">
      <div className="space-y-6">
        {/* Print / Close Toolbar */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
          <span className="text-xs text-slate-500 font-medium">
            Printable Enterprise Invoice Preview
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.print()}
              leftIcon={<Printer className="w-3.5 h-3.5" />}
            >
              Print Invoice
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="p-8 bg-white border border-slate-200 rounded-xl space-y-8 text-slate-800 text-xs shadow-sm">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                  <Zap className="w-4 h-4 fill-white" />
                </div>
                <span className="font-extrabold text-lg tracking-wider text-slate-900">
                  BRIGHTLOOP SOFTWARE
                </span>
              </div>
              <p className="text-slate-500 text-[11px]">
                Subscription Billing Operations & Cloud Engineering
              </p>
              <p className="text-slate-500 text-[11px]">
                GSTIN: 29AABCB9821C1Z4 • support@brightloop.io
              </p>
            </div>

            <div className="text-right space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                TAX INVOICE
              </span>
              <h2 className="text-xl font-bold font-mono text-slate-900">
                {invoice.invoice_number}
              </h2>
              <p className="text-slate-500">
                Status:{' '}
                <span className="font-semibold uppercase text-blue-600">
                  {invoice.status}
                </span>
              </p>
            </div>
          </div>

          {/* Meta & Addresses */}
          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-100">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Billed To:
              </span>
              <p className="font-bold text-sm text-slate-900">{invoice.customer_name}</p>
              <p className="text-slate-500 mt-0.5">{invoice.customer_email}</p>
              <p className="text-slate-500 mt-0.5">Billing Terms: Net 15</p>
            </div>

            <div className="text-right space-y-1">
              <div>
                <span className="text-slate-400">Billing Period:</span>{' '}
                <span className="font-medium text-slate-800">{invoice.billing_period}</span>
              </div>
              <div>
                <span className="text-slate-400">Issue Date:</span>{' '}
                <span className="font-medium text-slate-800">{formatDate(invoice.issue_date)}</span>
              </div>
              <div>
                <span className="text-slate-400">Due Date:</span>{' '}
                <span className="font-medium text-slate-800">{formatDate(invoice.due_date)}</span>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3 text-center">Qty</th>
                <th className="py-2.5 px-3 text-right">Unit Price</th>
                <th className="py-2.5 px-3 text-right">GST Rate</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-3">
                  <p className="font-semibold text-slate-900">
                    Brightloop Core Platform & Subscription License
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Recurring software period: {invoice.billing_period}
                  </p>
                </td>
                <td className="py-3 px-3 text-center font-medium">1</td>
                <td className="py-3 px-3 text-right">{formatCurrency(invoice.subtotal)}</td>
                <td className="py-3 px-3 text-right">18%</td>
                <td className="py-3 px-3 text-right font-semibold text-slate-900">
                  {formatCurrency(invoice.subtotal)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end pt-4 border-t border-slate-200">
            <div className="w-64 space-y-2 text-right">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span>-{formatCurrency(invoice.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>GST (18%):</span>
                <span>{formatCurrency(invoice.tax_amount)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-900">
                <span>Total Invoice:</span>
                <span>{formatCurrency(invoice.total_amount)}</span>
              </div>
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Amount Settled:</span>
                <span>{formatCurrency(invoice.amount_paid)}</span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex justify-between font-extrabold text-blue-600">
                <span>Balance Due:</span>
                <span>{formatCurrency(remaining)}</span>
              </div>
            </div>
          </div>

          {/* Footer Remark */}
          <div className="pt-6 border-t border-slate-100 text-center text-[11px] text-slate-400">
            Thank you for choosing Brightloop Software. Payment terms strictly apply.
            For electronic wire transfer or invoice queries, contact finance@brightloop.io
          </div>
        </div>
      </div>
    </Modal>
  );
};
