import { useEffect, useState, useRef, FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../api/client';
import { Horse, User, AppliedPlan, PlanShare, Stable } from '../types';
import Modal from '../components/Modal';
import { Button } from '../components/ui/button';
import { AuthenticatedImage } from '../components/AuthenticatedImage';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Calendar, Repeat, Share2, Trash2, Plus, Stethoscope, Scissors, Syringe, AlertTriangle } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import TrainingLoadChart from '../components/TrainingLoadChart';
import DocumentVault from '../components/DocumentVault';
import HealthTimeline from '../components/HealthTimeline';
import { toast } from 'sonner';

interface HealthSummary {
  lastVetDate: string | null;
  lastFarrierDate: string | null;
  overdueVaccinations: { id: string; name: string | null; dueDate: string }[];
  dueSoonVaccinations: { id: string; name: string | null; dueDate: string }[];
  overdueVet: { id: string; dueDate: string }[];
  dueSoonVet: { id: string; dueDate: string }[];
  overdueFarrier: { id: string; dueDate: string }[];
  dueSoonFarrier: { id: string; dueDate: string }[];
  overdueDentist: { id: string; dueDate: string }[];
  dueSoonDentist: { id: string; dueDate: string }[];
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

type Tab = 'overview' | 'vet' | 'farrier' | 'dentist' | 'vaccinations' | 'expenses' | 'programmes' | 'appointments' | 'documents' | 'timeline';

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

const APPT_TYPE_LABELS: Record<string, string> = {
  VET: 'Vet', FARRIER: 'Farrier', DENTIST: 'Dentist', VACCINATION: 'Vaccination', OTHER: 'Other',
};

function ApptTypeBadge({ type, label }: { type: string; label?: string }) {
  const classes: Record<string, string> = {
    VET: 'bg-blue-100 text-blue-700',
    FARRIER: 'bg-green-100 text-green-700',
    DENTIST: 'bg-purple-100 text-purple-700',
    VACCINATION: 'bg-amber-100 text-amber-700',
    OTHER: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {label ?? APPT_TYPE_LABELS[type] ?? type}
    </span>
  );
}

interface HealthRecord {
  id: string;
  date: string;
  notes: string | null;
  // vet
  vetName?: string | null;
  visitReason?: string | null;
  // farrier
  farrierName?: string | null;
  // dentist
  dentistName?: string | null;
  // vaccination
  name?: string | null;
  dueDate?: string | null;
  // expense
  category?: string | null;
  amount?: number | null;
  fileUrl?: string | null;
  fileName?: string | null;
}


function PriorityPanel({ horseId }: { horseId: string }) {
  const [priorities, setPriorities] = useState<{ id: string; user: { id: string; name: string | null; email: string; role: string } }[]>([]);

  useEffect(() => {
    api<typeof priorities>(`/horses/${horseId}/priority`).then(setPriorities).catch(() => {});
  }, [horseId]);

  if (priorities.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border p-4 sm:p-5">
      <h3 className="font-semibold text-sm sm:text-base mb-3">Priority care staff</h3>
      <div className="flex flex-wrap gap-2">
        {priorities.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            ★ {p.user.name || p.user.email}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HorseProfile() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [horse, setHorse] = useState<Horse | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', age: '', breed: '', stableId: '', stableLocation: '', ownerNotes: '', identifyingInfo: '' });
  const [stables, setStables] = useState<Stable[]>([]);

  // Assignment modal
  const [showAssign, setShowAssign] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignPerm, setAssignPerm] = useState<'VIEW' | 'EDIT'>('VIEW');

  // Photo upload
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  // Add record modal
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [recForm, setRecForm] = useState({ date: '', notes: '', name: '', dueDate: '', amount: '', vetName: '', visitReason: '', visitReasonOther: '', farrierName: '', dentistName: '', category: '' });
  const recFileRef = useRef<HTMLInputElement>(null);
  const [recError, setRecError] = useState('');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  // Applied plans (programmes tab)
  const [appliedPlans, setAppliedPlans] = useState<AppliedPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);

  // Repeat modal
  const [showRepeat, setShowRepeat] = useState(false);
  const [repeatPlanId, setRepeatPlanId] = useState<string | null>(null);
  const [repeatForm, setRepeatForm] = useState({ mode: 'original' as 'original' | 'amended', startDate: '' });
  const [repeatError, setRepeatError] = useState('');
  const [repeatLoading, setRepeatLoading] = useState(false);

  // Share modal
  const [showShare, setShowShare] = useState(false);
  const [sharePlanId, setSharePlanId] = useState<string | null>(null);
  const [sharePlanAssignerId, setSharePlanAssignerId] = useState<string | null>(null);
  const [shares, setShares] = useState<PlanShare[]>([]);
  const [shareUsers, setShareUsers] = useState<User[]>([]);
  const [shareForm, setShareForm] = useState({ userId: '', permission: 'VIEW' as 'VIEW' | 'EDIT' });
  const [shareError, setShareError] = useState('');

  // Delete confirmation
  const [deleteHorseConfirm, setDeleteHorseConfirm] = useState(false);
  const [removePlanTarget, setRemovePlanTarget] = useState<string | null>(null);
  const [deleteRecordTarget, setDeleteRecordTarget] = useState<{ id: string; label: string } | null>(null);
  const [removeAssignmentTarget, setRemoveAssignmentTarget] = useState<{ id: string; name: string } | null>(null);

  // Health summary (for overview tab status card)
  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);
  const [nextAppointment, setNextAppointment] = useState<Appointment | null | undefined>(undefined); // undefined = loading

  // Appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showApptForm, setShowApptForm] = useState(false);
  const [editingApptId, setEditingApptId] = useState<string | null>(null);
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
  const [showPastAppts, setShowPastAppts] = useState(false);
  const [cancelApptTarget, setCancelApptTarget] = useState<Appointment | null>(null);

  // Quick-log FAB modal
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [quickLogForm, setQuickLogForm] = useState({
    date: new Date().toISOString().split('T')[0],
    slot: 'AM' as 'AM' | 'PM',
    sessionType: '',
    durationMinutes: '',
    intensityRpe: '',
    rider: '',
    notes: '',
  });
  const [quickLogError, setQuickLogError] = useState('');
  const [quickLogLoading, setQuickLogLoading] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const canEdit = isAdmin || horse?._permission === 'EDIT';
  const isOwner = isAdmin || horse?._accessType === 'OWNER_EDIT';
  const isStableStaff = horse?._accessType === 'LEAD_VIEW' || horse?._accessType === 'STAFF_VIEW';
  const canViewExpenses = isOwner;
  const canViewHealthFull = !isStableStaff || horse?._isPriority;

