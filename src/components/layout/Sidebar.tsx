import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Repeat,
  Receipt,
  CreditCard,
  Package,
  Layers,
  Percent,
  FileText,
  ShieldAlert,
  Zap,
  UserCheck,
  ChevronRight,
  LogOut,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { cn } from '../../lib/utils';
import { StatusBadge } from '../common/Badge';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, logout, switchDemoRole } = useAuth();
  const { isAdmin, isStaff, isCustomer } = usePermissions();
  const location = useLocation();

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'staff'],
    },
    {
      name: 'Customers',
      href: '/customers',
      icon: Users,
      roles: ['admin', 'staff'],
    },
    {
      name: 'Quotations',
      href: '/quotations',
      icon: FileText,
      roles: ['admin', 'staff'],
    },
    {
      name: 'Subscriptions',
      href: '/subscriptions',
      icon: Repeat,
      roles: ['admin', 'staff'],
    },
    {
      name: 'Invoices',
      href: '/invoices',
      icon: Receipt,
      roles: ['admin', 'staff'],
    },
    {
      name: 'Payments',
      href: '/payments',
      icon: CreditCard,
      roles: ['admin', 'staff'],
    },
  ];

  const adminNavigation = [
    {
      name: 'Products & Variants',
      href: '/products',
      icon: Package,
      roles: ['admin'],
    },
    {
      name: 'Plans',
      href: '/plans',
      icon: Layers,
      roles: ['admin'],
    },
    {
      name: 'Discounts',
      href: '/discounts',
      icon: Percent,
      roles: ['admin'],
    },
  ];

  const customerNavigation = [
    {
      name: 'My Portal',
      href: '/portal',
      icon: LayoutDashboard,
      roles: ['customer'],
    },
    {
      name: 'My Subscriptions',
      href: '/portal/subscriptions',
      icon: Repeat,
      roles: ['customer'],
    },
    {
      name: 'My Invoices',
      href: '/portal/invoices',
      icon: Receipt,
      roles: ['customer'],
    },
    {
      name: 'Profile & Settings',
      href: '/portal/profile',
      icon: Users,
      roles: ['customer'],
    },
  ];

  const currentNav = isCustomer ? customerNavigation : navigation;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Dark Navy Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-navy-900 text-slate-300 flex flex-col border-r border-navy-800 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-navy-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 font-bold text-lg">
              <Zap className="w-5 h-5 fill-white text-white" />
            </div>
            <div>
              <span className="font-bold text-white tracking-wider text-base">
                SUBFLOW
              </span>
              <span className="block text-[10px] text-slate-400 font-medium tracking-tight">
                Brightloop Software
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Main Operational Links */}
          <div>
            <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {isCustomer ? 'Customer Portal' : 'Operations'}
            </div>
            <nav className="space-y-1">
              {currentNav.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.href);
                return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={() => onClose()}
                    className={({ isActive: exactActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                        exactActive || isActive
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                      )
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0 transition-colors" />
                    <span className="flex-1 truncate">{item.name}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Admin Catalogue & Rules (Visible to Admin or Staff Preview) */}
          {!isCustomer && (
            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Catalogue & Rules</span>
                <span className="text-[10px] bg-navy-800 text-blue-400 px-1.5 py-0.5 rounded font-mono">
                  Admin
                </span>
              </div>
              <nav className="space-y-1">
                {adminNavigation.map(item => {
                  const Icon = item.icon;
                  const isActive = location.pathname.startsWith(item.href);
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      onClick={() => onClose()}
                      className={({ isActive: exactActive }) =>
                        cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                          exactActive || isActive
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                        )
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 truncate">{item.name}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Customer Portal Shortcut for Admin/Staff */}
          {!isCustomer && (
            <div className="pt-2">
              <NavLink
                to="/portal"
                onClick={() => onClose()}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium bg-navy-800/80 hover:bg-navy-800 text-cyan-300 border border-navy-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                  <span>Preview Customer Portal</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </NavLink>
            </div>
          )}
        </div>

        {/* Footer User Info & Role Switcher */}
        <div className="p-4 border-t border-navy-800 bg-navy-950/50">
          <div className="flex items-center gap-3">
            <img
              src={
                user?.avatar_url ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.full_name || 'U')}&background=1e40af&color=fff`
              }
              alt={user?.full_name || 'User'}
              className="w-9 h-9 rounded-full ring-2 ring-navy-700 object-cover"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-white truncate">
                  {user?.full_name?.split(' ')[0] || 'User'}
                </p>
                <StatusBadge status={user?.role || 'customer'} />
              </div>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => logout()}
              title="Sign out"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-navy-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
