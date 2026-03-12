import { useEffect, useState, useRef, FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../api/client';
import { Horse, User, AppliedPlan, PlanShare, Stable } from '../types';
import Modal from '../components/Modal';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Calendar, Repeat, Share2, Trash2, Plus, Stethoscope, Scissors, Syringe, AlertTriangle } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import TrainingLoadChart from '../components/TrainingLoadChart';
import { toast } from 'sonner';

interface HealthSummary {
  lastVetDate: string | null;
  lastFarrierDate: string | null;
  overdueVaccinations: { id: string; name: string | null; dueDate: string }[];
  dueSoonVaccinations: { id: string; name: string | null; dueDate: string }[];
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

type Tab = 'overview' | 'vet' | 'farrier' | 'vaccinations' | 'expenses' | 'programmes';

interface HealthRecord {
  id: string;
  date: string;
  notes: string | null;
  name?: string | null;
  dueDate?: string | null;
  amount?: number | null;
  fileUrl?: string | null;
  fileName?: string | null;
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
  const [editForm, setEditForm] = useState({ name: '', age: '', breed: '', stableId: '', ownerNotes: '', identifyingInfo: '' });
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
  const [recForm, setRecForm] = useState({ date: '', notes: '', name: '', dueDate: '', amount: '' });
  const recFileRef = useRef<HTMLInputElement>(null);
  const [recError, setRecError] = useState('');

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
        ownerNotes: h.ownerNotes || '',
        identifyingInfo: h.identifyingInfo || '',
      });
    } catch { navigate('/horses'); }
    finally { setLoading(false); }
  };

  const loadRecords = async (t: Tab) => {
    if (t === 'overview') return;
    const endpoint = t === 'vet' ? 'vet-visits' : t === 'farrier' ? 'farrier-visits' : t;
    const data = await api<HealthRecord[]>(`/health/${id}/${endpoint}`);
    setRecords(data);
  };

  const loadHealthSummary = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const thirtyDaysOut = new Date(today);
      thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

      const [vets, farriers, vaccinations] = await Promise.all([
        api<{ id: string; date: string }[]>(`/health/${id}/vet-visits`),
        api<{ id: string; date: string }[]>(`/health/${id}/farrier-visits`),
        api<{ id: string; name: string | null; dueDate: string | null }[]>(`/health/${id}/vaccinations`),
      ]);

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
      });
    } catch {
      // non-critical, ignore
    }
  };

  useEffect(() => { loadHorse(); }, [id]);
  useEffect(() => { loadRecords(tab); }, [tab, id]);
  useEffect(() => { if (id) loadHealthSummary(); }, [id]);

  const handleEditHorse = async (e: FormEvent) => {
    e.preventDefault();
    await api(`/horses/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: editForm.name,
        age: editForm.age ? parseInt(editForm.age) : null,
        breed: editForm.breed || null,
        stableId: editForm.stableId || null,
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
    const endpoint = tab === 'vet' ? 'vet-visits' : tab === 'farrier' ? 'farrier-visits' : tab;
    try {
      const formData = new FormData();
      formData.append('date', recForm.date);
      if (recForm.notes) formData.append('notes', recForm.notes);
      if (tab === 'vaccinations') {
        if (recForm.name) formData.append('name', recForm.name);
        if (recForm.dueDate) formData.append('dueDate', recForm.dueDate);
      }
      if (tab === 'expenses' && recForm.amount) {
        formData.append('amount', recForm.amount);
      }
      const file = recFileRef.current?.files?.[0];
      if (file) formData.append('file', file);
      await api(`/health/${id}/${endpoint}`, { method: 'POST', body: formData });
      setShowAddRecord(false);
      setRecForm({ date: '', notes: '', name: '', dueDate: '', amount: '' });
      if (recFileRef.current) recFileRef.current.value = '';
      toast.success('Record added');
      loadRecords(tab);
    } catch (err: unknown) {
      setRecError(err instanceof Error ? err.message : 'Failed to add record');
    }
  };

  const handleDeleteRecord = (recordId: string) => {
    const record = records.find((r) => r.id === recordId);
    const label = record?.name || new Date(record?.date || '').toLocaleDateString('en-GB') || 'this record';
    setDeleteRecordTarget({ id: recordId, label });
  };

  const confirmDeleteRecord = async () => {
    if (!deleteRecordTarget) return;
    const endpoint = tab === 'vet' ? 'vet-visits' : tab === 'farrier' ? 'farrier-visits' : tab;
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

  const allTabs: { key: Tab; label: string; visible: boolean }[] = [
    { key: 'overview', label: 'Overview', visible: true },
    { key: 'programmes', label: 'Programmes', visible: true },
    { key: 'vet', label: 'Vet', visible: true },
    { key: 'farrier', label: 'Farrier', visible: true },
    { key: 'vaccinations', label: 'Vaccines', visible: true },
    { key: 'expenses', label: 'Expenses', visible: !!canViewExpenses },
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
          {/* Health status summary */}
          {healthSummary && (
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

          {/* Training load chart */}
          <TrainingLoadChart horseId={id!} />

          {/* Horse photo */}
          <div className="bg-white rounded-xl border p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-5">
              <div className="shrink-0">
                {horse.photoUrl ? (
                  <img src={horse.photoUrl} alt={horse.name} className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl object-cover border" />
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

      {/* Health / expense records tab */}
      {!['overview', 'programmes'].includes(tab) && (
        <div className="bg-white rounded-xl border p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold capitalize">{tab === 'vet' ? 'Vet visits' : tab === 'farrier' ? 'Farrier visits' : tab}</h3>
            {canEdit && (
              <Button size="sm" onClick={() => { setRecForm({ date: new Date().toISOString().split('T')[0], notes: '', name: '', dueDate: '', amount: '' }); setShowAddRecord(true); }}>
                Add record
              </Button>
            )}
          </div>

          {records.length === 0 ? (
            <p className="text-sm text-gray-500">No records yet.</p>
          ) : (
            <div className="space-y-3">
              {records.map((r) => (
                <div key={r.id} className="flex items-start justify-between py-3 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{new Date(r.date).toLocaleDateString('en-GB')}</div>
                    {r.name && <div className="text-sm text-gray-700">{r.name}</div>}
                    {r.notes && <div className="text-sm text-gray-500 mt-1">{r.notes}</div>}
                    {r.dueDate && <div className="text-xs text-amber-600 mt-1">Due: {new Date(r.dueDate).toLocaleDateString('en-GB')}</div>}
                    {r.amount != null && <div className="text-sm text-gray-600 mt-1">Amount: {r.amount}</div>}
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
                    <Button variant="link" size="sm" className="text-red-500 hover:text-red-600 shrink-0 ml-3" onClick={() => handleDeleteRecord(r.id)}>Delete</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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
      <Modal open={showAddRecord} onClose={() => { setShowAddRecord(false); setRecError(''); }} title={`Add ${tab} record`}>
        {recError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{recError}</div>}
        <form onSubmit={handleAddRecord} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={recForm.date} onChange={(e) => setRecForm({ ...recForm, date: e.target.value })} className="w-full border rounded-lg px-3 py-2" required />
          </div>
          {tab === 'vaccinations' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vaccination name</label>
                <input value={recForm.name} onChange={(e) => setRecForm({ ...recForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due date (reminder)</label>
                <input type="date" value={recForm.dueDate} onChange={(e) => setRecForm({ ...recForm, dueDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
            </>
          )}
          {tab === 'expenses' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" value={recForm.amount} onChange={(e) => setRecForm({ ...recForm, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
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
