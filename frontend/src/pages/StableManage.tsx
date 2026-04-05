import { useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Stable, StableAssignment, HorsePriority, Horse, User, StableMembership } from '../types';
import { Button } from '../components/ui/button';
import Modal from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import { Building2, Users, Star, StarOff, Calendar } from 'lucide-react';

interface Appointment {
  id: string;
  type: 'VET' | 'FARRIER' | 'DENTIST' | 'VACCINATION' | 'OTHER';
  typeOther: string | null;
  scheduledAt: string;
  practitionerName: string | null;
  contactNumber: string | null;
  locationAtStable: boolean;
  locationOther: string | null;
  notes: string | null;
  status: 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
  reminderSent: boolean;
  completedAt: string | null;
  createdAt: string;
  horse: { id: string; name: string };
  createdBy: { id: string; name: string | null };
}

function formatApptDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const APPT_TYPE_BADGE: Record<string, string> = {
  VET: 'bg-blue-100 text-blue-700',
  FARRIER: 'bg-green-100 text-green-700',
  DENTIST: 'bg-purple-100 text-purple-700',
  VACCINATION: 'bg-amber-100 text-amber-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

const APPT_TYPE_LABELS: Record<string, string> = {
  VET: 'Vet', FARRIER: 'Farrier', DENTIST: 'Dentist', VACCINATION: 'Vaccination', OTHER: 'Other',
};

type Tab = 'staff' | 'horses';

type StableWithCount = Stable & { _count?: { horses: number; stableAssignments: number } };

export default function StableManage() {
  const { user } = useAuth();
  const [stables, setStables] = useState<StableWithCount[]>([]);
  const [selectedStableId, setSelectedStableId] = useState<string>('');
  const [tab, setTab] = useState<Tab>('staff');
  const [assignments, setAssignments] = useState<StableAssignment[]>([]);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [priorities, setPriorities] = useState<HorsePriority[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addError, setAddError] = useState('');
  const [pendingMemberships, setPendingMemberships] = useState<StableMembership[]>([]);

  const isAdmin = user?.role === 'ADMIN';
  const [stableAppointments, setStableAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const endpoint = isAdmin ? '/stables' : '/stables/my';
        const data = await api<StableWithCount[]>(endpoint);
        setStables(data);
        if (data.length > 0) setSelectedStableId(data[0].id);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedStableId) return;
    api<Appointment[]>(`/appointments/stable/${selectedStableId}`)
      .then(setStableAppointments)
      .catch(() => setStableAppointments([]));
    api<StableMembership[]>(`/stables/${selectedStableId}/memberships`)
      .then((m) => setPendingMemberships(m.filter((mb) => mb.type === 'REQUESTED')))
      .catch(() => setPendingMemberships([]));
  }, [selectedStableId]);

  const handleApproveMembership = async (userId: string) => {
    try {
      await api(`/stables/${selectedStableId}/memberships/${userId}/approve`, { method: 'POST' });
      toast.success('Membership approved');
      setPendingMemberships((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleRejectMembership = async (userId: string, name: string) => {
    if (!window.confirm(`Decline membership request from ${name}?`)) return;
    try {
      await api(`/stables/${selectedStableId}/memberships/${userId}`, { method: 'DELETE' });
      toast.success('Request declined');
      setPendingMemberships((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  useEffect(() => {
    if (!selectedStableId) return;
    const loadTabData = async () => {
      if (tab === 'staff') {
        const [a, u] = await Promise.all([
          api<StableAssignment[]>(`/stables/${selectedStableId}/assignments`),
          api<User[]>('/users'),
        ]);
        setAssignments(a);
        setAllUsers(u);
      } else {
        const [h, p] = await Promise.all([
          api<Horse[]>('/horses'),
          api<HorsePriority[]>(`/stables/${selectedStableId}/priorities`),
        ]);
        setHorses(h.filter((horse) => horse.stableId === selectedStableId));
        setPriorities(p);
      }
    };
    loadTabData().catch(console.error);
  }, [selectedStableId, tab]);

  const assignedUserIds = new Set(assignments.map((a) => a.userId));
  const eligibleUsers = allUsers.filter(
    (u) => u.role !== 'ADMIN' && u.role !== 'OWNER' && !assignedUserIds.has(u.id)
  );

  const handleAddStaff = async (e: FormEvent) => {
    e.preventDefault();
    setAddError('');
    try {
      await api(`/stables/${selectedStableId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ userId: addUserId }),
      });
      setShowAddStaff(false);
      setAddUserId('');
      toast.success('Staff member added');
      const a = await api<StableAssignment[]>(`/stables/${selectedStableId}/assignments`);
      setAssignments(a);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add staff');
    }
  };

  const handleRemoveStaff = async (assignmentId: string) => {
    await api(`/stables/${selectedStableId}/assignments/${assignmentId}`, { method: 'DELETE' });
    toast.success('Staff member removed');
    setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
  };

  const hasPriority = (horseId: string, userId: string) =>
    priorities.some((p) => p.horseId === horseId && p.userId === userId);

  const togglePriority = async (horseId: string, userId: string) => {
    const existing = priorities.find((p) => p.horseId === horseId && p.userId === userId);
    if (existing) {
      await api(`/horses/${horseId}/priority/${existing.id}`, { method: 'DELETE' });
      setPriorities((prev) => prev.filter((p) => p.id !== existing.id));
      toast.success('Priority removed');
    } else {
      const created = await api<HorsePriority>(`/horses/${horseId}/priority`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      setPriorities((prev) => [...prev, created]);
      toast.success('Priority set');
    }
  };

  const ROLE_LABELS: Record<string, string> = {
    STABLE_LEAD: 'Stable Lead', RIDER: 'Rider', GROOM: 'Groom', TRAINER: 'Trainer',
  };

  const selectedStable = stables.find((s) => s.id === selectedStableId);

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4">
            <Skeleton className="h-6 w-16 mb-1" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );

  if (stables.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">No stable assigned</p>
        <p className="text-sm mt-1">Ask an admin to assign you to a stable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">My Stable</h2>
        {stables.length > 1 && (
          <select
            value={selectedStableId}
            onChange={(e) => setSelectedStableId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            {stables.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* Stable info cards */}
      {selectedStable && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border p-4">
            <div className="text-2xl font-bold text-brand-600">{selectedStable._count?.horses ?? '—'}</div>
            <div className="text-xs text-gray-500 mt-0.5">Horses</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-2xl font-bold text-brand-600">{selectedStable._count?.stableAssignments ?? '—'}</div>
            <div className="text-xs text-gray-500 mt-0.5">Staff</div>
          </div>
          {selectedStable.address && (
            <div className="bg-white rounded-xl border p-4 col-span-2 sm:col-span-1">
              <div className="text-sm font-medium text-gray-700 truncate">{selectedStable.address}</div>
              <div className="text-xs text-gray-500 mt-0.5">Address</div>
            </div>
          )}
        </div>
      )}

      {/* Upcoming appointments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand-600" />
            <h3 className="text-base font-semibold text-gray-900">Upcoming appointments</h3>
          </div>
          <Link to="/appointments" className="text-sm text-brand-600 hover:underline">View all</Link>
        </div>
        <div className="bg-white rounded-xl border divide-y">
          {stableAppointments.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">No upcoming appointments.</div>
          ) : (
            stableAppointments.slice(0, 5).map((appt) => (
              <Link
                key={appt.id}
                to={`/horses/${appt.horse.id}`}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{formatApptDate(appt.scheduledAt)}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${APPT_TYPE_BADGE[appt.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {appt.type === 'OTHER' ? (appt.typeOther ?? 'Other') : APPT_TYPE_LABELS[appt.type]}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 truncate mt-0.5">
                    <span className="font-medium">{appt.horse.name}</span>
                    {appt.practitionerName && <span className="text-gray-400"> · {appt.practitionerName}</span>}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b">
        {(['staff', 'horses'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'staff' ? 'Staff' : 'Horses & Priorities'}
          </button>
        ))}
      </div>

      {/* Pending membership requests */}
      {pendingMemberships.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-xs font-bold">{pendingMemberships.length}</span>
            Pending membership requests
          </h3>
          <div className="space-y-2">
            {pendingMemberships.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-amber-100">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{m.user?.name || m.user?.email}</div>
                  {m.user?.name && <div className="text-xs text-gray-400">{m.user.email}</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={() => handleApproveMembership(m.userId)} className="text-green-700 bg-green-100 hover:bg-green-200 border-0">
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleRejectMembership(m.userId, m.user?.name || m.user?.email || 'this user')}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff tab */}
      {tab === 'staff' && (
        <div className="bg-white rounded-xl border p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" /> Staff members
            </h3>
            <Button size="sm" onClick={() => setShowAddStaff(true)}>Add staff</Button>
          </div>
          {assignments.length === 0 ? (
            <p className="text-sm text-gray-500">No staff assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{a.user?.name || a.user?.email}</div>
                    <div className="text-xs text-gray-400">{ROLE_LABELS[a.user?.role ?? ''] ?? a.user?.role}</div>
                  </div>
                  {a.userId !== user?.id && (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-red-500 hover:text-red-600 shrink-0"
                      onClick={() => handleRemoveStaff(a.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Horses & priorities tab */}
      {tab === 'horses' && (
        <div className="space-y-4">
          {horses.length === 0 ? (
            <p className="text-sm text-gray-500">No horses in this stable.</p>
          ) : horses.map((horse) => (
            <div key={horse.id} className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-3 mb-3">
                {horse.photoUrl ? (
                  <img src={horse.photoUrl} alt={horse.name} className="w-10 h-10 rounded-lg object-cover border shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gray-100 border flex items-center justify-center text-gray-300 text-lg shrink-0">&#x1f40e;</div>
                )}
                <div className="font-semibold text-gray-900">{horse.name}</div>
              </div>
              {assignments.length === 0 ? (
                <p className="text-xs text-gray-400">Add staff first to assign priorities.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assignments.map((a) => {
                    const active = hasPriority(horse.id, a.userId);
                    return (
                      <button
                        key={a.userId}
                        onClick={() => togglePriority(horse.id, a.userId)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          active
                            ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {active
                          ? <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          : <StarOff className="w-3 h-3" />}
                        {a.user?.name || a.user?.email}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add staff modal */}
      <Modal
        open={showAddStaff}
        onClose={() => { setShowAddStaff(false); setAddError(''); }}
        title="Add staff member"
      >
        {addError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{addError}</div>}
        <form onSubmit={handleAddStaff} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Staff member</label>
            {eligibleUsers.length === 0 ? (
              <p className="text-sm text-gray-500">
                No eligible users to add. Invite staff from the Users page first.
              </p>
            ) : (
              <select
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                required
              >
                <option value="">Select a person…</option>
                {eligibleUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email} ({ROLE_LABELS[u.role] ?? u.role})
                  </option>
                ))}
              </select>
            )}
          </div>
          {eligibleUsers.length > 0 && (
            <Button type="submit" className="w-full">Add to stable</Button>
          )}
        </form>
      </Modal>
    </div>
  );
}
