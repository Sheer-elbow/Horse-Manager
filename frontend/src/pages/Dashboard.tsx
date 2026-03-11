import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Horse, User } from '../types';
import { AlertTriangle, CheckCircle2, Clock, Calendar, Syringe, Users, Activity } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';

interface TodayWorkout {
  id: string;
  horseId: string;
  horse: { id: string; name: string; photoUrl: string | null };
  slot: 'AM' | 'PM';
  programmeName: string | null;
  appliedPlanId: string | null;
  currentData: { title?: string; category?: string; durationMin?: number | null };
  logged: boolean;
}

interface VaccinationAlert {
  id: string;
  horseId: string;
  horse: { id: string; name: string };
  name: string | null;
  dueDate: string;
  overdue: boolean;
}

interface RecentSession {
  id: string;
  horseId: string;
  horse: { id: string; name: string };
  date: string;
  slot: 'AM' | 'PM';
  sessionType: string | null;
  durationMinutes: number | null;
  createdBy: { id: string; name: string | null; email: string };
}

interface DashboardData {
  todayWorkouts: TodayWorkout[];
  upcomingVaccinations: VaccinationAlert[];
  recentSessions: RecentSession[];
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDate(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days}d`;
}

function formatActivityDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const { user } = useAuth();
  const [horses, setHorses] = useState<Horse[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => {
    const load = async () => {
      try {
        const [h, dash] = await Promise.all([
          api<Horse[]>('/horses'),
          api<DashboardData>('/dashboard'),
        ]);
        setHorses(h);
        setDashData(dash);
        if (user?.role === 'ADMIN') {
          const u = await api<User[]>('/users');
          setUsers(u);
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (loading) return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-36 mb-1" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
      {/* Today's workouts */}
      <div className="bg-white rounded-xl border p-5 space-y-3">
        <Skeleton className="h-5 w-40 mb-4" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
            <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      {/* Recent activity */}
      <div className="bg-white rounded-xl border p-5 space-y-3">
        <Skeleton className="h-5 w-32 mb-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const isNewAdmin = user?.role === 'ADMIN' && horses.length === 0;
  const hasNoHorses = horses.length === 0;

  const unloggedToday = dashData?.todayWorkouts.filter((w) => !w.logged) ?? [];
  const hasAlerts = (dashData?.upcomingVaccinations.length ?? 0) > 0 || unloggedToday.length > 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">{todayLabel}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
          <div className="text-2xl font-bold text-brand-600">{horses.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Horses</div>
          <Link to="/horses" className="text-xs text-brand-600 hover:underline mt-1 inline-block">View all</Link>
        </div>
        {user?.role === 'ADMIN' && (
          <div className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
            <div className="text-2xl font-bold text-brand-600">{users.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Team members</div>
            <Link to="/admin/users" className="text-xs text-brand-600 hover:underline mt-1 inline-block">Manage</Link>
          </div>
        )}
        <div className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
          <div className="text-2xl font-bold text-brand-600">{dashData?.todayWorkouts.length ?? 0}</div>
          <div className="text-xs text-gray-500 mt-0.5">Sessions today</div>
          {unloggedToday.length > 0 && (
            <div className="text-xs text-amber-600 mt-1">{unloggedToday.length} unlogged</div>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
          <div className="text-2xl font-bold text-brand-600">{dashData?.upcomingVaccinations.filter(v => v.overdue).length ?? 0}</div>
          <div className="text-xs text-gray-500 mt-0.5">Overdue health alerts</div>
          {(dashData?.upcomingVaccinations.filter(v => !v.overdue).length ?? 0) > 0 && (
            <div className="text-xs text-amber-600 mt-1">{dashData!.upcomingVaccinations.filter(v => !v.overdue).length} due soon</div>
          )}
        </div>
      </div>

      {/* Onboarding checklist — shown to new admins with no horses */}
      {isNewAdmin && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-5">
          <h3 className="font-semibold text-brand-800 mb-3">Get started with Stable Manager</h3>
          <div className="space-y-2.5">
            {[
              { label: 'Add your first horse', to: '/horses', done: horses.length > 0 },
              { label: 'Invite your team', to: '/admin/users', done: users.length > 1 },
              { label: 'Upload a training programme', to: '/programmes', done: false },
            ].map((step) => (
              <Link
                key={step.label}
                to={step.to}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  step.done
                    ? 'bg-white border-green-200 text-gray-400'
                    : 'bg-white border-brand-200 hover:border-brand-400 text-gray-700'
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-brand-300 shrink-0" />
                )}
                <span className={`text-sm font-medium ${step.done ? 'line-through' : ''}`}>{step.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Today's sessions */}
      {(dashData?.todayWorkouts.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-brand-600" />
            <h3 className="text-base font-semibold text-gray-900">Today's sessions</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dashData!.todayWorkouts.map((w) => {
              const title = (w.currentData as { title?: string })?.title;
              const category = (w.currentData as { category?: string })?.category;
              const durationMin = (w.currentData as { durationMin?: number | null })?.durationMin;
              return (
                <Link
                  key={w.id}
                  to={`/horses/${w.horseId}/planner`}
                  className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow flex items-center gap-4"
                >
                  {w.horse.photoUrl ? (
                    <img src={w.horse.photoUrl} alt={w.horse.name} className="w-10 h-10 rounded-lg object-cover border shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 border flex items-center justify-center text-gray-300 text-lg shrink-0">&#x1f40e;</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{w.horse.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{w.slot}</span>
                    </div>
                    {title && <div className="text-sm text-gray-600 truncate">{title}</div>}
                    {category && !title && <div className="text-sm text-gray-500 truncate">{category}</div>}
                    {durationMin && <div className="text-xs text-gray-400 mt-0.5">{durationMin} min</div>}
                  </div>
                  <div className="shrink-0">
                    {w.logged ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Logged
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">
                        <Clock className="w-3.5 h-3.5" /> Pending
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Health alerts */}
      {(dashData?.upcomingVaccinations.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Syringe className="w-4 h-4 text-amber-500" />
            <h3 className="text-base font-semibold text-gray-900">Health alerts</h3>
          </div>
          <div className="space-y-2">
            {dashData!.upcomingVaccinations.map((v) => (
              <Link
                key={v.id}
                to={`/horses/${v.horseId}`}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors hover:shadow-sm ${
                  v.overdue ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                }`}
              >
                <AlertTriangle className={`w-4 h-4 shrink-0 ${v.overdue ? 'text-red-500' : 'text-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 text-sm">{v.horse.name}</span>
                  <span className="text-gray-500 text-sm"> — {v.name ?? 'Vaccination'}</span>
                </div>
                <span className={`text-xs font-medium shrink-0 ${v.overdue ? 'text-red-600' : 'text-amber-600'}`}>
                  {formatRelativeDate(v.dueDate)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Two-column bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Your horses */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Your horses</h3>
            <Link to="/horses" className="text-sm text-brand-600 hover:underline">View all</Link>
          </div>
          {hasNoHorses ? (
            <div className="bg-white rounded-xl border p-6 text-center">
              <div className="text-4xl mb-2">&#x1f40e;</div>
              <p className="text-gray-500 text-sm">No horses yet.</p>
              {user?.role === 'ADMIN' && (
                <Link to="/horses" className="text-brand-600 hover:underline text-sm mt-1 inline-block">Add your first horse</Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {horses.slice(0, 5).map((h) => (
                <Link key={h.id} to={`/horses/${h.id}`} className="bg-white rounded-xl border p-3 hover:shadow-md transition-shadow flex items-center gap-3">
                  {h.photoUrl ? (
                    <img src={h.photoUrl} alt={h.name} className="w-10 h-10 rounded-lg object-cover border shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 border flex items-center justify-center text-gray-300 text-lg shrink-0">&#x1f40e;</div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{h.name}</div>
                    {h.breed && <div className="text-xs text-gray-500 truncate">{h.breed}</div>}
                  </div>
                </Link>
              ))}
              {horses.length > 5 && (
                <Link to="/horses" className="block text-center text-sm text-brand-600 hover:underline pt-1">
                  +{horses.length - 5} more
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900">Recent activity</h3>
          </div>
          {(dashData?.recentSessions.length ?? 0) === 0 ? (
            <div className="bg-white rounded-xl border p-6 text-center">
              <p className="text-gray-500 text-sm">No sessions logged yet.</p>
              {!hasNoHorses && (
                <Link to={`/horses/${horses[0]?.id}/planner`} className="text-brand-600 hover:underline text-sm mt-1 inline-block">
                  Go to planner
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border divide-y">
              {dashData!.recentSessions.map((s) => (
                <Link
                  key={s.id}
                  to={`/horses/${s.horseId}/planner`}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-brand-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{s.horse.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {s.sessionType ?? 'Session'} · {s.slot}
                      {s.durationMinutes ? ` · ${s.durationMinutes}min` : ''}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 shrink-0">{formatActivityDate(s.date)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Team overview (admin only) */}
      {user?.role === 'ADMIN' && users.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">Team</h3>
            </div>
            <Link to="/admin/users" className="text-sm text-brand-600 hover:underline">Manage</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {users.slice(0, 8).map((u) => (
              <div key={u.id} className="bg-white border rounded-lg px-3 py-1.5 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold shrink-0">
                  {(u.name || u.email).charAt(0).toUpperCase()}
                </div>
                <div className="text-sm font-medium text-gray-700 truncate max-w-[120px]">{u.name || u.email}</div>
                <div className="text-xs text-gray-400">{u.role.charAt(0) + u.role.slice(1).toLowerCase()}</div>
              </div>
            ))}
            {users.length > 8 && (
              <Link to="/admin/users" className="bg-white border rounded-lg px-3 py-1.5 text-sm text-brand-600 hover:underline">
                +{users.length - 8} more
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
