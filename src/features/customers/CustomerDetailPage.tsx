import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Repeat,
  Receipt,
  CreditCard,
  Edit,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/Badge';
import { Customer, Subscription, Invoice, Payment } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { formatCurrency } from '../../lib/currency';
import { formatDate, formatDateTime, isOverdue } from '../../lib/date';
import { CustomerFormModal } from './CustomerFormModal';

export const CustomerDetailPage: React.FC = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'invoices' | 'payments'>('subscriptions');

  const loadData = () => {
    if (!customerId) return;
    const cust = SubflowStore.getCustomers().find(c => c.id === customerId);
    if (!cust) {
      navigate('/customers');
      return;
    }
    setCustomer(cust);

    // Load related history
    const allSubs = SubflowStore.getSubscriptions().filter(s => s.customer_id === customerId);
    const allInvs = SubflowStore.getInvoices().filter(i => i.customer_id === customerId);
    const allPays = SubflowStore.getPayments().filter(p => p.customer_id === customerId);

    setSubscriptions(allSubs);
    setInvoices(allInvs);
    setPayments(allPays);
  };

  useEffect(() => {
    loadData();
  }, [customerId]);

  if (!customer) return null;

  return (
    <div className="space-y-6">
      {/* Back and Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/customers"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
              <StatusBadge status={customer.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {customer.company || 'Individual Account'} • Customer ID: {customer.id.slice(0, 8)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsEditModalOpen(true)}
            leftIcon={<Edit className="w-3.5 h-3.5" />}
          >
            Edit Profile
          </Button>
          <Link to={`/subscriptions?action=new&customerId=${customer.id}`}>
            <Button size="sm" variant="primary" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Create Subscription
            </Button>
          </Link>
        </div>
      </div>

      {/* Customer Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 md:col-span-1 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Account Profile
          </h3>
          <div className="space-y-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-900">{customer.company || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline">
                {customer.email}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{customer.phone || '—'}</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                {[customer.billing_address, customer.city, customer.state, customer.postal_code, customer.country]
                  .filter(Boolean)
                  .join(', ') || 'No address registered'}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-400 block">Tax Registration</span>
              <span className="font-mono font-medium text-slate-800">
                {customer.tax_id || 'Not registered'}
              </span>
            </div>
          </div>
        </Card>

        {/* Financial Overview Stats */}
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Total Subscriptions
            </span>
            <span className="text-2xl font-bold text-slate-900 mt-2">
              {subscriptions.length}
            </span>
            <span className="text-xs text-slate-400 mt-1">
              {subscriptions.filter(s => s.status === 'active').length} active contract(s)
            </span>
          </Card>

          <Card className="p-5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Settled Payments
            </span>
            <span className="text-2xl font-bold text-emerald-600 mt-2">
              {formatCurrency(payments.reduce((acc, p) => acc + p.amount, 0))}
            </span>
            <span className="text-xs text-slate-400 mt-1">
              Across {payments.length} successful payment(s)
            </span>
          </Card>

          <Card className="p-5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Outstanding Balance
            </span>
            <span className="text-2xl font-bold text-amber-600 mt-2">
              {formatCurrency(
                invoices.reduce((acc, inv) => acc + (inv.status !== 'cancelled' ? Math.max(0, inv.total_amount - inv.amount_paid) : 0), 0)
              )}
            </span>
            <span className="text-xs text-slate-400 mt-1">
              Unsettled invoices in account
            </span>
          </Card>
        </div>
      </div>

      {/* Tabs Section: Subscriptions, Invoices, Payments */}
      <Card>
        <div className="border-b border-slate-100 px-6 flex gap-6">
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`py-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'subscriptions'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Repeat className="w-4 h-4" />
            <span>Subscriptions ({subscriptions.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`py-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'invoices'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Invoices ({invoices.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`py-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'payments'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Payments ({payments.length})</span>
          </button>
        </div>

        <div className="p-0">
          {activeTab === 'subscriptions' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3">Subscription #</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Billing Frequency</th>
                    <th className="px-4 py-3">Next Billing</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subscriptions.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5 font-semibold text-slate-900">
                        {s.subscription_number}
                      </td>
                      <td className="px-4 py-3.5 text-slate-800">{s.plan_name}</td>
                      <td className="px-4 py-3.5 capitalize text-slate-600">{s.billing_frequency}</td>
                      <td className="px-4 py-3.5 text-slate-600">{formatDate(s.next_billing_date)}</td>
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-900">
                        {formatCurrency(s.total_amount)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))}
                  {subscriptions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        No subscriptions found for this customer.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'invoices' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3">Invoice #</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5 font-semibold text-slate-900">
                        {inv.invoice_number}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{inv.billing_period}</td>
                      <td className="px-4 py-3.5 text-slate-600">{formatDate(inv.due_date)}</td>
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-900">
                        {formatCurrency(inv.total_amount)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-emerald-600 font-semibold">
                        {formatCurrency(inv.amount_paid)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={isOverdue(inv.due_date, inv.status) ? 'overdue' : inv.status} />
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        No invoices generated for this customer yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3">Payment #</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5 font-semibold text-slate-900">
                        {p.payment_number}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{p.invoice_number || '—'}</td>
                      <td className="px-4 py-3.5 capitalize text-slate-600">{p.payment_method.replace('_', ' ')}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-500">{p.transaction_reference || '—'}</td>
                      <td className="px-4 py-3.5 text-slate-500">{formatDateTime(p.payment_date)}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-emerald-600">
                        +{formatCurrency(p.amount)}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        No payments recorded for this customer yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Edit Customer Modal */}
      <CustomerFormModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        customer={customer}
        onSaved={loadData}
      />
    </div>
  );
};
