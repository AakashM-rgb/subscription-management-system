import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { InviteStaffModal } from '../../features/auth/InviteStaffModal';

export const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const location = useLocation();

  const getPageTitle = (pathname: string): string => {
    if (pathname.startsWith('/dashboard')) return 'Executive Dashboard & Billing Overview';
    if (pathname.startsWith('/customers')) return 'Customer Account Management';
    if (pathname.startsWith('/products')) return 'Product Catalogue & Variants';
    if (pathname.startsWith('/plans')) return 'Subscription Plans & Frequencies';
    if (pathname.startsWith('/quotations')) return 'Quotations & Proposal Templates';
    if (pathname.startsWith('/subscriptions')) return 'Subscription Lifecycle & Contracts';
    if (pathname.startsWith('/invoices')) return 'Recurring Invoices & Receivables';
    if (pathname.startsWith('/payments')) return 'Payment Records & Reconciliation';
    if (pathname.startsWith('/discounts')) return 'Discount Engine & Promotional Rules';
    if (pathname.startsWith('/portal')) return 'Customer Billing Self-Service Portal';
    return 'Brightloop Subflow';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Dark Navy Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Light Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          onMenuToggle={() => setSidebarOpen(prev => !prev)}
          title={getPageTitle(location.pathname)}
          onInviteStaff={() => setInviteModalOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Admin Invite Staff Modal */}
      <InviteStaffModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
      />
    </div>
  );
};
