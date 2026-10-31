import { useAuth } from '../features/auth/AuthContext';

export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role || 'customer';

  const isAdmin = role === 'admin';
  const isStaff = role === 'staff';
  const isCustomer = role === 'customer';
  const isInternal = isAdmin || isStaff;

  return {
    role,
    isAdmin,
    isStaff,
    isCustomer,
    isInternal,

    // Specific permissions
    canManageStaff: isAdmin,
    canManageProducts: isAdmin,
    canManagePlans: isAdmin,
    canManageTaxes: isAdmin,
    canManageDiscounts: isAdmin,

    canManageCustomers: isInternal,
    canManageQuotations: isInternal,
    canManageSubscriptions: isInternal,
    canGenerateInvoices: isInternal,
    canRecordPayments: isInternal,
    canViewAnalytics: isInternal,

    // Customer Portal permissions
    canAccessPortal: isCustomer,
    canRequestSubscriptionActions: isCustomer || isInternal,
  };
}