  const loadHorse = async () => {
    try {
      const [h, s] = await Promise.all([
        api<Horse>(`/horses/${id}`),
        api<Stable[]>('/stables'),
      ]);
      setHorse(h);
      setStables(s);
      setEditForm({
        name: h.name,
        age: h.age?.toString() || '',
        breed: h.breed || '',
        stableId: h.stableId || '',
        stableLocation: h.stableLocation || '',
        ownerNotes: h.ownerNotes || '',
        identifyingInfo: h.identifyingInfo || '',
      });
    } catch { navigate('/horses'); }
    finally { setLoading(false); }
  };

  const activeRecordTab = useRef<Tab>('overview');

  const loadRecords = async (t: Tab) => {
    if (t === 'overview') return;
    activeRecordTab.current = t;
    setRecords([]);
    const endpoint = t === 'vet' ? 'vet-visits' : t === 'farrier' ? 'farrier-visits' : t === 'dentist' ? 'dentist-visits' : t;
    try {
      const data = await api<HealthRecord[]>(`/health/${id}/${endpoint}`);
      if (activeRecordTab.current === t) setRecords(data);
    } catch {
      // records already cleared
    }
  };

  const loadHealthSummary = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const thirtyDaysOut = new Date(today);
      thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

      type VisitRecord = { id: string; date: string; dueDate: string | null };
      const [vets, farriers, dentists, vaccinations] = await Promise.all([
        api<VisitRecord[]>(`/health/${id}/vet-visits`),
        api<VisitRecord[]>(`/health/${id}/farrier-visits`),
        api<VisitRecord[]>(`/health/${id}/dentist-visits`),
        api<{ id: string; name: string | null; dueDate: string | null }[]>(`/health/${id}/vaccinations`),
      ]);

      const overdue = (list: VisitRecord[]) => list.filter((r) => r.dueDate && new Date(r.dueDate) < today).map((r) => ({ id: r.id, dueDate: r.dueDate! }));
      const dueSoon = (list: VisitRecord[]) => list.filter((r) => r.dueDate && new Date(r.dueDate) >= today && new Date(r.dueDate) <= thirtyDaysOut).map((r) => ({ id: r.id, dueDate: r.dueDate! }));

      const overdueVaccinations = vaccinations
        .filter((v) => v.dueDate && new Date(v.dueDate) < today)
        .map((v) => ({ id: v.id, name: v.name, dueDate: v.dueDate! }));

      const dueSoonVaccinations = vaccinations
        .filter((v) => v.dueDate && new Date(v.dueDate) >= today && new Date(v.dueDate) <= thirtyDaysOut)
        .map((v) => ({ id: v.id, name: v.name, dueDate: v.dueDate! }));

