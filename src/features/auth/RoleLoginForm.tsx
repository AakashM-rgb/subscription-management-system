import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Zap, ArrowRight, ShieldCheck, UserCheck, Building2, KeyRound } from 'lucide-react';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { useAuth, DEMO_PROFILES } from './AuthContext';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { UserRole } from '../../types/database';

interface RoleConfig {
  role: UserRole;
  title: string;
  subtitle: string;
  badge: string;
  badgeClass: string;
  icon: React.FC<{ className?: string }>;
  accentColor: string;
  defaultEmail: string;
  defaultPassword: string;
  redirectUrl: string;
  features: string[];
}

export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  admin: {
    role: 'admin',
    title: 'Administrator Console',
    subtitle: 'Full access to Catalogue, Pricing, MRR Engine & Platform Configuration',
    badge: 'SYSTEM ARCHITECT & ADMIN',
    badgeClass: 'bg-purple-900/60 text-purple-300 border-purple-700',
    icon: ShieldCheck,
    accentColor: 'from-purple-600 to-indigo-600',
    defaultEmail: 'admin@brightloop.io',
    defaultPassword: 'Admin@Secure2026!',
    redirectUrl: '/dashboard',
    features: [
      'Product & Variant Pricing Architecture',
      'Billing Frequencies & Lifecycle Rules',
      'Staff Role Delegation & Invitations',
      'Full MRR Waterfall & Revenue Ledger',
    ],
  },
  staff: {
    role: 'staff',
    title: 'Staff Operations Portal',
    subtitle: 'Customer accounts, recurring billing, quotations and payment processing',
    badge: 'OPERATIONS & BILLING DESK',
    badgeClass: 'bg-blue-900/60 text-blue-300 border-blue-700',
    icon: UserCheck,
    accentColor: 'from-blue-600 to-cyan-600',
    defaultEmail: 'billing.ops@brightloop.io',
    defaultPassword: 'Staff@Ops2026!',
    redirectUrl: '/dashboard',
    features: [
      'Customer Onboarding & Account Directory',
      'Quotation Formulation & Sub Conversion',
      'Recurring Billing Run & Invoicing Engine',
      'Atomic Payment Reconciliation (Bank/UPI)',
    ],
  },
  customer: {
    role: 'customer',
    title: 'Customer Self-Service Portal',
    subtitle: 'Apex Dynamics Ltd Subscription Contracts, Invoices & UPI Settlement',
    badge: 'CLIENT SELF-SERVICE ACCESS',
    badgeClass: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
    icon: Building2,
    accentColor: 'from-emerald-600 to-teal-600',
    defaultEmail: 'alex.mercer@apextech.io',
    defaultPassword: 'Customer@Apex2026!',
    redirectUrl: '/portal',
    features: [
      'View Active Subscriptions & Renewal Dates',
      'Self-Service Pause & Cancellation Requests',
      'Instant UPI QR Settlement (GPay/PhonePe/Paytm)',
      'Tax Invoices & Statement Downloads',
    ],
  },
};

interface RoleLoginFormProps {
  forcedRole?: UserRole;
}

export const RoleLoginForm: React.FC<RoleLoginFormProps> = ({ forcedRole = 'admin' }) => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const config = ROLE_CONFIGS[forcedRole];

  const [email, setEmail] = useState(config.defaultEmail);
  const [password, setPassword] = useState(config.defaultPassword);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await login(email, password, forcedRole);
      if (res.success) {
        navigate(config.redirectUrl);
      } else {
        setError(res.error || 'Authentication failed. Please verify your role credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setEmail(config.defaultEmail);
    setPassword(config.defaultPassword);
  };

  const IconComponent = config.icon;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Ambience */}
      <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-gradient-to-tr ${config.accentColor} opacity-20 blur-[130px] rounded-full pointer-events-none`} />

      {/* Top Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center space-y-3">
        <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${config.accentColor} flex items-center justify-center text-white font-bold shadow-md`}>
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <span className="font-extrabold text-white tracking-wider text-base">
            SUBFLOW
          </span>
          <span className="text-[10px] bg-slate-800 text-slate-300 font-semibold px-2 py-0.5 rounded border border-slate-700">
            Brightloop Software
          </span>
        </div>

        <div>
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${config.badgeClass}`}>
              <IconComponent className="w-3 h-3" />
              <span>{config.badge}</span>
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {config.title}
          </h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            {config.subtitle}
          </p>
        </div>
      </div>

      {/* Role Switcher Nav */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-xl text-xs">
          <Link
            to="/login/admin"
            className={`py-1.5 px-2 text-center rounded-lg font-semibold transition-all flex items-center justify-center gap-1 text-[11px] ${
              forcedRole === 'admin'
                ? 'bg-purple-600 text-white shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            <span>Admin</span>
          </Link>
          <Link
            to="/login/staff"
            className={`py-1.5 px-2 text-center rounded-lg font-semibold transition-all flex items-center justify-center gap-1 text-[11px] ${
              forcedRole === 'staff'
                ? 'bg-blue-600 text-white shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <UserCheck className="w-3 h-3" />
            <span>Staff</span>
          </Link>
          <Link
            to="/login/customer"
            className={`py-1.5 px-2 text-center rounded-lg font-semibold transition-all flex items-center justify-center gap-1 text-[11px] ${
              forcedRole === 'customer'
                ? 'bg-emerald-600 text-white shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 className="w-3 h-3" />
            <span>Customer</span>
          </Link>
        </div>
      </div>

      {/* Login Card */}
      <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-200">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* Quick Demo Pre-fill Pill */}
          <div className="mb-5 p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-slate-800 text-[11px]">
                Demo Persona Credentials
              </p>
              <p className="text-slate-500 font-mono text-[10px]">
                {config.defaultEmail}
              </p>
            </div>
            <button
              type="button"
              onClick={handleFillDemo}
              className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-[10px] font-bold text-slate-700 shadow-xs transition-colors"
            >
              Auto-Fill
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Account Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              leftIcon={<Mail className="w-4 h-4" />}
              required
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setForgotModalOpen(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              isLoading={loading}
              className="w-full mt-2"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to {config.title.split(' ')[0]}
            </Button>
          </form>

          {/* Role Entitlements List */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Role Access & Permissions:
            </span>
            <ul className="space-y-1.5 text-[11px] text-slate-600">
              {config.features.map((feat, idx) => (
                <li key={idx} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 text-center text-xs text-slate-500 pt-3 border-t border-slate-100">
            Need access to a different department?{' '}
            <Link to="/login" className="font-semibold text-blue-600 hover:underline">
              View All Portals
            </Link>
          </div>
        </div>
      </div>

      <ForgotPasswordModal
        isOpen={forgotModalOpen}
        onClose={() => setForgotModalOpen(false)}
      />
    </div>
  );
};
