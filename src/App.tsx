/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthDataProvider, useAuthData } from './context/AuthDataContext.tsx';
import { AdminRulesPage } from './pages/AdminRulesPage.tsx';
import { BillAnalysisPage } from './pages/BillAnalysisPage.tsx';
import { CustomerStatusPage } from './pages/CustomerStatusPage.tsx';
import { HomeownerPortalPage } from './pages/HomeownerPortalPage.tsx';
import { LeadManagementPage } from './pages/LeadManagementPage.tsx';
import { LeadSubmissionPage } from './pages/LeadSubmissionPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NotificationsPage } from './pages/NotificationsPage.tsx';
import { ProjectTrackingDashboardPage } from './pages/ProjectTrackingDashboardPage.tsx';
import { QuotationBuilderPage } from './pages/QuotationBuilderPage.tsx';
import { SalesDashboardPage } from './pages/SalesDashboardPage.tsx';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authReady, firebaseUser, needsEmailVerification } = useAuthData();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 text-sm font-medium text-slate-700">
          Initializing SuryaSetu Solar Workspace...
        </div>
      </div>
    );
  }

  if (!firebaseUser || needsEmailVerification) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function RootRedirect() {
  const { authReady, firebaseUser, needsEmailVerification, workspaceMode } = useAuthData();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 text-sm font-medium text-slate-700">
          Loading SuryaSetu...
        </div>
      </div>
    );
  }

  if (!firebaseUser || needsEmailVerification) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={workspaceMode === 'SALES' ? '/dashboard' : '/homeowner'} replace />;
}

function AppRoutes() {
  const { authReady, firebaseUser, needsEmailVerification, workspaceMode } = useAuthData();

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      {/* Screen 1: Login, Sign Up & Interactive Estimator */}
      <Route
        path="/login"
        element={
          authReady && firebaseUser && !needsEmailVerification ? (
            <Navigate to={workspaceMode === 'SALES' ? '/dashboard' : '/homeowner'} replace />
          ) : (
            <LoginPage />
          )
        }
      />

      {/* Screen 8: Public / Customer Secure Project Status Link (No login required) */}
      <Route path="/track/:trackingToken" element={<CustomerStatusPage />} />

      {/* Homeowner Portal Overview */}
      <Route
        path="/homeowner"
        element={
          <ProtectedRoute>
            <HomeownerPortalPage />
          </ProtectedRoute>
        }
      />

      {/* Screen 2: Customer Lead Submission Form */}
      <Route
        path="/enquiry/new"
        element={
          <ProtectedRoute>
            <LeadSubmissionPage />
          </ProtectedRoute>
        }
      />

      {/* Screen 3: AI Bill Analysis & Lead Qualification Score */}
      <Route
        path="/leads/:leadId/analysis"
        element={
          <ProtectedRoute>
            <BillAnalysisPage />
          </ProtectedRoute>
        }
      />

      {/* Screen 4: Sales Dashboard & Recharts Analytics */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <SalesDashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Screen 5: Lead Management Table */}
      <Route
        path="/leads"
        element={
          <ProtectedRoute>
            <LeadManagementPage />
          </ProtectedRoute>
        }
      />

      {/* Screen 6: Solar Quotation Builder & Homeowner Proposals */}
      <Route
        path="/quotations/builder"
        element={
          <ProtectedRoute>
            <QuotationBuilderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/quotations/my"
        element={
          <ProtectedRoute>
            <QuotationBuilderPage />
          </ProtectedRoute>
        }
      />

      {/* Screen 7: Project Tracking & 10-Stage Execution Dashboard */}
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <ProjectTrackingDashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Module 7: Notifications & Simulated WhatsApp/SMS Log */}
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />

      {/* Module 8: Admin Versioned Configuration Rules */}
      <Route
        path="/admin/rules"
        element={
          <ProtectedRoute>
            <AdminRulesPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthDataProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthDataProvider>
    </ErrorBoundary>
  );
}
