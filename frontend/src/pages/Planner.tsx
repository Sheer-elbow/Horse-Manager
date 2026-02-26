import { useEffect, useState, FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Horse, PlanBlock, PlannedSession, ActualSessionLog, Programme, AuditEntry, Workout, ScheduleDayEntry } from '../types';
import Modal from '../components/Modal';

const SESSION_PRESETS = ['Flat work', 'Jumping', 'Lunging', 'Hack', 'Polo practice', 'Stick & ball', 'Swimming', 'Rest day', 'Walk only'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isWeekInPast(weekStart: Date): boolean {
  const currentMonday = getMondayOfWeek(new Date());
  return weekStart < currentMonday;
}

/** Format duration range like "30-45 min" or "30 min" */
function formatDuration(entry: ScheduleDayEntry): string | null {
  if (entry.durationMin == null && entry.durationMax == null) return null;
  if (entry.durationMin != null && entry.durationMax != null && entry.durationMin !== entry.durationMax) {
    return `${entry.durationMin}-${entry.durationMax}min`;
  }
  return `${entry.durationMin ?? entry.durationMax}min`;
}

/** Format intensity like "RPE 6-8" or "RPE 6" */
function formatIntensity(entry: ScheduleDayEntry): string | null {
  if (entry.intensityRpeMin == null && entry.intensityRpeMax == null) {
    return entry.intensityLabel || null;
  }
  const rpeStr = entry.intensityRpeMin != null && entry.intensityRpeMax != null && entry.intensityRpeMin !== entry.intensityRpeMax
    ? `RPE ${entry.intensityRpeMin}-${entry.intensityRpeMax}`
    : `RPE ${entry.intensityRpeMin ?? entry.intensityRpeMax}`;
  return entry.intensityLabel ? `${entry.intensityLabel} (${rpeStr})` : rpeStr;
}

export default function Planner() {
  const { id: horseId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [horse, setHorse] = useState<Horse | null>(null);
  const [blocks, setBlocks] = useState<PlanBlock[]>([]);
  const [activeBlock, setActiveBlock] = useState<PlanBlock | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getMondayOfWeek(new Date()));
  const [plannedSessions, setPlannedSessions] = useState<PlannedSession[]>([]);
  const [actualSessions, setActualSessions] = useState<ActualSessionLog[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);

  // Workout state
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [unscheduledWorkouts, setUnscheduledWorkouts] = useState<Workout[]>([]);

  // Modals
  const [showNewBlock, setShowNewBlock] = useState(false);
  const [showEditPlanned, setShowEditPlanned] = useState(false);
  const [showLogActual, setShowLogActual] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showCopyWeek, setShowCopyWeek] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);

  // Forms
  const [blockForm, setBlockForm] = useState({ name: '', startDate: '', numWeeks: '6', programmeId: '' });
  const [plannedForm, setPlannedForm] = useState({ date: '', slot: 'AM' as 'AM' | 'PM', sessionType: '', description: '', durationMinutes: '', intensityRpe: '', notes: '' });
  const [actualForm, setActualForm] = useState({ date: '', slot: 'AM' as 'AM' | 'PM', sessionType: '', durationMinutes: '', intensityRpe: '', notes: '', rider: '', deviationReason: '', existingId: '' });
  const [copyTargetWeek, setCopyTargetWeek] = useState('');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  // "Completed as planned" refs for the log actual modal
  const [logPlannedRef, setLogPlannedRef] = useState<PlannedSession | null>(null);
  const [logWorkoutRef, setLogWorkoutRef] = useState<Workout | null>(null);

  // Move modal state
  const [moveWorkoutId, setMoveWorkoutId] = useState<string | null>(null);
  const [moveForm, setMoveForm] = useState({ targetDate: '', slot: 'AM' as 'AM' | 'PM' });
  const [moveError, setMoveError] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const hasEditPermission = isAdmin || horse?._permission === 'EDIT';
  // Plan management: Admin + Trainer only
  const canEditPlan = hasEditPermission && (isAdmin || user?.role === 'TRAINER');
  // Session logging: Admin + Trainer + Rider
  const canLogSession = hasEditPermission && (isAdmin || user?.role === 'TRAINER' || user?.role === 'RIDER');
  const weekLocked = isWeekInPast(currentWeekStart);

  // Build workout lookup by ID
  const workoutMap = new Map<string, Workout>();
  for (const w of workouts) {
    workoutMap.set(w.id, w);
  }

  const loadHorse = async () => {
    const h = await api<Horse>(`/horses/${horseId}`);
    setHorse(h);
  };

  const loadBlocks = async () => {
    const b = await api<PlanBlock[]>(`/plans/blocks?horseId=${horseId}`);
    setBlocks(b);
    if (b.length > 0 && !activeBlock) {
      setActiveBlock(b[0]);
    }
  };

  const loadWeekData = async () => {
    const ws = toDateStr(currentWeekStart);
    const we = toDateStr(addDays(currentWeekStart, 7));
    const [planned, actual, wk] = await Promise.all([
      api<PlannedSession[]>(`/plans/sessions?horseId=${horseId}&weekStart=${ws}`),
      api<ActualSessionLog[]>(`/sessions?horseId=${horseId}&weekStart=${ws}`),
      api<Workout[]>(`/workouts?horseId=${horseId}&weekStart=${ws}&weekEnd=${we}`).catch(() => [] as Workout[]),
    ]);
    setPlannedSessions(planned);
    setActualSessions(actual);
    setWorkouts(wk);

    // Fetch unscheduled workouts for each unique applied plan
    const planIds = [...new Set(wk.map((w) => w.appliedPlanId))];
    if (planIds.length > 0) {
      const allUnscheduled = await Promise.all(
        planIds.map((pid) => api<Workout[]>(`/workouts/unscheduled?appliedPlanId=${pid}`).catch(() => [] as Workout[])),
      );
      setUnscheduledWorkouts(allUnscheduled.flat());
    } else {
      setUnscheduledWorkouts([]);
    }
  };

  const loadProgrammes = async () => {
    const p = await api<Programme[]>('/programmes');
    setProgrammes(p);
  };

  useEffect(() => {
    Promise.all([loadHorse(), loadBlocks(), loadProgrammes()])
      .finally(() => setLoading(false));
  }, [horseId]);

  useEffect(() => { loadWeekData(); }, [currentWeekStart, horseId]);

  const getPlannedForSlot = (dayOffset: number, slot: 'AM' | 'PM') => {
    const dateStr = toDateStr(addDays(currentWeekStart, dayOffset));
    return plannedSessions.find((s) => s.date.startsWith(dateStr) && s.slot === slot);
  };

  const getActualForSlot = (dayOffset: number, slot: 'AM' | 'PM') => {
    const dateStr = toDateStr(addDays(currentWeekStart, dayOffset));
    return actualSessions.find((s) => s.date.startsWith(dateStr) && s.slot === slot);
  };

  // Week navigation
  const weekNumber = activeBlock
    ? Math.floor((currentWeekStart.getTime() - new Date(activeBlock.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    : null;

  const blockWeeks = activeBlock
    ? Array.from({ length: activeBlock.numWeeks }, (_, i) => {
        const d = new Date(activeBlock.startDate);
        d.setUTCDate(d.getUTCDate() + i * 7);
        return d;
      })
    : [];

  // ─── Handlers ──────────────────────────────────────────────

  const handleCreateBlock = async (e: FormEvent) => {
    e.preventDefault();
    await api('/plans/blocks', {
      method: 'POST',
      body: JSON.stringify({
        horseId,
        name: blockForm.name,
        startDate: blockForm.startDate,
        numWeeks: parseInt(blockForm.numWeeks),
        programmeId: blockForm.programmeId || null,
      }),
    });
    setShowNewBlock(false);
    setBlockForm({ name: '', startDate: '', numWeeks: '6', programmeId: '' });
    const b = await api<PlanBlock[]>(`/plans/blocks?horseId=${horseId}`);
    setBlocks(b);
    if (b.length > 0) setActiveBlock(b[0]);
  };

  const openEditPlanned = (dayOffset: number, slot: 'AM' | 'PM') => {
    const dateStr = toDateStr(addDays(currentWeekStart, dayOffset));
    const existing = getPlannedForSlot(dayOffset, slot);
    setPlannedForm({
      date: dateStr,
      slot,
      sessionType: existing?.sessionType || '',
      description: existing?.description || '',
      durationMinutes: existing?.durationMinutes?.toString() || '',
      intensityRpe: existing?.intensityRpe?.toString() || '',
      notes: existing?.notes || '',
    });
    setEditingSessionId(existing?.id || null);
    setShowEditPlanned(true);
  };

  const handleSavePlanned = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeBlock) return;

    if (editingSessionId) {
      await api(`/plans/sessions/${editingSessionId}`, {
        method: 'PUT',
        body: JSON.stringify({
          sessionType: plannedForm.sessionType || null,
          description: plannedForm.description || null,
          durationMinutes: plannedForm.durationMinutes ? parseInt(plannedForm.durationMinutes) : null,
          intensityRpe: plannedForm.intensityRpe ? parseInt(plannedForm.intensityRpe) : null,
          notes: plannedForm.notes || null,
        }),
      });
    } else {
      await api('/plans/sessions', {
        method: 'POST',
        body: JSON.stringify({
          planBlockId: activeBlock.id,
          horseId,
          date: plannedForm.date,
          slot: plannedForm.slot,
          sessionType: plannedForm.sessionType || null,
          description: plannedForm.description || null,
          durationMinutes: plannedForm.durationMinutes ? parseInt(plannedForm.durationMinutes) : null,
          intensityRpe: plannedForm.intensityRpe ? parseInt(plannedForm.intensityRpe) : null,
          notes: plannedForm.notes || null,
        }),
      });
    }
    setShowEditPlanned(false);
    loadWeekData();
  };

  const openLogActual = (dayOffset: number, slot: 'AM' | 'PM') => {
    const dateStr = toDateStr(addDays(currentWeekStart, dayOffset));
    const existing = getActualForSlot(dayOffset, slot);
    const planned = getPlannedForSlot(dayOffset, slot);
    const workout = planned?.workoutId ? workoutMap.get(planned.workoutId) : undefined;
    setLogPlannedRef(planned || null);
    setLogWorkoutRef(workout || null);
    setActualForm({
      date: dateStr,
      slot,
      sessionType: existing?.sessionType || planned?.sessionType || '',
      durationMinutes: existing?.durationMinutes?.toString() || '',
      intensityRpe: existing?.intensityRpe?.toString() || '',
      notes: existing?.notes || '',
      rider: existing?.rider || '',
      deviationReason: existing?.deviationReason || '',
      existingId: existing?.id || '',
    });
    setShowLogActual(true);
  };

  const fillCompletedAsPlanned = () => {
    const workout = logWorkoutRef;
    const planned = logPlannedRef;

    if (workout && !workout.isRest) {
      const entry = workout.currentData;
      // Use midpoint of duration range, or the single value
      const dur = entry.durationMin != null && entry.durationMax != null
        ? Math.round((entry.durationMin + entry.durationMax) / 2)
        : entry.durationMin ?? entry.durationMax ?? null;
      // Use midpoint of RPE range, or the single value
      const rpe = entry.intensityRpeMin != null && entry.intensityRpeMax != null
        ? Math.round((entry.intensityRpeMin + entry.intensityRpeMax) / 2)
        : entry.intensityRpeMin ?? entry.intensityRpeMax ?? null;

      // Build a readable summary for notes
      const noteParts: string[] = [];
      if (entry.blocks.length > 0 && !(entry.blocks.length === 1 && entry.blocks[0].name === 'Main' && entry.blocks[0].text === entry.title)) {
        noteParts.push(entry.blocks.map((b) => `${b.name}: ${b.text}`).join('\n'));
      }
      if (entry.intensityLabel) noteParts.push(`Intensity: ${entry.intensityLabel}`);
      if (entry.substitution) noteParts.push(`Substitution option: ${entry.substitution}`);

      setActualForm((prev) => ({
        ...prev,
        sessionType: entry.title || entry.category || prev.sessionType,
        durationMinutes: dur != null ? dur.toString() : prev.durationMinutes,
        intensityRpe: rpe != null ? rpe.toString() : prev.intensityRpe,
        notes: noteParts.length > 0 ? noteParts.join('\n') : 'Completed as planned',
        deviationReason: '',
      }));
    } else if (planned) {
      setActualForm((prev) => ({
        ...prev,
        sessionType: planned.sessionType || prev.sessionType,
        durationMinutes: planned.durationMinutes?.toString() || prev.durationMinutes,
        intensityRpe: planned.intensityRpe?.toString() || prev.intensityRpe,
        notes: planned.notes || planned.description || 'Completed as planned',
        deviationReason: '',
      }));
    }
  };

  const handleSaveActual = async (e: FormEvent) => {
    e.preventDefault();
    const planned = plannedSessions.find(
      (s) => s.date.startsWith(actualForm.date) && s.slot === actualForm.slot
    );
    const body = {
      horseId,
      date: actualForm.date,
      slot: actualForm.slot,
      plannedSessionId: planned?.id || null,
      sessionType: actualForm.sessionType || null,
      durationMinutes: actualForm.durationMinutes ? parseInt(actualForm.durationMinutes) : null,
      intensityRpe: actualForm.intensityRpe ? parseInt(actualForm.intensityRpe) : null,
      notes: actualForm.notes || null,
      rider: actualForm.rider || null,
      deviationReason: actualForm.deviationReason || null,
    };

    if (actualForm.existingId) {
      await api(`/sessions/${actualForm.existingId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/sessions', { method: 'POST', body: JSON.stringify(body) });
    }
    setShowLogActual(false);
    loadWeekData();
  };

  const openAudit = async (sessionId: string) => {
    const entries = await api<AuditEntry[]>(`/sessions/${sessionId}/audit`);
    setAuditEntries(entries);
    setShowAudit(true);
  };

  const handleCopyWeek = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeBlock) return;
    await api('/plans/copy-week', {
      method: 'POST',
      body: JSON.stringify({
        horseId,
        planBlockId: activeBlock.id,
        sourceWeekStart: toDateStr(currentWeekStart),
        targetWeekStart: copyTargetWeek,
      }),
    });
    setShowCopyWeek(false);
    loadWeekData();
  };

  // ─── Workout action handlers ──────────────────────────────

  const handleResetWorkout = async (workoutId: string) => {
    if (!confirm('Reset this workout to its original programme data?')) return;
    await api(`/workouts/${workoutId}/reset`, { method: 'POST' });
    loadWeekData();
  };

  const openMoveModal = (workoutId: string) => {
    setMoveWorkoutId(workoutId);
    setMoveForm({ targetDate: '', slot: 'AM' });
    setMoveError('');
    setShowMoveModal(true);
  };

  const handleMoveWorkout = async (e: FormEvent) => {
    e.preventDefault();
    if (!moveWorkoutId) return;
    setMoveLoading(true);
    setMoveError('');
    try {
      await api(`/workouts/${moveWorkoutId}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ targetDate: moveForm.targetDate, slot: moveForm.slot }),
      });
      setShowMoveModal(false);
      loadWeekData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Move failed';
      setMoveError(msg);
    } finally {
      setMoveLoading(false);
    }
  };

  // ─── Rich workout card component ─────────────────────────

  const WorkoutCard = ({ workout, planned, slot, dayIdx }: { workout: Workout; planned: PlannedSession; slot: 'AM' | 'PM'; dayIdx: number }) => {
    const entry = workout.currentData;
    const isRest = workout.isRest;
    const isModified = JSON.stringify(workout.currentData) !== JSON.stringify(workout.baselineData);
    const progName = workout.appliedPlan?.programmeVersion?.programme?.name;

    return (
      <div className={`rounded p-1.5 ${isRest ? 'bg-gray-50 border border-gray-200' : 'bg-purple-50 border border-purple-200'}`}>
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-gray-400 uppercase">
            {isRest ? 'Rest' : 'Programme'}
          </span>
          {isModified && (
            <span className="text-[9px] text-amber-600 font-medium">modified</span>
          )}
        </div>
        {!isRest && (
          <>
            <div className="font-medium text-purple-800 text-[11px] leading-tight">{entry.title}</div>
            {entry.category && entry.category.toLowerCase() !== entry.title.toLowerCase() && (
              <div className="text-[10px] text-purple-500">{entry.category}</div>
            )}
            {formatDuration(entry) && (
              <div className="text-[10px] text-gray-500">{formatDuration(entry)}</div>
            )}
            {formatIntensity(entry) && (
              <div className="text-[10px] text-gray-500">{formatIntensity(entry)}</div>
            )}
            {entry.blocks.length > 0 && (
              <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={entry.blocks.map(b => `${b.name}: ${b.text}`).join(', ')}>
                {entry.blocks.length} block{entry.blocks.length !== 1 ? 's' : ''}
              </div>
            )}
            {entry.substitution && (
              <div className="text-[10px] text-orange-500 truncate" title={entry.substitution}>Sub: {entry.substitution}</div>
            )}
          </>
        )}
        {isRest && (
          <div className="font-medium text-gray-500 text-[11px]">Rest day</div>
        )}
        {progName && (
          <div className="text-[9px] text-gray-400 truncate mt-0.5" title={progName}>{progName}</div>
        )}
        {/* Action buttons */}
        {canEditPlan && !weekLocked && (
          <div className="flex gap-1 mt-1 flex-wrap">
            <button
              onClick={(e) => { e.stopPropagation(); openEditPlanned(dayIdx, slot); }}
              className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 hover:bg-purple-200"
              title="Edit planned session"
            >
              Edit
            </button>
            {workout.appliedPlan?.status === 'ACTIVE' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handleResetWorkout(workout.id); }}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                  title="Reset to original programme data"
                >
                  Reset
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openMoveModal(workout.id); }}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                  title="Move or swap with another day"
                >
                  Move
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── Legacy planned session card ──────────────────────────

  const LegacyPlannedCard = ({ planned, dayIdx, slot }: { planned: PlannedSession | undefined; dayIdx: number; slot: 'AM' | 'PM' }) => (
    <div
      className={`rounded p-1.5 ${planned ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-dashed border-gray-200'} ${canEditPlan && !weekLocked ? 'cursor-pointer hover:bg-blue-100' : ''}`}
      onClick={() => canEditPlan && !weekLocked && openEditPlanned(dayIdx, slot)}
    >
      <div className="text-[10px] text-gray-400 uppercase">Plan</div>
      {planned ? (
        <>
          <div className="font-medium text-blue-800">{planned.sessionType || '-'}</div>
          {planned.durationMinutes && <div className="text-gray-500">{planned.durationMinutes}min</div>}
          {planned.intensityRpe && <div className="text-gray-500">RPE {planned.intensityRpe}</div>}
        </>
      ) : (
        <div className="text-gray-300">{canEditPlan && !weekLocked ? '+ Add' : '-'}</div>
      )}
    </div>
  );

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link to={`/horses/${horseId}`} className="text-gray-400 hover:text-gray-600">&larr;</Link>
        <h2 className="text-2xl font-bold text-gray-900">{horse?.name} - Planner</h2>
      </div>

      {/* Block selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {blocks.map((b) => (
          <button
            key={b.id}
            onClick={() => {
              setActiveBlock(b);
              setCurrentWeekStart(new Date(b.startDate));
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              activeBlock?.id === b.id ? 'bg-brand-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'
            }`}
          >
            {b.name}
          </button>
        ))}
        {canEditPlan && (
          <button
            onClick={() => {
              const nextMon = getMondayOfWeek(new Date());
              setBlockForm({ name: '', startDate: toDateStr(nextMon), numWeeks: '6', programmeId: '' });
              setShowNewBlock(true);
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed text-gray-400 hover:text-gray-600 hover:border-gray-400"
          >
            + New block
          </button>
        )}
      </div>

      {!activeBlock ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          Create a plan block to start planning sessions.
        </div>
      ) : (
        <>
          {/* Week navigation */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
            >
              &larr; Prev
            </button>

            <div className="flex gap-1 overflow-x-auto">
              {blockWeeks.map((w, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentWeekStart(w)}
                  className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                    toDateStr(w) === toDateStr(currentWeekStart)
                      ? 'bg-brand-600 text-white'
                      : isWeekInPast(w)
                        ? 'bg-gray-100 text-gray-400'
                        : 'bg-white border text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  W{i + 1}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
            >
              Next &rarr;
            </button>

            {canEditPlan && !weekLocked && (
              <button
                onClick={() => {
                  const targets = blockWeeks.filter((w) => toDateStr(w) !== toDateStr(currentWeekStart) && !isWeekInPast(w));
                  if (targets.length > 0) setCopyTargetWeek(toDateStr(targets[0]));
                  setShowCopyWeek(true);
                }}
                className="px-3 py-1.5 border rounded-lg text-sm text-brand-600 hover:bg-brand-50 ml-auto"
              >
                Copy week
              </button>
            )}
          </div>

          {/* Week info bar */}
          <div className="flex items-center gap-3 mb-4 text-sm">
            <span className="font-medium">
              Week {weekNumber} of {activeBlock.numWeeks}
            </span>
            <span className="text-gray-400">
              {currentWeekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              {' - '}
              {addDays(currentWeekStart, 6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {weekLocked && (
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-medium">
                Locked (past week)
              </span>
            )}
          </div>

          {/* Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header row */}
              <div className="grid grid-cols-8 gap-1 mb-1">
                <div className="p-2 text-sm font-medium text-gray-500"></div>
                {DAYS.map((day, i) => {
                  const d = addDays(currentWeekStart, i);
                  const isToday = toDateStr(d) === toDateStr(new Date());
                  return (
                    <div key={day} className={`p-2 text-center text-sm font-medium rounded-lg ${isToday ? 'bg-brand-50 text-brand-700' : 'text-gray-700'}`}>
                      <div>{day}</div>
                      <div className="text-xs text-gray-400">{d.getUTCDate()}</div>
                    </div>
                  );
                })}
              </div>

              {/* AM / PM rows */}
              {(['AM', 'PM'] as const).map((slot) => (
                <div key={slot} className="grid grid-cols-8 gap-1 mb-1">
                  <div className="p-2 text-sm font-medium text-gray-500 flex items-start pt-3">{slot}</div>
                  {DAYS.map((_, dayIdx) => {
                    const planned = getPlannedForSlot(dayIdx, slot);
                    const actual = getActualForSlot(dayIdx, slot);
                    const workout = planned?.workoutId ? workoutMap.get(planned.workoutId) : undefined;
                    return (
                      <div key={dayIdx} className="bg-white border rounded-lg p-2 min-h-[100px] text-xs space-y-1">
                        {/* Planned: either workout-backed or legacy */}
                        {workout ? (
                          <WorkoutCard workout={workout} planned={planned!} slot={slot} dayIdx={dayIdx} />
                        ) : (
                          <LegacyPlannedCard planned={planned} dayIdx={dayIdx} slot={slot} />
                        )}

                        {/* Actual */}
                        <div
                          className={`rounded p-1.5 ${actual ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-dashed border-gray-200'} ${canLogSession ? 'cursor-pointer hover:bg-green-100' : ''}`}
                          onClick={() => canLogSession && openLogActual(dayIdx, slot)}
                        >
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400 uppercase">Actual</span>
                            {actual?._edited && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openAudit(actual.id); }}
                                className="text-[9px] text-amber-600 hover:underline"
                              >
                                edited
                              </button>
                            )}
                          </div>
                          {actual ? (
                            <>
                              <div className="font-medium text-green-800">{actual.sessionType || '-'}</div>
                              {actual.durationMinutes && <div className="text-gray-500">{actual.durationMinutes}min</div>}
                              {actual.intensityRpe && <div className="text-gray-500">RPE {actual.intensityRpe}</div>}
                              {actual.rider && <div className="text-gray-400">{actual.rider}</div>}
                            </>
                          ) : (
                            <div className="text-gray-300">{canLogSession ? '+ Log' : '-'}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Unscheduled workouts tray */}
          {unscheduledWorkouts.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Unscheduled Workouts</h3>
              <div className="bg-white border rounded-xl p-4">
                <div className="flex flex-wrap gap-2">
                  {unscheduledWorkouts.map((w) => {
                    const entry = w.currentData;
                    const progName = w.appliedPlan?.programmeVersion?.programme?.name;
                    return (
                      <div
                        key={w.id}
                        className={`rounded-lg border p-2 text-xs w-36 ${w.isRest ? 'bg-gray-50 border-gray-200' : 'bg-purple-50 border-purple-200'}`}
                      >
                        <div className="font-medium text-purple-800 truncate">{entry.title}</div>
                        {!w.isRest && entry.category && (
                          <div className="text-[10px] text-purple-500">{entry.category}</div>
                        )}
                        {formatDuration(entry) && (
                          <div className="text-[10px] text-gray-500">{formatDuration(entry)}</div>
                        )}
                        <div className="text-[9px] text-gray-400 mt-0.5">
                          W{w.originWeek}D{w.originDay}
                        </div>
                        {progName && (
                          <div className="text-[9px] text-gray-400 truncate" title={progName}>{progName}</div>
                        )}
                        {canEditPlan && w.appliedPlan?.status === 'ACTIVE' && (
                          <button
                            onClick={() => openMoveModal(w.id)}
                            className="mt-1 text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 hover:bg-purple-200"
                          >
                            Schedule
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create block modal */}
      <Modal open={showNewBlock} onClose={() => setShowNewBlock(false)} title="New plan block">
        <form onSubmit={handleCreateBlock} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Block name</label>
            <input value={blockForm.name} onChange={(e) => setBlockForm({ ...blockForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" required placeholder="e.g. Spring 2025 Block 1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date (Monday)</label>
              <input type="date" value={blockForm.startDate} onChange={(e) => setBlockForm({ ...blockForm, startDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weeks</label>
              <input type="number" min="1" max="52" value={blockForm.numWeeks} onChange={(e) => setBlockForm({ ...blockForm, numWeeks: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Programme (optional)</label>
            <select value={blockForm.programmeId} onChange={(e) => setBlockForm({ ...blockForm, programmeId: e.target.value })} className="w-full border rounded-lg px-3 py-2">
              <option value="">None</option>
              {programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700">Create block</button>
        </form>
      </Modal>

      {/* Edit planned session modal */}
      <Modal open={showEditPlanned} onClose={() => setShowEditPlanned(false)} title={`Planned session - ${plannedForm.date} ${plannedForm.slot}`}>
        <form onSubmit={handleSavePlanned} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session type</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {SESSION_PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setPlannedForm({ ...plannedForm, sessionType: p })}
                  className={`px-2 py-1 rounded-full text-xs ${plannedForm.sessionType === p ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {p}
                </button>
              ))}
            </div>
            <input value={plannedForm.sessionType} onChange={(e) => setPlannedForm({ ...plannedForm, sessionType: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="Or type custom..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={plannedForm.description} onChange={(e) => setPlannedForm({ ...plannedForm, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input type="number" min="1" value={plannedForm.durationMinutes} onChange={(e) => setPlannedForm({ ...plannedForm, durationMinutes: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RPE (1-10)</label>
              <input type="number" min="1" max="10" value={plannedForm.intensityRpe} onChange={(e) => setPlannedForm({ ...plannedForm, intensityRpe: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={plannedForm.notes} onChange={(e) => setPlannedForm({ ...plannedForm, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} />
          </div>
          <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700">Save planned session</button>
        </form>
      </Modal>

      {/* Log actual session modal */}
      <Modal open={showLogActual} onClose={() => setShowLogActual(false)} title={`Log session - ${actualForm.date} ${actualForm.slot}`}>
        <form onSubmit={handleSaveActual} className="space-y-3">
          {/* Completed as planned button */}
          {(logPlannedRef || logWorkoutRef) && (
            <button
              type="button"
              onClick={fillCompletedAsPlanned}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 border-green-200 bg-green-50 text-green-700 font-medium text-sm hover:bg-green-100 hover:border-green-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Completed as planned
            </button>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session type</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {SESSION_PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setActualForm({ ...actualForm, sessionType: p })}
                  className={`px-2 py-1 rounded-full text-xs ${actualForm.sessionType === p ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {p}
                </button>
              ))}
            </div>
            <input value={actualForm.sessionType} onChange={(e) => setActualForm({ ...actualForm, sessionType: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="Or type custom..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input type="number" min="1" value={actualForm.durationMinutes} onChange={(e) => setActualForm({ ...actualForm, durationMinutes: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RPE (1-10)</label>
              <input type="number" min="1" max="10" value={actualForm.intensityRpe} onChange={(e) => setActualForm({ ...actualForm, intensityRpe: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rider / Person</label>
            <input value={actualForm.rider} onChange={(e) => setActualForm({ ...actualForm, rider: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={actualForm.notes} onChange={(e) => setActualForm({ ...actualForm, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deviation from plan? (reason)</label>
            <input value={actualForm.deviationReason} onChange={(e) => setActualForm({ ...actualForm, deviationReason: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="Optional" />
          </div>
          <button type="submit" className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700">
            {actualForm.existingId ? 'Update session log' : 'Log session'}
          </button>
        </form>
      </Modal>

      {/* Audit history modal */}
      <Modal open={showAudit} onClose={() => setShowAudit(false)} title="Edit history" wide>
        {auditEntries.length === 0 ? (
          <p className="text-gray-500 text-sm">No edit history.</p>
        ) : (
          <div className="space-y-4">
            {auditEntries.map((entry) => (
              <div key={entry.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{entry.editedBy.name || entry.editedBy.email}</span>
                  <span className="text-xs text-gray-400">{new Date(entry.editedAt).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="font-medium text-red-600 mb-1">Before</div>
                    <pre className="bg-red-50 p-2 rounded overflow-auto">{JSON.stringify(entry.previousData, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="font-medium text-green-600 mb-1">After</div>
                    <pre className="bg-green-50 p-2 rounded overflow-auto">{JSON.stringify(entry.newData, null, 2)}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Copy week modal */}
      <Modal open={showCopyWeek} onClose={() => setShowCopyWeek(false)} title="Copy week">
        <form onSubmit={handleCopyWeek} className="space-y-3">
          <p className="text-sm text-gray-600">
            Copy all planned sessions from the current week to another week.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target week</label>
            <select value={copyTargetWeek} onChange={(e) => setCopyTargetWeek(e.target.value)} className="w-full border rounded-lg px-3 py-2" required>
              {blockWeeks
                .filter((w) => toDateStr(w) !== toDateStr(currentWeekStart) && !isWeekInPast(w))
                .map((w, i) => (
                  <option key={i} value={toDateStr(w)}>
                    Week {blockWeeks.indexOf(w) + 1} ({w.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
                  </option>
                ))}
            </select>
          </div>
          <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700">Copy sessions</button>
        </form>
      </Modal>

      {/* Move workout modal */}
      <Modal open={showMoveModal} onClose={() => setShowMoveModal(false)} title="Move / Reschedule Workout">
        <form onSubmit={handleMoveWorkout} className="space-y-3">
          <p className="text-sm text-gray-600">
            Move this workout to a new date. If the target slot already has a workout, they will be swapped.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target date</label>
            <input
              type="date"
              value={moveForm.targetDate}
              onChange={(e) => setMoveForm({ ...moveForm, targetDate: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slot</label>
            <select
              value={moveForm.slot}
              onChange={(e) => setMoveForm({ ...moveForm, slot: e.target.value as 'AM' | 'PM' })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          {moveError && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{moveError}</div>
          )}
          <button
            type="submit"
            disabled={moveLoading}
            className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {moveLoading ? 'Moving...' : 'Move workout'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
