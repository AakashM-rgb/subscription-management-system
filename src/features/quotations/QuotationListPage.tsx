import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Repeat,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { StatusBadge, Badge } from '../../components/common/Badge';
import { Quotation } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';
import { QuotationFormModal } from './QuotationFormModal';

export const QuotationListPage: React.FC = () => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadQuotations = () => {
    setQuotations(SubflowStore.getQuotations());
  };

  useEffect(() => {
    loadQuotations();
  }, []);

  const handleConvert = (quote: Quotation) => {
    setConvertingId(quote.id);
    setMessage(null);
    try {
      const result = SubflowStore.convertQuotationToSubscription(quote.id, true);
      if (result.success && result.subscription) {
        setMessage({
          type: 'success',
          text: `Quotation ${quote.quotation_number} converted into active subscription ${result.subscription.subscription_number}!`,
        });
        loadQuotations();
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to convert quotation.',
        });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setConvertingId(null);
      setTimeout(() => setMessage(null), 7000);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Quotations & Proposals
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create custom commercial quotes and convert accepted proposals into active subscriptions
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setIsModalOpen(true)}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          New Quotation
        </Button>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between shadow-sm animate-in fade-in duration-150 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {message.type === 'success' ? (
              <Sparkles className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            )}
            <p className="text-xs font-medium">{message.text}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setMessage(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Quotations Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Quotation #</th>
                <th className="px-4 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Plan</th>
                <th className="px-4 py-3.5">Issue Date</th>
                <th className="px-4 py-3.5">Valid Until</th>
                <th className="px-4 py-3.5 text-right">Total Value</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Convert Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotations.map(quote => {
                const isExpired = quote.valid_until < today && quote.status !== 'converted';
                const canConvert =
                  quote.status !== 'converted' && quote.status !== 'rejected' && !isExpired;

                return (
                  <tr key={quote.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {quote.quotation_number}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <span className="font-medium block">{quote.customer_name}</span>
                      <span className="text-[11px] text-slate-400">{quote.customer_email}</span>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-800">{quote.plan_name}</td>
                    <td className="px-4 py-4 text-slate-500">{formatDate(quote.issue_date)}</td>
                    <td className="px-4 py-4 text-slate-500">
                      <span className={isExpired ? 'text-rose-600 font-semibold' : ''}>
                        {formatDate(quote.valid_until)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-slate-900">
                      {formatCurrency(quote.total_amount)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge status={isExpired ? 'expired' : quote.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {quote.status === 'converted' ? (
                        <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                          Active Contract
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant={canConvert ? 'success' : 'secondary'}
                          disabled={!canConvert || convertingId === quote.id}
                          isLoading={convertingId === quote.id}
                          onClick={() => handleConvert(quote)}
                          leftIcon={<Repeat className="w-3.5 h-3.5" />}
                          title={
                            isExpired
                              ? 'Expired quotations cannot be converted'
                              : 'Convert proposal to subscription'
                          }
                        >
                          {isExpired ? 'Expired' : 'Convert to Sub'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {quotations.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No quotations on record. Click New Quotation to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      <QuotationFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={loadQuotations}
      />
    </div>
  );
};
