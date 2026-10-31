import React, { useState } from 'react';
import { Menu, Play, UserPlus, RefreshCw, Sparkles, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Button } from '../common/Button';
import { UserRole } from '../../types/database';
import { SubflowStore } from '../../services/mockData';
import { supabase, isSupabaseConfigured } from '../../services/supabase';

interface HeaderProps {
  onMenuToggle: () => void;
  title?: string;
  onRefresh?: () => void;
  onInviteStaff?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onMenuToggle,
  title,
  onRefresh,
  onInviteStaff,
}) => {
  const { user, switchDemoRole, isDemoMode } = useAuth();
  const { isAdmin, isStaff } = usePermissions();
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingResult, setBillingResult] = useState<string | null>(null);

  const handleRunBillingNow = async () => {
    setBillingLoading(true);
    setBillingResult(null);
    try {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error: rpcErr } = await supabase.rpc('generate_recurring_invoices', {
            p_target_date: new Date().toISOString().split('T')[0],
          });
          if (!rpcErr && data) {
            setBillingResult(`Supabase billing executed! ${data.invoices_generated ?? 0} invoice(s) generated.`);
            if (onRefresh) onRefresh();
            return;
          }
        } catch {
          // Fall through to local simulation
        }
      }

      // Execute billing engine immediately in local store
      const res = SubflowStore.generateRecurringInvoices();
      if (res.success) {
        setBillingResult(`Billing executed! ${res.processed_count} invoice(s) generated.`);
        if (onRefresh) onRefresh();
      } else {
        setBillingResult('Billing failed to complete.');
      }
    } catch (err: any) {
      setBillingResult(`Error: ${err.message}`);
    } finally {
      setBillingLoading(false);
      setTimeout(() => setBillingResult(null), 5000);
    }
  };

  const roles: { id: UserRole; label: string; desc: string }[] = [
    { id: 'admin', label: 'Admin', desc: 'Full System Access' },
    { id: 'staff', label: 'Staff', desc: 'Operations & Invoicing' },
    { id: 'customer', label: 'Customer', desc: 'Apex Dynamics Portal' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {title && (
          <h1 className="text-lg font-bold text-slate-900 tracking-tight hidden sm:block">
            {title}
          </h1>
        )}
      </div>

      {/* Role Switcher & Actions */}
      <div className="flex items-center gap-2.5">
        {/* Interactive Hackathon Role Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 hidden md:inline">
            Role:
          </span>
          {roles.map(r => (
            <button
              key={r.id}
              onClick={() => switchDemoRole(r.id)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all text-xs ${
                user?.role === r.id
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title={r.desc}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Staff/Admin Action: Run Billing Now */}
        {(isAdmin || isStaff) && (
          <Button
            size="sm"
            variant="primary"
            onClick={handleRunBillingNow}
            isLoading={billingLoading}
            leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
            title="Trigger recurring billing operation"
            className="hidden sm:inline-flex bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500"
          >
            Run Billing Now
          </Button>
        )}

        {/* Admin Action: Invite Staff */}
        {isAdmin && onInviteStaff && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onInviteStaff}
            leftIcon={<UserPlus className="w-3.5 h-3.5" />}
            className="hidden md:inline-flex"
          >
            Invite Staff
          </Button>
        )}
      </div>

      {/* Floating Billing Notification Toast */}
      {billingResult && (
        <div className="fixed bottom-6 right-6 z-50 bg-navy-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-navy-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Check className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{billingResult}</span>
        </div>
      )}
    </header>
  );
};
