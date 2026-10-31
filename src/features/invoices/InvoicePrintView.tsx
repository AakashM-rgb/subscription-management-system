import React, { useMemo } from 'react';
import { Invoice } from '../../types/database';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import { Button } from '../../components/common/Button';
import { Printer, X, Zap, QrCode } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { generateQrMatrix } from '../../lib/qrCode';

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

  const qrMatrix = useMemo(() => {
    const cleanAmount = (remaining > 0 ? remaining : invoice.total_amount).toFixed(2);
    const upiLink = `upi://pay?pa=brightloop.billing@okhdfcbank&pn=Brightloop%20Software&am=${cleanAmount}&cu=INR&tn=Invoice%20${invoice.invoice_number}`;
    try {
      return generateQrMatrix(upiLink);
    } catch {
      return [];
    }
  }, [remaining, invoice.total_amount, invoice.invoice_number]);

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
              <p className="text-slate-400 text-[10px]">
                GSTIN: 27AABCB9012F1Z4 • CIN: U72200MH2024PTC189021
              </p>
            </div>

            <div className="text-right space-y-1">
              <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 font-bold uppercase text-[10px] tracking-wider">
                TAX INVOICE
              </span>
              <p className="font-extrabold text-base text-slate-900 pt-1">
                {invoice.invoice_number}
              </p>
              <p className="text-slate-500 text-[11px]">
                Date: {formatDate(invoice.issue_date)}
              </p>
              <p className="text-slate-500 text-[11px]">
                Due: {formatDate(invoice.due_date)}
              </p>
            </div>
          </div>

          {/* Billed To / Billing Period */}
          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Billed To:
              </p>
              <p className="font-bold text-sm text-slate-900">{invoice.customer_name}</p>
              <p className="text-slate-600">{invoice.customer_email}</p>
              <p className="text-slate-500 text-[11px] mt-1">Status: Active Corporate Subscriber</p>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Subscription Reference:
              </p>
              <p className="font-semibold text-slate-900">
                {invoice.subscription_number || 'Direct Order'}
              </p>
              <p className="text-slate-600">Period: {invoice.billing_period}</p>
              <p className="text-slate-500 text-[11px] mt-1">Payment Terms: Net 15 Days</p>
            </div>
          </div>

          {/* Line Items Table */}
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3 text-center">Qty</th>
                <th className="py-2.5 px-3 text-right">Unit Price</th>
                <th className="py-2.5 px-3 text-right">Tax Rate</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-3">
                  <p className="font-semibold text-slate-900">
                    Recurring SaaS Subscription Service
                  </p>
                  <p className="text-slate-500 text-[11px]">
                    Period: {invoice.billing_period} • Standard Enterprise SLA
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

          {/* Remittance & UPI QR Code Section */}
          <div className="pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div className="space-y-1.5 text-[11px] text-slate-600">
              <p className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                Bank Remittance & Wire Transfer
              </p>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-400">Bank:</span>
                <span className="font-semibold text-slate-800">HDFC Bank Limited</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-400">Account:</span>
                <span className="font-mono font-semibold text-slate-800">50200084920194</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-400">IFSC Code:</span>
                <span className="font-mono font-semibold text-slate-800">HDFC0001249</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">UPI VPA:</span>
                <span className="font-mono font-semibold text-blue-600">brightloop.billing@okhdfcbank</span>
              </div>
            </div>

            {/* UPI QR Code Block */}
            <div className="flex items-center gap-4 bg-slate-50 border border-slate-200/90 rounded-xl p-3.5">
              {qrMatrix.length > 0 && (
                <div className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm shrink-0">
                  <svg
                    viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                    className="w-20 h-20"
                    shapeRendering="crispEdges"
                  >
                    {qrMatrix.map((row, r) =>
                      row.map((isDark, c) =>
                        isDark ? (
                          <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0f172a" />
                        ) : null
                      )
                    )}
                  </svg>
                </div>
              )}
              <div className="space-y-1">
                <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider text-slate-900">
                  Instant UPI Scan & Pay
                </span>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Scan to pay {formatCurrency(remaining > 0 ? remaining : invoice.total_amount)} directly using GPay, PhonePe, Paytm or any UPI App.
                </p>
                <div className="flex items-center gap-1.5 pt-1 text-[9px] font-bold">
                  <span className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded">GPay</span>
                  <span className="text-purple-700 bg-purple-50 px-1 py-0.5 rounded">PhonePe</span>
                  <span className="text-sky-600 bg-sky-50 px-1 py-0.5 rounded">Paytm</span>
                </div>
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