      setHealthSummary({
        lastVetDate: vets.length > 0 ? vets[0].date : null,
        lastFarrierDate: farriers.length > 0 ? farriers[0].date : null,
        overdueVaccinations,
        dueSoonVaccinations,
        overdueVet: overdue(vets),
        dueSoonVet: dueSoon(vets),
        overdueFarrier: overdue(farriers),
        dueSoonFarrier: dueSoon(farriers),
        overdueDentist: overdue(dentists),
        dueSoonDentist: dueSoon(dentists),
      });
    } catch {
      // non-critical, ignore
    }
  };

  const loadAppointments = async () => {
    try {
      const data = await api<Appointment[]>(`/appointments/horse/${id}`);
      setAppointments(data);
    } catch { /* ignore */ }
  };

  const loadNextAppointment = async () => {
    try {
      const data = await api<Appointment[]>(`/appointments/horse/${id}?status=UPCOMING`);
      setNextAppointment(data.length > 0 ? data[0] : null);
    } catch {
      setNextAppointment(null);
    }
  };

  useEffect(() => { loadHorse(); }, [id]);
  useEffect(() => { loadRecords(tab); }, [tab, id]);
  useEffect(() => { if (id) loadHealthSummary(); }, [id]);
  useEffect(() => { if (id) loadNextAppointment(); }, [id]);
  useEffect(() => { if (tab === 'appointments') loadAppointments(); }, [tab, id]);

  const handleEditHorse = async (e: FormEvent) => {
    e.preventDefault();
    await api(`/horses/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: editForm.name,
        age: editForm.age ? parseInt(editForm.age) : null,
        breed: editForm.breed || null,
        stableId: editForm.stableId || null,
        stableLocation: editForm.stableLocation || null,
        ownerNotes: editForm.ownerNotes || null,
        identifyingInfo: editForm.identifyingInfo || null,
      }),
    });
    setEditing(false);
    toast.success('Horse updated');
    loadHorse();
  };

  const handleDelete = async () => {
    setDeleteHorseConfirm(true);
  };

  const confirmDeleteHorse = async () => {
    await api(`/horses/${id}`, { method: 'DELETE' });
    toast.success('Horse deleted');
    navigate('/horses');
  };

  const openAssign = async () => {
    const users = await api<User[]>('/users');
    setAllUsers(users);
    setShowAssign(true);
  };

  const handleAssign = async (e: FormEvent) => {
    e.preventDefault();
    await api(`/horses/${id}/assignments`, {
      method: 'POST',
      body: JSON.stringify({ userId: assignUserId, permission: assignPerm }),
    });
    setShowAssign(false);
    toast.success('User assigned');
    loadHorse();
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    const assignment = horse?.assignments?.find((a) => a.id === assignmentId);
    const name = assignment?.user?.name || assignment?.user?.email || 'this user';
    setRemoveAssignmentTarget({ id: assignmentId, name });
  };

  const confirmRemoveAssignment = async () => {
    if (!removeAssignmentTarget) return;
    await api(`/horses/${id}/assignments/${removeAssignmentTarget.id}`, { method: 'DELETE' });
    toast.success('Assignment removed');
    setRemoveAssignmentTarget(null);
    loadHorse();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError('');
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      await api(`/horses/${id}/photo`, { method: 'POST', body: formData });
      toast.success('Photo updated');
      loadHorse();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setPhotoError(msg);
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    await api(`/horses/${id}/photo`, { method: 'DELETE' });
    toast.success('Photo removed');
    loadHorse();
  };

  const handleAddRecord = async (e: FormEvent) => {
    e.preventDefault();
    setRecError('');
    const endpoint = tab === 'vet' ? 'vet-visits' : tab === 'farrier' ? 'farrier-visits' : tab === 'dentist' ? 'dentist-visits' : tab;
    try {
      const formData = new FormData();
      formData.append('date', recForm.date);
      if (recForm.notes) formData.append('notes', recForm.notes);
      if (tab === 'vet') {
        if (recForm.vetName) formData.append('vetName', recForm.vetName);
        const reason = recForm.visitReason === 'Other' ? recForm.visitReasonOther : recForm.visitReason;
        if (reason) formData.append('visitReason', reason);
        if (recForm.dueDate) formData.append('dueDate', recForm.dueDate);
      }
      if (tab === 'farrier') {
        if (recForm.farrierName) formData.append('farrierName', recForm.farrierName);
        if (recForm.dueDate) formData.append('dueDate', recForm.dueDate);
      }
      if (tab === 'dentist') {
        if (recForm.dentistName) formData.append('dentistName', recForm.dentistName);
        if (recForm.dueDate) formData.append('dueDate', recForm.dueDate);
      }
      if (tab === 'vaccinations') {
        if (recForm.name) formData.append('name', recForm.name);
        if (recForm.dueDate) formData.append('dueDate', recForm.dueDate);
      }
      if (tab === 'expenses') {
        if (recForm.category) formData.append('category', recForm.category);
        if (recForm.amount) formData.append('amount', recForm.amount);
      }
      const file = recFileRef.current?.files?.[0];
      if (file) formData.append('file', file);
      const url = editingRecordId
        ? `/health/${id}/${endpoint}/${editingRecordId}`
        : `/health/${id}/${endpoint}`;
      await api(url, { method: editingRecordId ? 'PUT' : 'POST', body: formData });
      setShowAddRecord(false);
      setEditingRecordId(null);
      setRecForm({ date: '', notes: '', name: '', dueDate: '', amount: '', vetName: '', visitReason: '', visitReasonOther: '', farrierName: '', dentistName: '', category: '' });
      if (recFileRef.current) recFileRef.current.value = '';
      toast.success(editingRecordId ? 'Record updated' : 'Record added');
      loadRecords(tab);
    } catch (err: unknown) {
      setRecError(err instanceof Error ? err.message : 'Failed to add record');
    }
  };

  const handleEditRecord = (r: HealthRecord) => {
    const VET_REASONS = ['Routine check-up', 'Lameness investigation', 'Colic', 'Injury / wound', 'Respiratory issue', 'Eye issue', 'Pre-purchase examination', 'Emergency'];
    const isPreset = r.visitReason && VET_REASONS.includes(r.visitReason);
    setEditingRecordId(r.id);
    setRecForm({
      date: r.date ? r.date.split('T')[0] : '',
      notes: r.notes || '',
      name: r.name || '',
      dueDate: r.dueDate ? r.dueDate.split('T')[0] : '',
      amount: r.amount != null ? String(r.amount) : '',
      vetName: r.vetName || '',
      visitReason: isPreset ? (r.visitReason || '') : (r.visitReason ? 'Other' : ''),
      visitReasonOther: isPreset ? '' : (r.visitReason || ''),
      farrierName: r.farrierName || '',
      dentistName: r.dentistName || '',
      category: r.category || '',
    });
    setRecError('');
    setShowAddRecord(true);
  };

  const handleDeleteRecord = (recordId: string) => {
    const record = records.find((r) => r.id === recordId);
    const label = record?.name || new Date(record?.date || '').toLocaleDateString('en-GB') || 'this record';
    setDeleteRecordTarget({ id: recordId, label });
  };

  const confirmDeleteRecord = async () => {
    if (!deleteRecordTarget) return;
    const endpoint = tab === 'vet' ? 'vet-visits' : tab === 'farrier' ? 'farrier-visits' : tab === 'dentist' ? 'dentist-visits' : tab;
    await api(`/health/${id}/${endpoint}/${deleteRecordTarget.id}`, { method: 'DELETE' });
    toast.success('Record deleted');
    setDeleteRecordTarget(null);
    loadRecords(tab);
  };

  // ─── Applied plans (programmes tab) ─────────────────────────

  const loadAppliedPlans = async () => {
    setPlansLoading(true);
    try {
      const plans = await api<AppliedPlan[]>(`/applied-plans?horseId=${id}`);
      setAppliedPlans(plans);
    } catch { /* ignore */ }
    finally { setPlansLoading(false); }
  };

  useEffect(() => {
    if (tab === 'programmes') loadAppliedPlans();
  }, [tab, id]);

  const openRepeat = (planId: string) => {
    setRepeatPlanId(planId);
    const nextMon = new Date();
    const day = nextMon.getDay();
    const diff = day === 0 ? 1 : (8 - day);
    nextMon.setDate(nextMon.getDate() + diff);
    setRepeatForm({ mode: 'original', startDate: nextMon.toISOString().split('T')[0] });
    setRepeatError('');
    setShowRepeat(true);
  };

  const handleRepeat = async (e: FormEvent) => {
    e.preventDefault();
    if (!repeatPlanId) return;
    setRepeatLoading(true);
    setRepeatError('');
    try {
      await api(`/applied-plans/${repeatPlanId}/repeat`, {
        method: 'POST',
        body: JSON.stringify({ mode: repeatForm.mode, startDate: repeatForm.startDate }),
      });
      setShowRepeat(false);
      toast.success('Programme repeated');
      loadAppliedPlans();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'conflictDates' in (err.body as Record<string, unknown>)) {
        const body = err.body as { conflictDates: string[] };
        setRepeatError(`Date conflicts: ${body.conflictDates.join(', ')}`);
      } else {
        setRepeatError(err instanceof Error ? err.message : 'Repeat failed');
      }
    } finally {
      setRepeatLoading(false);
    }
  };

  const openShare = async (planId: string, assignerId: string) => {
    setSharePlanId(planId);
    setSharePlanAssignerId(assignerId);
    setShareForm({ userId: '', permission: 'VIEW' });
    setShareError('');
    setShowShare(true);
    const [s, u] = await Promise.all([
      api<PlanShare[]>(`/applied-plans/${planId}/shares`),
      api<User[]>('/users'),
    ]);
    setShares(s);
    setShareUsers(u);
  };

  const handleAddShare = async (e: FormEvent) => {
    e.preventDefault();
    if (!sharePlanId) return;
    setShareError('');
    try {
      await api(`/applied-plans/${sharePlanId}/shares`, {
        method: 'POST',
        body: JSON.stringify({ userId: shareForm.userId, permission: shareForm.permission }),
      });
      setShareForm({ userId: '', permission: 'VIEW' });
      toast.success('Share added');
      const s = await api<PlanShare[]>(`/applied-plans/${sharePlanId}/shares`);
      setShares(s);
    } catch (err: unknown) {
      setShareError(err instanceof Error ? err.message : 'Share failed');
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    if (!sharePlanId) return;
    await api(`/applied-plans/${sharePlanId}/shares/${shareId}`, { method: 'DELETE' });
    toast.success('Share removed');
    const s = await api<PlanShare[]>(`/applied-plans/${sharePlanId}/shares`);
    setShares(s);
  };

  const handleRemovePlan = async (planId: string) => {
    setRemovePlanTarget(planId);
  };

  const confirmRemovePlan = async () => {
    if (!removePlanTarget) return;
    try {
      await api(`/applied-plans/${removePlanTarget}`, { method: 'DELETE' });
      toast.success('Programme removed. Actual session logs have been preserved.');
      loadAppliedPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove plan');
    } finally {
      setRemovePlanTarget(null);
    }
  };

  const handleQuickLog = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setQuickLogError('');
    setQuickLogLoading(true);
    try {
      await api('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          horseId: id,
          date: quickLogForm.date,
          slot: quickLogForm.slot,
          sessionType: quickLogForm.sessionType || null,
          durationMinutes: quickLogForm.durationMinutes ? parseInt(quickLogForm.durationMinutes) : null,
          intensityRpe: quickLogForm.intensityRpe ? parseInt(quickLogForm.intensityRpe) : null,
          rider: quickLogForm.rider || null,
          notes: quickLogForm.notes || null,
        }),
      });
      setShowQuickLog(false);
      setQuickLogForm({
        date: new Date().toISOString().split('T')[0],
        slot: 'AM',
        sessionType: '',
        durationMinutes: '',
        intensityRpe: '',
        rider: '',
        notes: '',
      });
      toast.success('Session logged');
    } catch (err: unknown) {
      setQuickLogError(err instanceof Error ? err.message : 'Failed to log session');
    } finally {
      setQuickLogLoading(false);
    }
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
        await api(`/appointments/horse/${id}`, { method: 'POST', body: JSON.stringify(body) });
        toast.success('Appointment added');
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
        body.dueDate = completeForm.dueDate || null;
      }
      if (completingAppt.type === 'FARRIER') {
        body.farrierName = completeForm.farrierName || null;
        body.dueDate = completeForm.dueDate || null;
      }
      if (completingAppt.type === 'DENTIST') {
        body.dentistName = completeForm.dentistName || null;
        body.dueDate = completeForm.dueDate || null;
      }
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
      // Reload the matching health record tab if currently viewing it
      const typeToTab: Record<string, Tab> = {
        VET: 'vet', FARRIER: 'farrier', DENTIST: 'dentist', VACCINATION: 'vaccinations', OTHER: 'expenses',
      };
      const matchTab = typeToTab[completingAppt.type];
      if (matchTab && tab === matchTab) loadRecords(tab);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete appointment');
    }
  };

  const handleCancelAppt = async (appt: Appointment) => {
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

  const formatDateRange = (plan: AppliedPlan): string => {
    const start = new Date(plan.startDate);
    const startStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (plan.programmeVersion?.numWeeks) {
      const end = new Date(start);
      end.setDate(end.getDate() + plan.programmeVersion.numWeeks * 7 - 1);
      const endStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${startStr} - ${endStr}`;
    }
    return startStr;
  };

  if (loading) return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="w-5 h-5 shrink-0" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-28 ml-auto" />
      </div>
      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b pb-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-16" />)}
      </div>
      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <Skeleton className="w-full h-48 mb-2" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <Skeleton className="h-5 w-32 mb-2" />
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <Skeleton className="h-5 w-40 mb-2" />
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </div>
      </div>
    </div>
  );
  if (!horse) return null;

  const canViewHealth = !isStableStaff || !!horse._isPriority;
  const allTabs: { key: Tab; label: string; visible: boolean }[] = [
    { key: 'overview', label: 'Overview', visible: true },
    { key: 'programmes', label: 'Programmes', visible: true },
    { key: 'vet', label: 'Vet', visible: canViewHealth },
    { key: 'farrier', label: 'Farrier', visible: canViewHealth },
    { key: 'dentist', label: 'Dentist', visible: canViewHealth },
    { key: 'vaccinations', label: 'Vaccines', visible: canViewHealth },
    { key: 'expenses', label: 'Expenses', visible: !!canViewExpenses },
    { key: 'appointments', label: 'Appointments', visible: canEdit },
    { key: 'documents', label: 'Documents', visible: true },
    { key: 'timeline', label: 'Timeline', visible: canViewHealth },
  ];
  const tabs = allTabs.filter((t) => t.visible);

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <Link to="/horses" className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate min-w-0">{horse.name}</h2>
        {horse._isPriority && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            Priority
          </span>
        )}
        <Button asChild size="sm" className="ml-auto shrink-0">
          <Link to={`/horses/${id}/planner`}>
            <Calendar className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Planner</span>
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 sm:gap-1 mb-4 sm:mb-6 overflow-x-auto border-b scrollbar-hide">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Health records restricted banner for non-priority stable staff */}
          {isStableStaff && !horse._isPriority && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Health records not available</p>
                <p className="text-xs text-amber-600 mt-0.5">You can only view health records for horses you're assigned as priority carer for. Contact your stable lead to be assigned.</p>
              </div>
            </div>
          )}

          {/* Health status summary */}
          {healthSummary && canViewHealth && (
            <div className="bg-white rounded-xl border p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Health status</h3>
              <div className="flex flex-wrap gap-2">
                {/* Vet */}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                  healthSummary.lastVetDate
                    ? daysSince(healthSummary.lastVetDate) > 180
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  <Stethoscope className="w-3.5 h-3.5" />
                  {healthSummary.lastVetDate
                    ? `Vet: ${daysSince(healthSummary.lastVetDate)}d ago`
                    : 'No vet visits'}
                </div>
                {/* Farrier */}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                  healthSummary.lastFarrierDate
                    ? daysSince(healthSummary.lastFarrierDate) > 56
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  <Scissors className="w-3.5 h-3.5" />
                  {healthSummary.lastFarrierDate
                    ? `Farrier: ${daysSince(healthSummary.lastFarrierDate)}d ago`
                    : 'No farrier visits'}
                </div>
                {/* Overdue / due-soon vet */}
                {healthSummary.overdueVet.map((v) => (
                  <button key={v.id} onClick={() => setTab('vet')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Vet overdue
                  </button>
                ))}
                {healthSummary.dueSoonVet.map((v) => (
                  <button key={v.id} onClick={() => setTab('vet')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors">
                    <Stethoscope className="w-3.5 h-3.5" />
                    Vet due in {daysUntil(v.dueDate)}d
                  </button>
                ))}
                {/* Overdue / due-soon farrier */}
                {healthSummary.overdueFarrier.map((v) => (
                  <button key={v.id} onClick={() => setTab('farrier')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Farrier overdue
                  </button>
                ))}
                {healthSummary.dueSoonFarrier.map((v) => (
                  <button key={v.id} onClick={() => setTab('farrier')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors">
                    <Scissors className="w-3.5 h-3.5" />
                    Farrier due in {daysUntil(v.dueDate)}d
                  </button>
                ))}
                {/* Overdue / due-soon dentist */}
                {healthSummary.overdueDentist.map((v) => (
                  <button key={v.id} onClick={() => setTab('dentist')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Dentist overdue
                  </button>
                ))}
                {healthSummary.dueSoonDentist.map((v) => (
                  <button key={v.id} onClick={() => setTab('dentist')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Dentist due in {daysUntil(v.dueDate)}d
                  </button>
                ))}
                {/* Overdue vaccinations */}
                {healthSummary.overdueVaccinations.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setTab('vaccinations')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {v.name ?? 'Vaccination'} overdue
                  </button>
                ))}
                {/* Due soon vaccinations */}
                {healthSummary.dueSoonVaccinations.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setTab('vaccinations')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                  >
                    <Syringe className="w-3.5 h-3.5" />
                    {v.name ?? 'Vaccination'} due in {daysUntil(v.dueDate)}d
                  </button>
                ))}
                {/* All clear */}
                {healthSummary.overdueVaccinations.length === 0 && healthSummary.dueSoonVaccinations.length === 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                    <Syringe className="w-3.5 h-3.5" />
                    Vaccinations up to date
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Next appointment panel */}
          {nextAppointment !== undefined && (
            <div className="bg-white rounded-xl border p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">Next appointment</h3>
                <button
                  onClick={() => setTab('appointments')}
                  className="text-xs text-brand-600 hover:underline"
                >
                  View all
                </button>
              </div>
              {nextAppointment === null ? (
                <p className="text-sm text-gray-400">No upcoming appointments.</p>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{formatApptDate(nextAppointment.scheduledAt)}</span>
                      <ApptTypeBadge
                        type={nextAppointment.type}
                        label={nextAppointment.type === 'OTHER' ? (nextAppointment.typeOther ?? 'Other') : undefined}
                      />
                    </div>
                    {nextAppointment.practitionerName && (
                      <p className="text-xs text-gray-500 mt-0.5">{nextAppointment.practitionerName}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {nextAppointment.locationAtStable ? 'At stable' : (nextAppointment.locationOther ?? 'Other location')}
                      {nextAppointment.contactNumber && ` · ${nextAppointment.contactNumber}`}
                    </p>
                  </div>
                  {daysUntil(nextAppointment.scheduledAt) <= 7 && (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded shrink-0">
                      {daysUntil(nextAppointment.scheduledAt) === 0 ? 'Today' : `${daysUntil(nextAppointment.scheduledAt)}d away`}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Training load chart */}
          <TrainingLoadChart horseId={id!} />

          {/* Horse photo */}
          <div className="bg-white rounded-xl border p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-5">
              <div className="shrink-0">
                {horse.photoUrl ? (
                  <AuthenticatedImage src={horse.photoUrl} alt={horse.name} className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl object-cover border" fallback={<div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl bg-gray-100 border flex items-center justify-center text-gray-300 text-4xl">&#x1f40e;</div>} />
                ) : (
                  <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl bg-gray-100 border flex items-center justify-center text-gray-300 text-4xl">
                    &#x1f40e;
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex flex-row sm:flex-col gap-2">
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  <Button variant="link" size="sm" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
                    {uploadingPhoto ? 'Uploading...' : horse.photoUrl ? 'Change photo' : 'Upload photo'}
                  </Button>
                  {horse.photoUrl && (
                    <Button variant="link" size="sm" className="text-red-500 hover:text-red-600" onClick={handleRemovePhoto}>Remove photo</Button>
                  )}
                  {photoError && <div className="text-sm text-red-600">{photoError}</div>}
                </div>
              )}
            </div>
          </div>

          {/* Horse details */}
          <div className="bg-white rounded-xl border p-4 sm:p-5">
            {editing ? (
              <form onSubmit={handleEditHorse} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                    <input type="number" value={editForm.age} onChange={(e) => setEditForm({ ...editForm, age: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Breed</label>
                    <input value={editForm.breed} onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stable</label>
                  <select value={editForm.stableId} onChange={(e) => setEditForm({ ...editForm, stableId: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">No stable</option>
                    {stables.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {editForm.stableId ? 'Box / paddock location' : 'Where is this horse kept?'}
                  </label>
                  <input
                    value={editForm.stableLocation}
                    onChange={(e) => setEditForm({ ...editForm, stableLocation: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder={editForm.stableId ? 'e.g. Box 4, Back paddock' : 'e.g. Home yard, Main Road Farm'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Identifying info</label>
                  <input value={editForm.identifyingInfo} onChange={(e) => setEditForm({ ...editForm, identifyingInfo: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Owner notes</label>
                  <textarea value={editForm.ownerNotes} onChange={(e) => setEditForm({ ...editForm, ownerNotes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit">Save</Button>
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <div>
                <div className="grid grid-cols-2 gap-4">
                  {horse.breed && <div><span className="text-sm text-gray-500">Breed</span><div>{horse.breed}</div></div>}
                  {horse.age && <div><span className="text-sm text-gray-500">Age</span><div>{horse.age}</div></div>}
                  {(horse.stable || horse.stableLocation) && <div><span className="text-sm text-gray-500">Stable</span><div>{horse.stable?.name || horse.stableLocation}</div></div>}
                  {horse.identifyingInfo && <div><span className="text-sm text-gray-500">ID info</span><div>{horse.identifyingInfo}</div></div>}
                </div>
                {horse.ownerNotes && <div className="mt-4"><span className="text-sm text-gray-500">Notes</span><div className="mt-1">{horse.ownerNotes}</div></div>}
                {isAdmin && (
                  <div className="flex gap-2 mt-4 pt-4 border-t">
                    <Button variant="link" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                    <Button variant="link" size="sm" className="text-red-500 hover:text-red-600" onClick={handleDelete}>Delete</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Assignments */}
          {isAdmin && (
            <div className="bg-white rounded-xl border p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm sm:text-base">User assignments</h3>
                <Button variant="link" size="sm" onClick={openAssign}>Assign user</Button>
              </div>
              {horse.assignments && horse.assignments.length > 0 ? (
                <div className="space-y-2">
                  {horse.assignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{a.user?.name || a.user?.email}</span>
                        <Badge variant={a.permission === 'EDIT' ? 'success' : 'default'}>
                          {a.permission}
                        </Badge>
                      </div>
                      <Button variant="link" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleRemoveAssignment(a.id)}>Remove</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No users assigned</p>
              )}
            </div>
          )}

          {/* Priority care panel — visible to owner, stable lead, and admin */}
          {(isAdmin || isOwner || user?.role === 'STABLE_LEAD') && horse?.stableId && (
            <PriorityPanel horseId={id!} />
          )}

        </div>
      )}

      {/* Programmes tab */}
      {tab === 'programmes' && (
        <div className="bg-white rounded-xl border p-4 sm:p-5">
          <h3 className="font-semibold mb-4">Applied Programmes</h3>
          {plansLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : appliedPlans.length === 0 ? (
            <p className="text-sm text-gray-500">No programmes applied yet.</p>
          ) : (
            <div className="space-y-3">
              {appliedPlans.map((plan) => {
                const pv = plan.programmeVersion;
                const isAssigner = user?.id === plan.assignedById;
                const canManage = isAdmin || isAssigner;
                return (
                  <div key={plan.id} className="border rounded-lg p-3 sm:p-4 hover:shadow-sm transition-shadow">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm sm:text-base">
                          {pv?.programme?.name || 'Unknown programme'}
                        </span>
                        {pv && (
                          <span className="text-xs text-gray-500">v{pv.version}</span>
                        )}
                        <Badge variant={
                          plan.status === 'ACTIVE' ? 'success'
                            : plan.status === 'COMPLETED' ? 'info'
                            : 'default'
                        }>
                          {plan.status}
                        </Badge>
                      </div>
                      <div className="text-xs sm:text-sm text-gray-500 mt-1">
                        {formatDateRange(plan)}
                        {pv?.numWeeks && <span className="ml-2">({pv.numWeeks} wks)</span>}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-400 mt-0.5">
                        Assigned by {plan.assignedBy?.name || plan.assignedBy?.email || 'Unknown'}
                      </div>
                      {plan._count?.workouts != null && (
                        <div className="text-xs text-gray-400 mt-0.5">{plan._count.workouts} workouts</div>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRepeat(plan.id)}
                        >
                          <Repeat className="w-3.5 h-3.5 mr-1.5" />
                          Repeat
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openShare(plan.id, plan.assignedById)}
                        >
                          <Share2 className="w-3.5 h-3.5 mr-1.5" />
                          Share
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                          onClick={() => handleRemovePlan(plan.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Appointments tab */}
      {tab === 'appointments' && (() => {
        const upcoming = appointments
          .filter((a) => a.status === 'UPCOMING')
          .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
        const past = appointments
          .filter((a) => a.status !== 'UPCOMING')
          .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

        const ApptRow = ({ appt }: { appt: Appointment }) => (
          <div className="flex items-start justify-between gap-2 py-3 border-b last:border-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-900">{formatApptDate(appt.scheduledAt)}</span>
                <ApptTypeBadge type={appt.type} label={appt.type === 'OTHER' ? (appt.typeOther ?? 'Other') : undefined} />
                {appt.status !== 'UPCOMING' && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${appt.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {appt.status === 'COMPLETED' ? 'Done' : 'Cancelled'}
                  </span>
                )}
              </div>
              {appt.practitionerName && (
                <div className="text-sm text-gray-600 mt-0.5">{appt.practitionerName}</div>
              )}
              <div className="text-xs text-gray-400 mt-0.5">
                {appt.locationAtStable ? (horse?.stable?.name ?? 'At stable') : (appt.locationOther ?? 'Other location')}
              </div>
              {appt.notes && (
                <div className="text-xs text-gray-500 mt-1 truncate max-w-xs">{appt.notes}</div>
              )}
            </div>
            {canEdit && (
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
            )}
          </div>
        );

        return (
          <div className="bg-white rounded-xl border p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Appointments</h3>
              {canEdit && (
                <Button size="sm" onClick={() => {
                  setEditingApptId(null);
                  setApptForm({ type: 'VET', typeOther: '', scheduledDate: '', scheduledTime: '09:00', practitionerName: '', contactNumber: '', locationAtStable: true, locationOther: '', notes: '' });
                  setApptError('');
                  setShowApptForm(true);
                }}>
                  Add appointment
                </Button>
              )}
            </div>

            {/* Upcoming */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upcoming</h4>
              {upcoming.length === 0 ? (
                <p className="text-sm text-gray-500">No upcoming appointments.</p>
              ) : (
                <div>{upcoming.map((a) => <ApptRow key={a.id} appt={a} />)}</div>
              )}
            </div>

            {/* Past */}
            <div>
              <button
                className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700"
                onClick={() => setShowPastAppts((v) => !v)}
              >
                {showPastAppts ? '▾' : '▸'} Past ({past.length})
              </button>
              {showPastAppts && past.length > 0 && (
                <div>{past.map((a) => <ApptRow key={a.id} appt={a} />)}</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Health / expense records tab */}
      {!['overview', 'programmes', 'appointments'].includes(tab) && (
        <div className="bg-white rounded-xl border p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold capitalize">{tab === 'vet' ? 'Vet visits' : tab === 'farrier' ? 'Farrier visits' : tab === 'dentist' ? 'Dentist visits' : tab}</h3>
            {canEdit && (
              <Button size="sm" onClick={() => { setRecForm({ date: new Date().toISOString().split('T')[0], notes: '', name: '', dueDate: '', amount: '', vetName: '', visitReason: '', visitReasonOther: '', farrierName: '', dentistName: '', category: '' }); setShowAddRecord(true); }}>
                Add record
              </Button>
            )}
          </div>
          {horse._accessType === 'LEAD_VIEW' && tab !== 'expenses' && (
            <p className="text-xs text-gray-400 mb-3 italic">Dates only — detailed notes are visible to the owner.</p>
          )}

          {records.length === 0 ? (
            <p className="text-sm text-gray-500">No records yet.</p>
          ) : (
            <div className="space-y-3">
              {records.map((r) => (
                <div key={r.id} className="flex items-start justify-between py-3 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{new Date(r.date).toLocaleDateString('en-GB')}</div>
                    {r.visitReason && <div className="text-sm text-gray-700">{r.visitReason}</div>}
                    {r.vetName && <div className="text-xs text-gray-500">{r.vetName}</div>}
                    {r.farrierName && <div className="text-xs text-gray-500">{r.farrierName}</div>}
                    {r.dentistName && <div className="text-xs text-gray-500">{r.dentistName}</div>}
                    {r.name && <div className="text-sm text-gray-700">{r.name}</div>}
                    {r.category && <div className="text-xs font-medium text-brand-600 mt-0.5">{r.category}</div>}
                    {r.amount != null && <div className="text-sm text-gray-700 mt-0.5">£{Number(r.amount).toFixed(2)}</div>}
                    {r.notes && <div className="text-sm text-gray-500 mt-1">{r.notes}</div>}
                    {r.dueDate && <div className="text-xs text-amber-600 mt-1">Next due: {new Date(r.dueDate).toLocaleDateString('en-GB')}</div>}
                    {r.fileUrl && (
                      <div className="mt-2">
                        {r.fileName?.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                          <a href={r.fileUrl} target="_blank" rel="noopener noreferrer">
                            <img src={r.fileUrl} alt={r.fileName || 'Attachment'} className="max-w-full sm:max-w-xs max-h-40 rounded-lg border object-cover" />
                          </a>
                        ) : (
                          <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline">
                            <span>&#128206;</span> {r.fileName || 'View attachment'}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      <Button variant="link" size="sm" className="text-gray-500 hover:text-gray-700" onClick={() => handleEditRecord(r)}>Edit</Button>
                      <Button variant="link" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDeleteRecord(r.id)}>Delete</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documents tab */}
      {tab === 'documents' && id && (
        <DocumentVault horseId={id} canEdit={canEdit} />
      )}

      {/* Timeline tab */}
      {tab === 'timeline' && id && (
        <HealthTimeline horseId={id} />
      )}

      {/* Quick-log FAB — visible when user has edit access */}
      {canEdit && (
        <button
          onClick={() => {
            setQuickLogForm({
              date: new Date().toISOString().split('T')[0],
              slot: 'AM',
              sessionType: '',
              durationMinutes: '',
              intensityRpe: '',
              rider: '',
              notes: '',
            });
            setQuickLogError('');
            setShowQuickLog(true);
          }}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-3 rounded-full shadow-lg transition-colors font-medium text-sm"
          title="Log a session"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Log session</span>
        </button>
      )}

      {/* Quick-log session modal */}
      <Modal open={showQuickLog} onClose={() => { setShowQuickLog(false); setQuickLogError(''); }} title={`Log session — ${horse?.name}`}>
        {quickLogError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{quickLogError}</div>}
        <form onSubmit={handleQuickLog} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={quickLogForm.date}
                onChange={(e) => setQuickLogForm({ ...quickLogForm, date: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slot</label>
              <select
                value={quickLogForm.slot}
                onChange={(e) => setQuickLogForm({ ...quickLogForm, slot: e.target.value as 'AM' | 'PM' })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session type</label>
            <input
              value={quickLogForm.sessionType}
              onChange={(e) => setQuickLogForm({ ...quickLogForm, sessionType: e.target.value })}
              placeholder="e.g. Canter work, Polo chukka, Rest"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input
                type="number"
                min="1"
                value={quickLogForm.durationMinutes}
                onChange={(e) => setQuickLogForm({ ...quickLogForm, durationMinutes: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RPE (1–10)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={quickLogForm.intensityRpe}
                onChange={(e) => setQuickLogForm({ ...quickLogForm, intensityRpe: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rider</label>
            <input
              value={quickLogForm.rider}
              onChange={(e) => setQuickLogForm({ ...quickLogForm, rider: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={quickLogForm.notes}
              onChange={(e) => setQuickLogForm({ ...quickLogForm, notes: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <Button type="submit" disabled={quickLogLoading} className="w-full">
            {quickLogLoading ? 'Saving...' : 'Save session'}
          </Button>
        </form>
      </Modal>

      {/* Delete horse confirmation modal */}
      <Modal open={deleteHorseConfirm} onClose={() => setDeleteHorseConfirm(false)} title="Delete horse">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete <strong>{horse.name}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setDeleteHorseConfirm(false)}>Cancel</Button>
          <Button variant="destructive" onClick={confirmDeleteHorse}>Delete</Button>
        </div>
      </Modal>

      {/* Remove plan confirmation modal */}
      <Modal open={!!removePlanTarget} onClose={() => setRemovePlanTarget(null)} title="Remove programme">
        <p className="text-sm text-gray-600 mb-4">
          Remove this programme from the horse? Scheduled workouts and planned sessions will be deleted, but actual session logs will be preserved.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setRemovePlanTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={confirmRemovePlan}>Remove</Button>
        </div>
      </Modal>

      {/* Delete health record confirmation modal */}
      <Modal open={!!deleteRecordTarget} onClose={() => setDeleteRecordTarget(null)} title="Delete record">
        <p className="text-sm text-gray-600 mb-4">
          Delete <strong>{deleteRecordTarget?.label}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setDeleteRecordTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={confirmDeleteRecord}>Delete</Button>
        </div>
      </Modal>

      {/* Remove user assignment confirmation modal */}
      <Modal open={!!removeAssignmentTarget} onClose={() => setRemoveAssignmentTarget(null)} title="Remove assignment">
        <p className="text-sm text-gray-600 mb-4">
          Remove <strong>{removeAssignmentTarget?.name}</strong>'s access to this horse?
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setRemoveAssignmentTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={confirmRemoveAssignment}>Remove</Button>
        </div>
      </Modal>

      {/* Assign user modal */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Assign user to horse">
        <form onSubmit={handleAssign} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
            <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} className="w-full border rounded-lg px-3 py-2" required>
              <option value="">Select user...</option>
              {allUsers.filter((u) => u.role !== 'ADMIN').map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Permission</label>
            <select value={assignPerm} onChange={(e) => setAssignPerm(e.target.value as 'VIEW' | 'EDIT')} className="w-full border rounded-lg px-3 py-2">
              <option value="VIEW">View only</option>
              <option value="EDIT">Editor</option>
            </select>
          </div>
          <Button type="submit" className="w-full">Assign</Button>
        </form>
      </Modal>

      {/* Add record modal */}
      <Modal open={showAddRecord} onClose={() => { setShowAddRecord(false); setEditingRecordId(null); setRecError(''); }} title={`${editingRecordId ? 'Edit' : 'Add'} ${tab === 'vet' ? 'vet visit' : tab === 'farrier' ? 'farrier visit' : tab === 'dentist' ? 'dentist visit' : tab + ' record'}`}>
        {recError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{recError}</div>}
        <form onSubmit={handleAddRecord} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={recForm.date} onChange={(e) => setRecForm({ ...recForm, date: e.target.value })} className="w-full border rounded-lg px-3 py-2" required />
          </div>
          {tab === 'vet' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vet / Practice</label>
                <input value={recForm.vetName} onChange={(e) => setRecForm({ ...recForm, vetName: e.target.value })} placeholder="e.g. Dr. Smith – ABC Veterinary" className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for visit</label>
                <select value={recForm.visitReason} onChange={(e) => setRecForm({ ...recForm, visitReason: e.target.value, visitReasonOther: '' })} className="w-full border rounded-lg px-3 py-2">
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
              {recForm.visitReason === 'Other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Describe reason</label>
                  <input value={recForm.visitReasonOther} onChange={(e) => setRecForm({ ...recForm, visitReasonOther: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next due date</label>
                <input type="date" value={recForm.dueDate} onChange={(e) => setRecForm({ ...recForm, dueDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
            </>
          )}
          {tab === 'farrier' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Farrier name</label>
                <input value={recForm.farrierName} onChange={(e) => setRecForm({ ...recForm, farrierName: e.target.value })} placeholder="e.g. John Smith" className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next due date</label>
                <input type="date" value={recForm.dueDate} onChange={(e) => setRecForm({ ...recForm, dueDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
            </>
          )}
          {tab === 'dentist' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dentist name</label>
                <input value={recForm.dentistName} onChange={(e) => setRecForm({ ...recForm, dentistName: e.target.value })} placeholder="e.g. Jane Doe" className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next due date</label>
                <input type="date" value={recForm.dueDate} onChange={(e) => setRecForm({ ...recForm, dueDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
            </>
          )}
          {tab === 'vaccinations' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vaccination name</label>
                <input value={recForm.name} onChange={(e) => setRecForm({ ...recForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next due date</label>
                <input type="date" value={recForm.dueDate} onChange={(e) => setRecForm({ ...recForm, dueDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
            </>
          )}
          {tab === 'expenses' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  list="expense-categories"
                  value={recForm.category}
                  onChange={(e) => setRecForm({ ...recForm, category: e.target.value })}
                  placeholder="e.g. Vet, Feed, Equipment…"
                  className="w-full border rounded-lg px-3 py-2"
                />
                <datalist id="expense-categories">
                  <option value="Vet" />
                  <option value="Farrier" />
                  <option value="Dentist" />
                  <option value="Vaccinations" />
                  <option value="Feed" />
                  <option value="Bedding" />
                  <option value="Equipment" />
                  <option value="Competition" />
                  <option value="Insurance" />
                  <option value="Transport" />
                  <option value="Other" />
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input type="number" step="0.01" min="0" value={recForm.amount} onChange={(e) => setRecForm({ ...recForm, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={recForm.notes} onChange={(e) => setRecForm({ ...recForm, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attach file (image or PDF)</label>
            <input ref={recFileRef} type="file" accept="image/*,.pdf" className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" />
          </div>
          <Button type="submit" className="w-full">Save</Button>
        </form>
      </Modal>

      {/* Repeat programme modal */}
      <Modal open={showRepeat} onClose={() => setShowRepeat(false)} title="Repeat Programme">
        <form onSubmit={handleRepeat} className="space-y-3">
          <p className="text-sm text-gray-600">
            Create a new run of this programme for the same horse.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
            <select
              value={repeatForm.mode}
              onChange={(e) => setRepeatForm({ ...repeatForm, mode: e.target.value as 'original' | 'amended' })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="original">Original - use the published programme as-is</option>
              <option value="amended">Amended - use edits from previous run</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start date (Monday)</label>
            <input
              type="date"
              value={repeatForm.startDate}
              onChange={(e) => setRepeatForm({ ...repeatForm, startDate: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              required
            />
          </div>
          {repeatError && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{repeatError}</div>
          )}
          <Button type="submit" disabled={repeatLoading} className="w-full">
            {repeatLoading ? 'Creating...' : 'Repeat programme'}
          </Button>
        </form>
      </Modal>

      {/* Add / Edit appointment modal */}
      <Modal
        open={showApptForm}
        onClose={() => { setShowApptForm(false); setEditingApptId(null); setApptError(''); }}
        title={editingApptId ? 'Edit appointment' : 'Add appointment'}
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
                  name="apptLocation"
                  checked={apptForm.locationAtStable}
                  onChange={() => setApptForm({ ...apptForm, locationAtStable: true, locationOther: '' })}
                />
                At stable
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="apptLocation"
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
            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{formatApptDate(completingAppt.scheduledAt)}</span>
                <ApptTypeBadge type={completingAppt.type} label={completingAppt.type === 'OTHER' ? (completingAppt.typeOther ?? 'Other') : undefined} />
              </div>
              {completingAppt.practitionerName && (
                <div className="text-gray-600">{completingAppt.practitionerName}</div>
              )}
            </div>

            {/* Health record fields */}
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
                {completingAppt.type === 'FARRIER' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Farrier name</label>
                      <input
                        value={completeForm.farrierName}
                        onChange={(e) => setCompleteForm({ ...completeForm, farrierName: e.target.value })}
                        placeholder="e.g. John Smith"
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
                {completingAppt.type === 'DENTIST' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Dentist name</label>
                      <input
                        value={completeForm.dentistName}
                        onChange={(e) => setCompleteForm({ ...completeForm, dentistName: e.target.value })}
                        placeholder="e.g. Jane Doe"
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

      {/* Share plan modal */}
      <Modal open={showShare} onClose={() => setShowShare(false)} title="Share Plan" wide>
        <div className="space-y-4">
          {/* Existing shares */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Current shares</h4>
            {shares.length === 0 ? (
              <p className="text-sm text-gray-400">Not shared with anyone yet.</p>
            ) : (
              <div className="space-y-2">
                {shares.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.sharedWith.name || s.sharedWith.email}</span>
                      <Badge variant={s.permission === 'EDIT' ? 'success' : 'default'}>
                        {s.permission}
                      </Badge>
                    </div>
                    {(isAdmin || user?.id === sharePlanAssignerId) && (
                      <Button
                        variant="link"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleRemoveShare(s.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add share form */}
          {(isAdmin || user?.id === sharePlanAssignerId) && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Add share</h4>
              <form onSubmit={handleAddShare} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                  <select
                    value={shareForm.userId}
                    onChange={(e) => setShareForm({ ...shareForm, userId: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  >
                    <option value="">Select user...</option>
                    {shareUsers
                      .filter((u) => u.id !== sharePlanAssignerId && u.role !== 'ADMIN' && !shares.some((s) => s.sharedWithId === u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Permission</label>
                  <select
                    value={shareForm.permission}
                    onChange={(e) => setShareForm({ ...shareForm, permission: e.target.value as 'VIEW' | 'EDIT' })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="VIEW">View only</option>
                    <option value="EDIT">Editor</option>
                  </select>
                </div>
                {shareError && (
                  <div className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{shareError}</div>
                )}
                <Button type="submit" className="w-full">Add share</Button>
              </form>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
