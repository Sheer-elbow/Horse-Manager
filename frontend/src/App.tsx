import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { ReactNode, lazy, Suspense } from 'react';

// Auth pages — kept eager so the login screen renders instantly
import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import ChangePassword from './pages/ChangePassword';

// App pages — lazy loaded so each page is its own JS chunk
const UserProfile        = lazy(() => import('./pages/UserProfile'));
const Dashboard          = lazy(() => import('./pages/Dashboard'));
const HorseList          = lazy(() => import('./pages/HorseList'));
const HorseProfile       = lazy(() => import('./pages/HorseProfile'));
const Planner            = lazy(() => import('./pages/Planner'));
const Users              = lazy(() => import('./pages/Users'));
const Programmes         = lazy(() => import('./pages/Programmes'));
const Stables            = lazy(() => import('./pages/Stables'));
const StableManage       = lazy(() => import('./pages/StableManage'));
const SecurityDashboard  = lazy(() => import('./pages/SecurityDashboard'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const Appointments       = lazy(() => import('./pages/Appointments'));
const Invoices           = lazy(() => import('./pages/Invoices'));
const CostDashboard      = lazy(() => import('./pages/CostDashboard'));

function PageLoader() {
  return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
}

function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (user.mustChangePassword) return <Navigate to="/change-password" />;
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/" />;

  return <Layout>{children}</Layout>;
}

function AuthRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  if (user && !user.mustChangePassword) return <Navigate to="/" />;
  return <>{children}</>;
}

function PasswordRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
        <Route path="/register" element={<AuthRoute><Register /></AuthRoute>} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/forgot-password" element={<AuthRoute><ForgotPassword /></AuthRoute>} />
        <Route path="/reset-password" element={<AuthRoute><ResetPassword /></AuthRoute>} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/change-password" element={<PasswordRoute><ChangePassword /></PasswordRoute>} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/horses" element={<ProtectedRoute><HorseList /></ProtectedRoute>} />
        <Route path="/horses/:id" element={<ProtectedRoute><HorseProfile /></ProtectedRoute>} />
        <Route path="/horses/:id/planner" element={<ProtectedRoute><Planner /></ProtectedRoute>} />
        <Route path="/stables" element={<ProtectedRoute><Stables /></ProtectedRoute>} />
        <Route path="/programmes" element={<ProtectedRoute><Programmes /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
        <Route path="/admin/security" element={<ProtectedRoute adminOnly><SecurityDashboard /></ProtectedRoute>} />
        <Route path="/settings/notifications" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />
        <Route path="/settings/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
        <Route path="/stable" element={<ProtectedRoute><StableManage /></ProtectedRoute>} />
        <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="/costs" element={<ProtectedRoute><CostDashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
