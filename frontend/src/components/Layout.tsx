import React, { useState, useEffect, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Dog, BookOpen, Users, LogOut, Menu, X, Bell, Search, Home, ShieldAlert, CalendarClock, Receipt, BarChart2, Plus, UserCircle, FileText, Shield } from 'lucide-react';
import { Toaster } from 'sonner';
import CommandPalette from './CommandPalette';
import QuickLogModal from './QuickLogModal';
import { api } from '../api/client';
import type { Horse } from '../types';

type Role = 'ADMIN' | 'STABLE_LEAD' | 'TRAINER' | 'RIDER' | 'GROOM' | 'OWNER';

const ALL_ROLES: Role[] = ['ADMIN', 'STABLE_LEAD', 'TRAINER', 'RIDER', 'GROOM', 'OWNER'];

const NAV_ITEMS: { path: string; label: string; icon: React.ElementType; indent?: boolean; roles: Role[] }[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ALL_ROLES },
  { path: '/horses', label: 'Horses', icon: Dog, roles: ALL_ROLES },
  { path: '/appointments', label: 'Appointments', icon: CalendarClock, roles: ALL_ROLES },
  { path: '/programmes', label: 'Programmes', icon: BookOpen, roles: ['ADMIN', 'STABLE_LEAD', 'TRAINER'] },
  { path: '/stables', label: 'Stables', icon: Home, roles: ['ADMIN'] },
  { path: '/invoices', label: 'Invoices', icon: Receipt, roles: ['ADMIN', 'STABLE_LEAD', 'OWNER'] },
  { path: '/costs', label: 'Costs', icon: BarChart2, indent: true, roles: ['ADMIN', 'STABLE_LEAD', 'OWNER'] },
];

const ADMIN_ITEMS: { path: string; label: string; icon: React.ElementType; roles: Role[] }[] = [
  { path: '/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
  { path: '/admin/security', label: 'Security', icon: ShieldAlert, roles: ['ADMIN'] },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [horses, setHorses] = useState<Horse[]>([]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Load horses for the QuickLog FAB (lightweight — just id, name, photoUrl)
  useEffect(() => {
    api<Horse[]>('/horses').then(setHorses).catch(() => {});
  }, []);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const STABLE_LEAD_ITEMS = [
    { path: '/stable', label: 'My Stable', icon: Home, roles: ['STABLE_LEAD', 'OWNER'] as Role[] },
  ];
  const role = user?.role as Role | undefined;
  const allItems = user?.role === 'ADMIN'
    ? [...NAV_ITEMS, ...ADMIN_ITEMS]
    : (user?.role === 'STABLE_LEAD' || user?.role === 'OWNER')
      ? [...NAV_ITEMS, ...STABLE_LEAD_ITEMS]
      : NAV_ITEMS;
  const items = role ? allItems.filter((item) => item.roles.includes(role)) : [];

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Toaster position="top-right" richColors closeButton />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Mobile header */}
      <div className="lg:hidden bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center justify-between">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-sidebar-accent rounded-lg transition-colors">
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <span className="font-bold text-white">Smart Stable Manager</span>
        <button
          onClick={() => setPaletteOpen(true)}
          className="p-1 hover:bg-sidebar-accent rounded-lg transition-colors"
          aria-label="Search"
        >
          <Search className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="flex overflow-hidden">
        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-30 w-64 bg-sidebar text-sidebar-foreground transform transition-transform duration-200
          lg:relative lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="p-6 border-b border-sidebar-border">
            <h1 className="text-xl font-bold text-white">Smart Stable Manager</h1>
            <p className="text-sm text-sidebar-muted mt-1 truncate">{user?.email}</p>
          </div>

          {/* Search trigger in sidebar */}
          <div className="px-3 pt-3">
            <button
              onClick={() => { setPaletteOpen(true); setSidebarOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-sidebar-accent/50 hover:bg-sidebar-accent text-sidebar-muted hover:text-sidebar-foreground text-sm transition-colors"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Search…</span>
              <span className="hidden lg:flex items-center gap-0.5 text-xs opacity-60">
                <kbd className="font-mono">⌘</kbd><kbd className="font-mono">K</kbd>
              </span>
            </button>
          </div>

          <nav className="p-3 space-y-1 mt-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              const indented = 'indent' in item && item.indent;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    indented ? 'ml-4 py-1.5' : 'py-2.5'
                  } ${
                    active
                      ? 'bg-brand-600/90 text-white'
                      : indented
                        ? 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent'
                  }`}
                >
                  <Icon className={`shrink-0 ${indented ? 'w-4 h-4' : 'w-5 h-5'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-sidebar-border space-y-1">
            <Link
              to="/settings/profile"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/settings/profile'
                  ? 'bg-brand-600/90 text-white'
                  : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
              }`}
            >
              <UserCircle className="w-5 h-5 shrink-0" />
              My Profile
            </Link>
            <Link
              to="/settings/notifications"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/settings/notifications'
                  ? 'bg-brand-600/90 text-white'
                  : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
              }`}
            >
              <Bell className="w-5 h-5 shrink-0" />
              Notifications
            </Link>
            <div className="flex items-center gap-3 px-3 py-1.5">
              <Link
                to="/privacy"
                onClick={() => setSidebarOpen(false)}
                className="text-xs text-sidebar-muted hover:text-sidebar-foreground transition-colors"
              >
                <span className="inline-flex items-center gap-1"><Shield className="w-3 h-3" />Privacy</span>
              </Link>
              <Link
                to="/terms"
                onClick={() => setSidebarOpen(false)}
                className="text-xs text-sidebar-muted hover:text-sidebar-foreground transition-colors"
              >
                <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" />Terms</span>
              </Link>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-lg text-left transition-colors"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 min-h-screen p-4 lg:p-8 overflow-x-hidden">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Global QuickLog FAB — visible on all pages when user has horses */}
      {horses.length > 0 && (
        <button
          onClick={() => setShowQuickLog(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-3 rounded-full shadow-lg transition-colors font-medium text-sm"
          title="Log a session"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Log session</span>
        </button>
      )}

      <QuickLogModal
        open={showQuickLog}
        onClose={() => setShowQuickLog(false)}
        horses={horses}
      />
    </div>
  );
}
