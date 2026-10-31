import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

// Auth Pages
import { LoginForm } from './features/auth/LoginForm';
import { SignupForm } from './features/auth/SignupForm';

// Admin & Staff Operations
import { DashboardOverview } from './features/dashboard/DashboardOverview';
import { CustomerListPage } from './features/customers/CustomerListPage';
import { CustomerDetailPage } from './features/customers/CustomerDetailPage';
import { ProductListPage } from './features/products/ProductListPage';
import { PlanListPage } from './features/plans/PlanListPage';
import { QuotationListPage } from './features/quotations/QuotationListPage';
import { SubscriptionListPage } from './features/subscriptions/SubscriptionListPage';
import { InvoiceListPage } from './features/invoices/InvoiceListPage';
import { PaymentListPage } from './features/payments/PaymentListPage';
import { DiscountListPage } from './features/discounts/DiscountListPage';

// Customer Portal
import { CustomerPortalDashboard } from './features/portal/CustomerPortalDashboard';
import { CustomerPortalSubscriptions } from './features/portal/CustomerPortalSubscriptions';
import { CustomerPortalInvoices } from './features/portal/CustomerPortalInvoices';
import { CustomerPortalProfile } from './features/portal/CustomerPortalProfile';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<LoginForm />} />
          <Route path="/signup" element={<SignupForm />} />

          {/* Protected Application Routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* Core Modules (Admin & Staff) */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <DashboardOverview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <CustomerListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/:customerId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <CustomerDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <ProductListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/plans"
              element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <PlanListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations"
              element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <QuotationListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/subscriptions"
              element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <SubscriptionListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/invoices"
              element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <InvoiceListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments"
              element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <PaymentListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/discounts"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <DiscountListPage />
                </ProtectedRoute>
              }
            />

            {/* Customer Portal Routes (Customer, plus staff/admin preview) */}
            <Route path="/portal" element={<CustomerPortalDashboard />} />
            <Route
              path="/portal/subscriptions"
              element={<CustomerPortalSubscriptions />}
            />
            <Route path="/portal/invoices" element={<CustomerPortalInvoices />} />
            <Route path="/portal/profile" element={<CustomerPortalProfile />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
export default App;
