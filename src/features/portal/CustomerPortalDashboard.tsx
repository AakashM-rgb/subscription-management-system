import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Repeat,
  Receipt,
  CreditCard,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { StatusBadge, Badge } from '../../components/common/Badge';
import { useAuth } from '../auth/AuthContext';
import { SubflowStore } from '../../services/mockData';
import { Subscription, Invoice, Payment, Plan } from '../../types/database';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/date';

export const CustomerPortalDashboard: React.FC = () => {
  const { user } = useAuth();
  // Filter data strictly by current customer ID or email
  const customerId = user?.customer_id || 'c0000000-0000-0000-0000-000000000001';

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    const allSubs = SubflowStore.getSubscriptions().filter(s => s.customer_id === customerId);
    const allInvs = SubflowStore.getInvoices().filter(i => i.customer_id === customerId);
    const allPays = SubflowStore.getPayments().filter(p => p.customer_id === customerId);
    const allPlans = SubflowStore.getPlans().filter(p => p.is_active);

    setSubscriptions(allSubs);
    setInvoices(allInvs);
    setPayments(allPays);
    setPlans(allPlans);
  }, [customerId]);

  const activeSubs = subscriptions.filter(s => s.status === 'active');
  const unpaidInvoices = invoices.filter(
    i => i.status !== 'paid' && i.status !== 'cancelled'
  );
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-navy-900 to-navy-800 text-white p-6 rounded-2xl shadow-sm border border-navy-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-500/20 text-cyan-300 border border-blue-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Customer Self-Service
            </span>
          </div>
          <h1 className="text-xl font-bold mt-1.5 text-white">
            Welcome back, {user?.full_name || 'Valued Customer'}
          </h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Apex Dynamics Ltd • Subflow Enterprise Billing Self-Service Portal
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/portal/subscriptions">
            <Button size="sm" variant="primary" leftIcon={<Repeat className="w-3.5 h-3.5" />}>
              Manage Subscriptions
            </Button>
          </Link>
          <Link to="/portal/invoices">
            <Button size="sm" variant="secondary" leftIcon={<Receipt className="w-3.5 h-3.5" />}>
              View Invoices
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Active Subscriptions
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{activeSubs.length}</span>
            <Repeat className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-xs text-slate-400 mt-1">Live software contracts</p>
        </Card>

        <Card className="p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Unpaid Invoices
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-600">
              {unpaidInvoices.length}
            </span>
            <Receipt className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-xs text-slate-400 mt-1">Awaiting settlement</p>
        </Card>

        <Card className="p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Settled Cash
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totalPaid)}
            </span>
            <CreditCard className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-xs text-slate-400 mt-1">Total lifetime payments</p>
        </Card>

        <Card className="p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Billing Contact
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm font-bold text-slate-900 truncate">
              {user?.email}
            </span>
            <ShieldCheck className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-xs text-slate-400 mt-1">Verified customer identity</p>
        </Card>
      </div>

      {/* Active Subscriptions Preview */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>My Active Subscriptions</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Live software licenses billed on recurring cycle
            </p>
          </div>
          <Link to="/portal/subscriptions">
            <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
              View All
            </Button>
          </Link>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-3">Subscription #</th>
                <th className="px-4 py-3">Plan Name</th>
                <th className="px-4 py-3">Billing Cadence</th>
                <th className="px-4 py-3">Next Renewal Date</th>
                <th className="px-4 py-3 text-right">Cycle Cost</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscriptions.slice(0, 3).map(sub => (
                <tr key={sub.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3.5 font-semibold text-slate-900">
                    {sub.subscription_number}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-slate-800">{sub.plan_name}</td>
                  <td className="px-4 py-3.5 capitalize text-slate-600">{sub.billing_frequency}</td>
                  <td className="px-4 py-3.5 text-blue-600 font-medium">
                    {formatDate(sub.next_billing_date)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                    {formatCurrency(sub.total_amount)}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <StatusBadge status={sub.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Available Plans Catalog */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Available Brightloop Software Plans</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Explore upgraded cadences or additional developer micro-billing tiers
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map(p => (
              <div
                key={p.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3"
              >
                <div>
                  <Badge variant="primary" size="sm" className="capitalize">
                    {p.billing_frequency}
                  </Badge>
                  <h4 className="font-bold text-slate-900 text-sm mt-2">{p.name}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
                </div>
                <div className="pt-2 border-t border-slate-200 flex items-baseline justify-between">
                  <span className="text-lg font-extrabold text-slate-900">
                    {formatCurrency(p.price)}
                  </span>
                  <span className="text-[11px] text-slate-400">/{p.billing_frequency}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
