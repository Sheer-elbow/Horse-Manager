import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import HorseList from './pages/HorseList';
import HorseProfile from './pages/HorseProfile';
import Planner from './pages/Planner';
import Users from './pages/Users';
import Programmes from './pages/Programmes';
import { ReactNode } from 'react';

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
    <Routes>
      <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
      <Route path="/accept-invite" element={<Login />} />
      <Route path="/change-password" element={<PasswordRoute><ChangePassword /></PasswordRoute>} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/horses" element={<ProtectedRoute><HorseList /></ProtectedRoute>} />
      <Route path="/horses/:id" element={<ProtectedRoute><HorseProfile /></ProtectedRoute>} />
      <Route path="/horses/:id/planner" element={<ProtectedRoute><Planner /></ProtectedRoute>} />
      <Route path="/programmes" element={<ProtectedRoute><Programmes /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
