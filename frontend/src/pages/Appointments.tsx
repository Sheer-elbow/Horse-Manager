import { useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Horse } from '../types';
import Modal from '../components/Modal';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Calendar, List, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';

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

function groupByDate(appointments: Appointment[]): { dateLabel: string; items: Appointment[] }[] {
  const groups: Map<string, Appointment[]> = new Map();
  for (const appt of appointments) {
    const d = new Date(appt.scheduledAt);
    const key = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(appt);
  }
  return Array.from(groups.entries()).map(([dateLabel, items]) => ({ dateLabel, items }));
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

type FilterTab = 'upcoming' | 'all';
type ViewMode = 'list' | 'week';

// ─── Week calendar helpers ────────────────────────────────────────────────────

function getWeekStart(offsetWeeks: number): Date {
  const d = new Date();
  // shift to Monday
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

const WEEK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface WeekCalendarProps {
  appointments: Appointment[];
  weekOffset: number;
  onPrev: () => void;
  onNext: () => void;
  onEdit: (a: Appointment) => void;
  onComplete: (a: Appointment) => void;
  onCancel: (a: Appointment) => void;
}

function WeekCalendar({ appointments, weekOffset, onPrev, onNext, onEdit, onComplete, onCancel }: WeekCalendarProps) {
  const weekStart = getWeekStart(weekOffset);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  return (
    <div>
      {/* Week nav */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onPrev}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <span className="text-sm font-semibold text-gray-700 flex-1 text-center">
          {formatWeekRange(weekStart)}
        </span>
        <button
          onClick={onNext}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Next week"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* 7-column grid */}
      <div className="grid grid-cols-7 gap-1 overflow-x-auto">
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const dayAppts = appointments.filter((a) => isSameDay(new Date(a.scheduledAt), day));
          const dateKey = day.toISOString().split('T')[0];
          const expanded = expandedDay === dateKey;

          return (
            <div key={dateKey} className="min-w-0">
              {/* Day header */}
              <button
                onClick={() => setExpandedDay(expanded ? null : dateKey)}
                className={`w-full text-center rounded-lg py-2 mb-1.5 transition-colors ${
                  isToday
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                }`}
              >
                <div className={`text-[10px] font-medium uppercase tracking-wide ${isToday ? 'text-brand-100' : 'text-gray-400'}`}>
                  {WEEK_DAY_LABELS[i]}
                </div>
                <div className={`text-sm font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-900'}`}>
                  {day.getDate()}
                </div>
                {dayAppts.length > 0 && (
                  <div className={`text-[10px] font-medium mt-0.5 ${isToday ? 'text-brand-100' : 'text-brand-600'}`}>
                    {dayAppts.length}
                  </div>
                )}
              </button>

              {/* Appointment chips */}
              <div className="space-y-1">
                {dayAppts.slice(0, expanded ? undefined : 2).map((appt) => (
                  <div
                    key={appt.id}
                    className={`rounded px-1.5 py-1 text-[10px] leading-tight cursor-pointer group ${
                      APPT_TYPE_BADGE[appt.type] ?? 'bg-gray-100 text-gray-600'
                    } ${appt.status !== 'UPCOMING' ? 'opacity-50' : ''}`}
                    title={`${appt.horse.name} · ${APPT_TYPE_LABELS[appt.type]}${appt.practitionerName ? ` · ${appt.practitionerName}` : ''}`}
                  >
                    <div className="font-medium truncate">{appt.horse.name}</div>
                    <div className="truncate opacity-75">
                      {new Date(appt.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {' '}{appt.type === 'OTHER' ? (appt.typeOther ?? 'Other') : APPT_TYPE_LABELS[appt.type]}
                    </div>
                    {appt.status === 'UPCOMING' && (
                      <div className="hidden group-hover:flex gap-1 mt-1 flex-wrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); onComplete(appt); }}
                          className="text-green-700 hover:underline font-semibold"
                        >
                          Done
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(appt); }}
                          className="text-gray-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onCancel(appt); }}
                          className="text-red-600 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {!expanded && dayAppts.length > 2 && (
                  <button
                    onClick={() => setExpandedDay(dateKey)}
                    className="w-full text-[10px] text-gray-400 hover:text-gray-600 text-center py-0.5"
                  >
                    +{dayAppts.length - 2} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('upcoming');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [weekOffset, setWeekOffset] = useState(0);

  // Horse selector for Add
  const [horses, setHorses] = useState<Horse[]>([]);
  const [showHorseSelector, setShowHorseSelector] = useState(false);
  const [selectedHorseIds, setSelectedHorseIds] = useState<string[]>([]);

  // Add / Edit appointment form
  const [showApptForm, setShowApptForm] = useState(false);
  const [editingApptId, setEditingApptId] = useState<string | null>(null);
  const [formHorseIds, setFormHorseIds] = useState<string[]>([]);
  const [apptForm, setApptForm] = useState({
    type: 'VET',
    typeOther: '',
    scheduledDate: '',
    scheduledTime: '09:00',
    practitionerName: '',
    contactNumber: '',
    locationAtStable: true,
    locationOther: '',
    notes: '',
  });
  const [apptError, setApptError] = useState('');

  // Complete appointment
  const [showCompleteAppt, setShowCompleteAppt] = useState(false);
  const [completingAppt, setCompletingAppt] = useState<Appointment | null>(null);
  const [completeForm, setCompleteForm] = useState({
    notes: '',
    vetName: '',
    visitReason: '',
    visitReasonOther: '',
    farrierName: '',
    dentistName: '',
    name: '',
    dueDate: '',
    amount: '',
    category: '',
  });

  // Cancel confirmation
  const [cancelApptTarget, setCancelApptTarget] = useState<Appointment | null>(null);

  const loadAppointments = async () => {
    try {
      const data = await api<Appointment[]>('/appointments/upcoming');
      setAppointments(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  const loadHorses = async () => {
    try {
      const data = await api<Horse[]>('/horses');
      setHorses(data);
    } catch {
      /* ignore */
    }
  };

  const handleAddClick = async () => {
    await loadHorses();
    setSelectedHorseIds([]);
    setShowHorseSelector(true);
  };

  const toggleHorseSelection = (id: string) => {
    setSelectedHorseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleHorseSelected = () => {
    if (selectedHorseIds.length === 0) return;
    setFormHorseIds(selectedHorseIds);
    setShowHorseSelector(false);
    setEditingApptId(null);
    setApptForm({
      type: 'VET',
      typeOther: '',
      scheduledDate: '',
      scheduledTime: '09:00',
      practitionerName: '',
      contactNumber: '',
      locationAtStable: true,
      locationOther: '',
      notes: '',
    });
    setApptError('');
    setShowApptForm(true);
  };

  const handleApptSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApptError('');
    try {
      const scheduledAt = new Date(`${apptForm.scheduledDate}T${apptForm.scheduledTime}`).toISOString();
      const body: Record<string, unknown> = {
        type: apptForm.type,
        scheduledAt,
        practitionerName: apptForm.practitionerName || null,
        contactNumber: apptForm.contactNumber || null,
        locationAtStable: apptForm.locationAtStable,
        locationOther: apptForm.locationAtStable ? null : (apptForm.locationOther || null),
        notes: apptForm.notes || null,
      };
      if (apptForm.type === 'OTHER') body.typeOther = apptForm.typeOther || null;
      if (editingApptId) {
        await api(`/appointments/${editingApptId}`, { method: 'PUT', body: JSON.stringify(body) });
        toast.success('Appointment updated');
      } else {
        await Promise.all(
          formHorseIds.map((hId) =>
            api(`/appointments/horse/${hId}`, { method: 'POST', body: JSON.stringify(body) })
          )
        );
        toast.success(formHorseIds.length > 1 ? `${formHorseIds.length} appointments added` : 'Appointment added');
      }
      setShowApptForm(false);
      setEditingApptId(null);
      loadAppointments();
    } catch (err: unknown) {
      setApptError(err instanceof Error ? err.message : 'Failed to save appointment');
    }
  };

  const openEditAppt = (appt: Appointment) => {
    const d = new Date(appt.scheduledAt);
    setFormHorseIds([appt.horse.id]);
    setEditingApptId(appt.id);
    setApptForm({
      type: appt.type,
      typeOther: appt.typeOther || '',
      scheduledDate: d.toISOString().split('T')[0],
      scheduledTime: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      practitionerName: appt.practitionerName || '',
      contactNumber: appt.contactNumber || '',
      locationAtStable: appt.locationAtStable,
      locationOther: appt.locationOther || '',
      notes: appt.notes || '',
    });
    setApptError('');
    setShowApptForm(true);
  };

  const openCompleteAppt = (appt: Appointment) => {
    setCompletingAppt(appt);
    setCompleteForm({
      notes: appt.notes || '',
      vetName: appt.practitionerName || '',
      visitReason: '',
      visitReasonOther: '',
      farrierName: appt.practitionerName || '',
      dentistName: appt.practitionerName || '',
      name: appt.typeOther || '',
      dueDate: '',
      amount: '',
      category: appt.typeOther || '',
    });
    setShowCompleteAppt(true);
  };

  const handleCompleteAppt = async (e: FormEvent) => {
    e.preventDefault();
    if (!completingAppt) return;
    try {
      const body: Record<string, unknown> = { notes: completeForm.notes || null };
      if (completingAppt.type === 'VET') {
        body.vetName = completeForm.vetName || null;
        const reason = completeForm.visitReason === 'Other' ? completeForm.visitReasonOther : completeForm.visitReason;
        body.visitReason = reason || null;
      }
      if (completingAppt.type === 'FARRIER') body.farrierName = completeForm.farrierName || null;
      if (completingAppt.type === 'DENTIST') body.dentistName = completeForm.dentistName || null;
      if (completingAppt.type === 'VACCINATION') {
        body.name = completeForm.name || null;
        body.dueDate = completeForm.dueDate || null;
      }
      if (completingAppt.type === 'OTHER') {
        body.category = completeForm.category || null;
        body.amount = completeForm.amount ? parseFloat(completeForm.amount) : null;
      }
      await api(`/appointments/${completingAppt.id}/complete`, { method: 'POST', body: JSON.stringify(body) });
      toast.success('Appointment completed and record saved');
      setShowCompleteAppt(false);
      setCompletingAppt(null);
      loadAppointments();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete appointment');
    }
  };

  const handleCancelAppt = (appt: Appointment) => {
    setCancelApptTarget(appt);
  };

  const confirmCancelAppt = async () => {
    if (!cancelApptTarget) return;
    try {
      await api(`/appointments/${cancelApptTarget.id}/cancel`, { method: 'POST' });
      toast.success('Appointment cancelled');
      setCancelApptTarget(null);
      loadAppointments();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel appointment');
    }
  };

  const displayed = filterTab === 'upcoming'
    ? appointments.filter((a) => a.status === 'UPCOMING').sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    : [...appointments].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const groups = groupByDate(displayed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Appointments</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage upcoming health and care appointments</p>
        </div>
        <Button size="sm" onClick={handleAddClick}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add appointment
        </Button>
      </div>

      {/* Filter tabs + view toggle */}
      <div className="flex items-center justify-between border-b">
        <div className="flex gap-0.5">
          {(['upcoming', 'all'] as FilterTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilterTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                filterTab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'upcoming' ? 'Upcoming' : 'All'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 pb-1">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
            aria-label="List view"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'week' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
            aria-label="Week calendar view"
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-4 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      ) : viewMode === 'week' ? (
        <div className="bg-white rounded-xl border p-4">
          <WeekCalendar
            appointments={appointments}
            weekOffset={weekOffset}
            onPrev={() => setWeekOffset((w) => w - 1)}
            onNext={() => setWeekOffset((w) => w + 1)}
            onEdit={openEditAppt}
            onComplete={openCompleteAppt}
            onCancel={handleCancelAppt}
          />
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center">
          <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No appointments found</p>
          <p className="text-sm text-gray-400 mt-1">Add an appointment for a horse to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ dateLabel, items }) => (
            <div key={dateLabel}>
              <h3 className="text-sm font-semibold text-gray-500 mb-2">{dateLabel}</h3>
              <div className="bg-white rounded-xl border divide-y">
                {items.map((appt) => (
                  <div key={appt.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{formatApptDate(appt.scheduledAt)}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${APPT_TYPE_BADGE[appt.type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {appt.type === 'OTHER' ? (appt.typeOther ?? 'Other') : APPT_TYPE_LABELS[appt.type]}
                        </span>
                        {appt.status !== 'UPCOMING' && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${appt.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {appt.status === 'COMPLETED' ? 'Done' : 'Cancelled'}
                          </span>
                        )}
                      </div>
                      <div className="mt-1">
                        <Link to={`/horses/${appt.horse.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                          {appt.horse.name}
                        </Link>
                        {appt.practitionerName && (
                          <span className="text-sm text-gray-500"> · {appt.practitionerName}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {appt.locationAtStable ? 'At stable' : (appt.locationOther ?? 'Other location')}
                      </div>
                      {appt.notes && (
                        <div className="text-xs text-gray-500 mt-1 truncate max-w-sm">{appt.notes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {appt.status === 'UPCOMING' && (
                        <Button variant="link" size="sm" className="text-green-600 hover:text-green-700 text-xs" onClick={() => openCompleteAppt(appt)}>
                          Mark done
                        </Button>
                      )}
                      <Button variant="link" size="sm" className="text-gray-500 hover:text-gray-700 text-xs" onClick={() => openEditAppt(appt)}>
                        Edit
                      </Button>
                      {appt.status === 'UPCOMING' && (
                        <Button variant="link" size="sm" className="text-red-500 hover:text-red-600 text-xs" onClick={() => handleCancelAppt(appt)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Horse selector modal */}
      <Modal
        open={showHorseSelector}
        onClose={() => setShowHorseSelector(false)}
        title="Select horses"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Select one or more horses for this appointment.</p>
          <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
            {horses.map((h) => (
              <label key={h.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedHorseIds.includes(h.id)}
                  onChange={() => toggleHorseSelection(h.id)}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-800">{h.name}</span>
              </label>
            ))}
          </div>
          {selectedHorseIds.length > 0 && (
            <p className="text-xs text-gray-500">{selectedHorseIds.length} horse{selectedHorseIds.length > 1 ? 's' : ''} selected</p>
          )}
          <Button className="w-full" onClick={handleHorseSelected} disabled={selectedHorseIds.length === 0}>
            Continue
          </Button>
        </div>
      </Modal>

      {/* Add / Edit appointment modal */}
      <Modal
        open={showApptForm}
        onClose={() => { setShowApptForm(false); setEditingApptId(null); setApptError(''); }}
        title={editingApptId ? 'Edit appointment' : formHorseIds.length > 1 ? `Add appointment for ${formHorseIds.length} horses` : 'Add appointment'}
      >
        {apptError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{apptError}</div>}
        <form onSubmit={handleApptSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={apptForm.type}
              onChange={(e) => setApptForm({ ...apptForm, type: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              required
            >
              <option value="VET">Vet</option>
              <option value="FARRIER">Farrier</option>
              <option value="DENTIST">Dentist</option>
              <option value="VACCINATION">Vaccination</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          {apptForm.type === 'OTHER' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Appointment description</label>
              <input
                value={apptForm.typeOther}
                onChange={(e) => setApptForm({ ...apptForm, typeOther: e.target.value })}
                placeholder="Describe the appointment"
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={apptForm.scheduledDate}
                onChange={(e) => setApptForm({ ...apptForm, scheduledDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input
                type="time"
                value={apptForm.scheduledTime}
                onChange={(e) => setApptForm({ ...apptForm, scheduledTime: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Practitioner name</label>
            <input
              value={apptForm.practitionerName}
              onChange={(e) => setApptForm({ ...apptForm, practitionerName: e.target.value })}
              placeholder="e.g. Dr. Smith"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact number</label>
            <input
              value={apptForm.contactNumber}
              onChange={(e) => setApptForm({ ...apptForm, contactNumber: e.target.value })}
              placeholder="e.g. 07700 900000"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="apptLocationPage"
                  checked={apptForm.locationAtStable}
                  onChange={() => setApptForm({ ...apptForm, locationAtStable: true, locationOther: '' })}
                />
                At stable
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="apptLocationPage"
                  checked={!apptForm.locationAtStable}
                  onChange={() => setApptForm({ ...apptForm, locationAtStable: false })}
                />
                Other location
              </label>
            </div>
          </div>
          {!apptForm.locationAtStable && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location details</label>
              <input
                value={apptForm.locationOther}
                onChange={(e) => setApptForm({ ...apptForm, locationOther: e.target.value })}
                placeholder="e.g. Equine clinic, 10 High Street"
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={apptForm.notes}
              onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              rows={3}
            />
          </div>
          <Button type="submit" className="w-full">
            {editingApptId ? 'Save changes' : 'Add appointment'}
          </Button>
        </form>
      </Modal>

      {/* Complete appointment modal */}
      <Modal
        open={showCompleteAppt}
        onClose={() => { setShowCompleteAppt(false); setCompletingAppt(null); }}
        title="Mark appointment as done"
      >
        {completingAppt && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{formatApptDate(completingAppt.scheduledAt)}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${APPT_TYPE_BADGE[completingAppt.type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {completingAppt.type === 'OTHER' ? (completingAppt.typeOther ?? 'Other') : APPT_TYPE_LABELS[completingAppt.type]}
                </span>
              </div>
              <div className="text-gray-600">
                <Link to={`/horses/${completingAppt.horse.id}`} className="font-medium text-brand-600 hover:underline">
                  {completingAppt.horse.name}
                </Link>
                {completingAppt.practitionerName && <span className="text-gray-500"> · {completingAppt.practitionerName}</span>}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Health record details</h4>
              <form onSubmit={handleCompleteAppt} className="space-y-3">
                {completingAppt.type === 'VET' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vet / Practice</label>
                      <input
                        value={completeForm.vetName}
                        onChange={(e) => setCompleteForm({ ...completeForm, vetName: e.target.value })}
                        placeholder="e.g. Dr. Smith – ABC Veterinary"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reason for visit</label>
                      <select
                        value={completeForm.visitReason}
                        onChange={(e) => setCompleteForm({ ...completeForm, visitReason: e.target.value, visitReasonOther: '' })}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">— Select —</option>
                        <option>Routine check-up</option>
                        <option>Lameness investigation</option>
                        <option>Colic</option>
                        <option>Injury / wound</option>
                        <option>Respiratory issue</option>
                        <option>Eye issue</option>
                        <option>Pre-purchase examination</option>
                        <option>Emergency</option>
                        <option>Other</option>
                      </select>
                    </div>
                    {completeForm.visitReason === 'Other' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Describe reason</label>
                        <input
                          value={completeForm.visitReasonOther}
                          onChange={(e) => setCompleteForm({ ...completeForm, visitReasonOther: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                  </>
                )}
                {completingAppt.type === 'FARRIER' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Farrier name</label>
                    <input
                      value={completeForm.farrierName}
                      onChange={(e) => setCompleteForm({ ...completeForm, farrierName: e.target.value })}
                      placeholder="e.g. John Smith"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {completingAppt.type === 'DENTIST' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dentist name</label>
                    <input
                      value={completeForm.dentistName}
                      onChange={(e) => setCompleteForm({ ...completeForm, dentistName: e.target.value })}
                      placeholder="e.g. Jane Doe"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {completingAppt.type === 'VACCINATION' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vaccine name</label>
                      <input
                        value={completeForm.name}
                        onChange={(e) => setCompleteForm({ ...completeForm, name: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Next due date</label>
                      <input
                        type="date"
                        value={completeForm.dueDate}
                        onChange={(e) => setCompleteForm({ ...completeForm, dueDate: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}
                {completingAppt.type === 'OTHER' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <input
                        value={completeForm.category}
                        onChange={(e) => setCompleteForm({ ...completeForm, category: e.target.value })}
                        placeholder="e.g. Physiotherapy"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={completeForm.amount}
                        onChange={(e) => setCompleteForm({ ...completeForm, amount: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={completeForm.notes}
                    onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>
                <Button type="submit" className="w-full">Mark as done &amp; save record</Button>
              </form>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel appointment confirmation modal */}
      <Modal
        open={!!cancelApptTarget}
        onClose={() => setCancelApptTarget(null)}
        title="Cancel appointment"
      >
        <p className="text-sm text-gray-600 mb-4">
          Cancel the <strong>{cancelApptTarget ? APPT_TYPE_LABELS[cancelApptTarget.type] : ''}</strong> appointment on{' '}
          <strong>{cancelApptTarget ? formatApptDate(cancelApptTarget.scheduledAt) : ''}</strong>?
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setCancelApptTarget(null)}>Keep</Button>
          <Button variant="destructive" onClick={confirmCancelAppt}>Cancel appointment</Button>
        </div>
      </Modal>
    </div>
  );
}
