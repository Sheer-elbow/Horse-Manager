import { useEffect, useState, FormEvent, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../api/client';
import { Programme, ProgrammeVersion, Horse } from '../types';
import Modal from '../components/Modal';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu';
import { MoreVertical, Pencil, Trash2, Eye, Layers, BookOpen, ChevronDown, ChevronRight, Grid3X3 } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';

// ─── Programme Builder types & constants ──────────────────────

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CATEGORIES = [
  'Flatwork', 'Jumping', 'Hacking', 'Groundwork', 'Cross-country',
  'Lungeing', 'Fitness', 'Conditioning', 'Stick and ball', 'Chukkas', 'Rest', 'Other',
];

const INTENSITY_LEVELS = [
  { label: 'Easy',      rpeMin: 1, rpeMax: 4 },
  { label: 'Moderate',  rpeMin: 5, rpeMax: 6 },
  { label: 'Hard',      rpeMin: 7, rpeMax: 8 },
  { label: 'Very Hard', rpeMin: 9, rpeMax: 10 },
];

const JUMP_TYPES = ['Upright', 'Oxer', 'Cross-pole', 'Combination', 'Triple bar', 'Water', 'Ditch', 'Bank', 'Mixed'];

const CELL_COLORS: Record<string, string> = {
  Flatwork:         'bg-blue-100 text-blue-700 border-blue-200',
  Jumping:          'bg-orange-100 text-orange-700 border-orange-200',
  Hacking:          'bg-green-100 text-green-700 border-green-200',
  Groundwork:       'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Cross-country':  'bg-red-100 text-red-700 border-red-200',
  Lungeing:         'bg-indigo-100 text-indigo-700 border-indigo-200',
  Fitness:          'bg-pink-100 text-pink-700 border-pink-200',
  Conditioning:     'bg-teal-100 text-teal-700 border-teal-200',
  'Stick and ball': 'bg-lime-100 text-lime-700 border-lime-200',
  Chukkas:          'bg-amber-100 text-amber-700 border-amber-200',
  Rest:             'bg-gray-100 text-gray-400 border-gray-200',
  Other:            'bg-gray-100 text-gray-600 border-gray-200',
};

type BuilderCell = {
  title: string;
  category: string;
  durationMin: number | null;
  durationMax: number | null;
  intensityLabel: string | null;
  intensityRpeMin: number | null;
  intensityRpeMax: number | null;
  blocks: { name: string; text: string }[];
};

type EditForm = {
  title: string;
  category: string;
  durationMin: string;
  durationMax: string;
  // Intensity
  intensityMode: 'rpe' | 'distance';
  intensity: string;       // RPE preset label
  distance: string;
  distanceUnit: 'km' | 'miles';
  pace: string;
  paceUnit: 'min/km' | 'min/mile' | 'km/h' | 'mph';
  // Jumping extras
  jumpHeight: string;
  jumpType: string;
  jumpCount: string;
};

export default function Programmes() {
  const { user } = useAuth();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [viewProgramme, setViewProgramme] = useState<Programme | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Version list modal
  const [versionProgramme, setVersionProgramme] = useState<Programme | null>(null);
  const [versions, setVersions] = useState<ProgrammeVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionError, setVersionError] = useState('');

  // Schedule preview per version row
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ProgrammeVersion | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Apply modal
  const [applyVersion, setApplyVersion] = useState<{ programmeId: string; versionId: string; programmeName: string; version: number; numWeeks: number } | null>(null);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [applyForm, setApplyForm] = useState({ horseId: '', startDate: '' });
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // ─── In-app builder state ─────────────────────────────────
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderProgrammeId, setBuilderProgrammeId] = useState<string | null>(null);
  const [builderProgrammeName, setBuilderProgrammeName] = useState('');
  const [builderNumWeeks, setBuilderNumWeeks] = useState(4);
  const [builderCells, setBuilderCells] = useState<Record<string, BuilderCell>>({});
  const [editCell, setEditCell] = useState<{ week: number; day: number; slot: 'AM' | 'PM' } | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ title: '', category: 'Flatwork', durationMin: '', durationMax: '', intensityMode: 'rpe', intensity: '', distance: '', distanceUnit: 'km', pace: '', paceUnit: 'min/km', jumpHeight: '', jumpType: '', jumpCount: '' });
  const [builderSaving, setBuilderSaving] = useState(false);

  const canManage = user?.role === 'ADMIN' || user?.role === 'TRAINER';

  const load = async () => {
    try {
      const p = await api<Programme[]>('/programmes');
      setProgrammes(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ─── Legacy: manual create ────────────────────────────────

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/programmes', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, description: form.description || null }),
      });
      setShowAdd(false);
      setForm({ name: '', description: '' });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  // ─── Legacy: upload HTML ──────────────────────────────────

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Please select an HTML file');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (form.name) formData.append('name', form.name);
      if (form.description) formData.append('description', form.description);

      await api('/programmes/upload', {
        method: 'POST',
        body: formData,
      });
      setShowAdd(false);
      setForm({ name: '', description: '' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ─── New: upload ZIP package ──────────────────────────────

  const handleZipUpload = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const file = zipInputRef.current?.files?.[0];
    if (!file) {
      setError('Please select a ZIP file');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      await api('/programmes/upload-package', {
        method: 'POST',
        body: formData,
      });
      setShowAdd(false);
      if (zipInputRef.current) zipInputRef.current.value = '';
      setForm({ name: '', description: '' });
      load();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'details' in err.body) {
        const details = (err.body as { details: string[] }).details;
        setError(`${err.message}\n${details.join('\n')}`);
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, appliedCount?: number) => {
    if (appliedCount && appliedCount > 0) {
      toast.error(`Cannot delete: this programme is still applied to ${appliedCount} horse${appliedCount === 1 ? '' : 's'}. Remove it from all horses first.`);
      return;
    }
    setDeleteTarget({ id, name: programmes.find((p) => p.id === id)?.name || 'this programme' });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api(`/programmes/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('Programme deleted');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteTarget(null);
    }
  };

  const startRename = (p: Programme) => {
    setRenamingId(p.id);
    setRenameValue(p.name);
  };

  const handleRename = async (id: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    try {
      await api(`/programmes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmed }),
      });
      setRenamingId(null);
      toast.success('Programme renamed');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  // ─── Version management ───────────────────────────────────

  const openVersions = async (p: Programme) => {
    setVersionProgramme(p);
    setVersionsLoading(true);
    setVersionError('');
    try {
      const v = await api<ProgrammeVersion[]>(`/programmes/${p.id}/versions`);
      setVersions(v);
    } catch (err) {
      setVersionError(err instanceof Error ? err.message : 'Failed to load versions');
    } finally {
      setVersionsLoading(false);
    }
  };

  const openManual = async (p: Programme) => {
    // Open the window synchronously to preserve the user gesture — browsers
    // block window.open() called after an await (async context loses gesture).
    const win = window.open('', '_blank');
    if (!win) { toast.error('Popup blocked — please allow popups for this site.'); return; }
    try {
      const v = await api<ProgrammeVersion[]>(`/programmes/${p.id}/versions`);
      if (v.length === 0) { win.close(); toast.error('No versions found.'); return; }
      const full = await api<ProgrammeVersion>(`/programmes/${p.id}/versions/${v[0].id}`);
      if (!full.manualHtml) { win.close(); toast.error('No manual included in this version.'); return; }
      win.document.open();
      win.document.write(full.manualHtml);
      win.document.close();
    } catch {
      win.close();
      toast.error('Failed to load manual.');
    }
  };

  const handlePublish = async (programmeId: string, versionId: string) => {
    setVersionError('');
    try {
      await api(`/programmes/${programmeId}/versions/${versionId}/publish`, { method: 'POST' });
      const v = await api<ProgrammeVersion[]>(`/programmes/${programmeId}/versions`);
      setVersions(v);
      toast.success('Version published');
      load();
    } catch (err) {
      setVersionError(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  // ─── Apply to horse ───────────────────────────────────────

  const togglePreview = async (programmeId: string, versionId: string) => {
    if (previewVersionId === versionId) {
      setPreviewVersionId(null);
      setPreviewData(null);
      return;
    }
    setPreviewVersionId(versionId);
    setPreviewLoading(true);
    try {
      const full = await api<ProgrammeVersion>(`/programmes/${programmeId}/versions/${versionId}`);
      setPreviewData(full);
    } catch {
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openApply = async (programmeId: string, versionId: string, programmeName: string, version: number, numWeeks: number) => {
    setApplyVersion({ programmeId, versionId, programmeName, version, numWeeks });
    setApplyForm({ horseId: '', startDate: '' });
    setApplyError('');
    try {
      const h = await api<Horse[]>('/horses');
      setHorses(h);
    } catch (err) {
      console.error('Failed to load horses', err);
    }
  };

  const handleApply = async (e: FormEvent) => {
    e.preventDefault();
    if (!applyVersion) return;
    setApplyError('');
    setApplying(true);
    try {
      await api('/applied-plans', {
        method: 'POST',
        body: JSON.stringify({
          horseId: applyForm.horseId,
          programmeVersionId: applyVersion.versionId,
          startDate: applyForm.startDate,
        }),
      });
      setApplyVersion(null);
      toast.success('Programme applied to horse');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'conflictDates' in (err.body as Record<string, unknown>)) {
        const body = err.body as { conflictDates: string[] };
        setApplyError(`Date conflicts: ${body.conflictDates.join(', ')}`);
      } else {
        setApplyError(err instanceof Error ? err.message : 'Apply failed');
      }
    } finally {
      setApplying(false);
    }
  };

  // ─── In-app builder handlers ──────────────────────────────

  const openBuilder = (p: Programme) => {
    setBuilderProgrammeId(p.id);
    setBuilderProgrammeName(p.name);
    setBuilderNumWeeks(4);
    setBuilderCells({});
    setEditCell(null);
    setBuilderOpen(true);
  };

  const handleBuildInApp = async () => {
    const name = form.name.trim();
    if (!name) { setError('Enter a programme name first'); return; }
    setUploading(true);
    try {
      const newProg = await api<Programme>('/programmes', {
        method: 'POST',
        body: JSON.stringify({ name, description: form.description || null }),
      });
      setShowAdd(false);
      setForm({ name: '', description: '' });
      setError('');
      load();
      openBuilder(newProg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create programme');
    } finally {
      setUploading(false);
    }
  };

  const BLANK_FORM: EditForm = { title: '', category: 'Flatwork', durationMin: '', durationMax: '', intensityMode: 'rpe', intensity: '', distance: '', distanceUnit: 'km', pace: '', paceUnit: 'min/km', jumpHeight: '', jumpType: '', jumpCount: '' };

  const selectCell = (week: number, day: number, slot: 'AM' | 'PM') => {
    const key = `${week}-${day}-${slot}`;
    const existing = builderCells[key];
    if (existing) {
      const preset = INTENSITY_LEVELS.find((l) => l.label === existing.intensityLabel);
      // Detect distance/pace label: e.g. "5km @ 6:30min/km"
      const distMatch = existing.intensityLabel?.match(/^([\d.]+)(km|miles)\s*@\s*([\d.:]+)(min\/km|min\/mile|km\/h|mph)$/);
      const jumpHeight = existing.blocks.find((b) => b.name === 'Height')?.text ?? '';
      const jumpType   = existing.blocks.find((b) => b.name === 'Type')?.text ?? '';
      const jumpCount  = existing.blocks.find((b) => b.name === 'Fences')?.text ?? '';
      setEditForm({
        title: existing.title,
        category: existing.category,
        durationMin: existing.durationMin != null ? String(existing.durationMin) : '',
        durationMax: existing.durationMax != null ? String(existing.durationMax) : '',
        intensityMode: distMatch ? 'distance' : 'rpe',
        intensity: preset?.label ?? '',
        distance: distMatch ? distMatch[1] : '',
        distanceUnit: (distMatch?.[2] as 'km' | 'miles') ?? 'km',
        pace: distMatch ? distMatch[3] : '',
        paceUnit: (distMatch?.[4] as EditForm['paceUnit']) ?? 'min/km',
        jumpHeight, jumpType, jumpCount,
      });
    } else {
      setEditForm(BLANK_FORM);
    }
    setEditCell({ week, day, slot });
  };

  const saveEditCell = () => {
    if (!editCell) return;
    const key = `${editCell.week}-${editCell.day}-${editCell.slot}`;
    const isRest = editForm.category === 'Rest' || !editForm.title.trim();
    if (isRest) {
      setBuilderCells((prev) => { const next = { ...prev }; delete next[key]; return next; });
      setEditCell(null);
      return;
    }

    // Intensity
    let intensityLabel: string | null = null;
    let intensityRpeMin: number | null = null;
    let intensityRpeMax: number | null = null;
    if (editForm.intensityMode === 'rpe' && editForm.intensity) {
      const preset = INTENSITY_LEVELS.find((l) => l.label === editForm.intensity);
      intensityLabel = preset?.label ?? editForm.intensity;
      intensityRpeMin = preset?.rpeMin ?? null;
      intensityRpeMax = preset?.rpeMax ?? null;
    } else if (editForm.intensityMode === 'distance' && editForm.distance) {
      intensityLabel = `${editForm.distance}${editForm.distanceUnit} @ ${editForm.pace}${editForm.paceUnit}`;
    }

    // Blocks — jumping extras stored as structured blocks
    const blocks: { name: string; text: string }[] = [];
    if (editForm.category === 'Jumping') {
      if (editForm.jumpHeight) blocks.push({ name: 'Height', text: editForm.jumpHeight });
      if (editForm.jumpType)   blocks.push({ name: 'Type',   text: editForm.jumpType });
      if (editForm.jumpCount)  blocks.push({ name: 'Fences', text: editForm.jumpCount });
    }

    setBuilderCells((prev) => ({
      ...prev,
      [key]: {
        title: editForm.title.trim(),
        category: editForm.category,
        durationMin: editForm.durationMin ? parseInt(editForm.durationMin, 10) : null,
        durationMax: editForm.durationMax ? parseInt(editForm.durationMax, 10) : null,
        intensityLabel,
        intensityRpeMin,
        intensityRpeMax,
        blocks,
      },
    }));
    setEditCell(null);
  };

  const clearEditCell = () => {
    if (!editCell) return;
    const key = `${editCell.week}-${editCell.day}-${editCell.slot}`;
    setBuilderCells((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setEditCell(null);
  };

  const handleSaveBuilder = async () => {
    if (!builderProgrammeId) return;
    setBuilderSaving(true);
    const scheduleData = [];
    for (let w = 1; w <= builderNumWeeks; w++) {
      for (let d = 1; d <= 7; d++) {
        const amCell = builderCells[`${w}-${d}-AM`];
        const pmCell = builderCells[`${w}-${d}-PM`];
        // AM slot — always present (rest if nothing set)
        scheduleData.push({
          week: w, day: d, slot: 'AM',
          ...(amCell ?? { title: 'Rest', category: 'Rest', durationMin: null, durationMax: null, intensityLabel: null, blocks: [] }),
        });
        // PM slot — only if explicitly set
        if (pmCell) {
          scheduleData.push({ week: w, day: d, slot: 'PM', ...pmCell });
        }
      }
    }
    try {
      await api(`/programmes/${builderProgrammeId}/versions`, {
        method: 'POST',
        body: JSON.stringify({ numWeeks: builderNumWeeks, scheduleData }),
      });
      toast.success('Version saved as draft');
      setBuilderOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save version');
    } finally {
      setBuilderSaving(false);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────

  const isVersioned = (p: Programme) => p.status != null;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED': return <Badge variant="success">Published</Badge>;
      case 'DRAFT': return <Badge variant="warning">Draft</Badge>;
      case 'ARCHIVED': return <Badge variant="default">Archived</Badge>;
      default: return null;
    }
  };

  if (loading) return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-gray-200 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Programmes</h2>
        {canManage && (
          <Button onClick={() => setShowAdd(true)}>New programme</Button>
        )}
      </div>

      {programmes.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          No programmes yet. Programmes let you group horses under a shared plan template.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programmes.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                {renamingId === p.id ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleRename(p.id); }}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="border rounded-lg px-2 py-1 text-sm font-semibold flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Escape') setRenamingId(null); }}
                    />
                    <Button size="sm" type="submit">Save</Button>
                    <Button size="sm" variant="ghost" type="button" onClick={() => setRenamingId(null)}>Cancel</Button>
                  </form>
                ) : (
                  <div className="font-semibold text-gray-900 min-w-0 truncate">{p.name}</div>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isVersioned(p) ? (
                    statusBadge(p.status!)
                  ) : (
                    <Badge variant="info">Legacy</Badge>
                  )}
                  {canManage && renamingId !== p.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button aria-label="Programme options" className="p-1 hover:bg-gray-100 rounded-md transition-colors">
                          <MoreVertical className="w-4 h-4 text-gray-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {p.htmlContent && (
                          <DropdownMenuItem onClick={() => setViewProgramme(p)}>
                            <Eye className="w-4 h-4" /> View HTML
                          </DropdownMenuItem>
                        )}
                        {isVersioned(p) && (
                          <>
                            <DropdownMenuItem onClick={() => openVersions(p)}>
                              <Layers className="w-4 h-4" /> Versions
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openManual(p)}>
                              <BookOpen className="w-4 h-4" /> Manual
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem onClick={() => openBuilder(p)}>
                          <Grid3X3 className="w-4 h-4" /> Build version
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => startRename(p)}>
                          <Pencil className="w-4 h-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          destructive
                          disabled={(p._appliedPlanCount ?? 0) > 0}
                          onClick={() => handleDelete(p.id, p._appliedPlanCount)}
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              {p.description && <div className="text-sm text-gray-500 mt-1">{p.description}</div>}
              {p.originalFileName && (
                <div className="text-xs text-blue-600 mt-1">File: {p.originalFileName}</div>
              )}
              {p.horseNames && p.horseNames.length > 0 && (
                <div className="text-xs text-gray-400 mt-1">Horses: {p.horseNames.join(', ')}</div>
              )}
              <div className="text-xs text-gray-400 mt-2">
                {p._count?.planBlocks || 0} plan blocks
                {(p._appliedPlanCount ?? 0) > 0 && (
                  <Badge variant="warning" className="ml-2 text-[10px]">
                    Applied to {p._appliedPlanCount} horse{p._appliedPlanCount === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Delete confirmation modal ─────────────────────────── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete programme">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
        </div>
      </Modal>

      {/* ─── Add programme modal ─────────────────────────────── */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setError(''); setForm({ name: '', description: '' }); }} title="New programme" wide>
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm whitespace-pre-line">{error}</div>}

        {/* Shared name / description */}
        <div className="space-y-2 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Programme name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Spring Flatwork Block" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Two primary paths */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={handleBuildInApp}
            disabled={uploading}
            className="flex flex-col items-center gap-2 p-4 border-2 border-brand-200 rounded-xl bg-brand-50 hover:bg-brand-100 hover:border-brand-400 transition-colors text-center"
          >
            <Grid3X3 className="w-7 h-7 text-brand-600" />
            <div>
              <div className="font-semibold text-sm text-brand-700">Build in-app</div>
              <div className="text-xs text-brand-500 mt-0.5">Visual week×day schedule grid</div>
            </div>
          </button>

          <div className="flex flex-col p-4 border-2 border-gray-200 rounded-xl bg-gray-50">
            <div className="font-semibold text-sm text-gray-700 mb-1">Import ZIP</div>
            <div className="text-xs text-gray-400 mb-2">ZIP with <code>schedule.csv</code> + optional <code>manual.html</code></div>
            <input ref={zipInputRef} type="file" accept=".zip" className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-white file:text-gray-600 hover:file:bg-gray-100 mb-2" />
            <form onSubmit={handleZipUpload} className="mt-auto">
              <Button type="submit" size="sm" variant="outline" disabled={uploading} className="w-full">
                {uploading ? 'Uploading…' : 'Import ZIP'}
              </Button>
            </form>
          </div>
        </div>

        {/* Legacy methods collapsed */}
        <details className="group">
          <summary className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none hover:text-gray-600 list-none">
            <ChevronRight className="w-3.5 h-3.5 group-open:rotate-90 transition-transform shrink-0" />
            Other methods (HTML upload, blank)
          </summary>
          <div className="mt-3 space-y-4 pl-1 border-l-2 border-gray-100 ml-1">
            <form onSubmit={handleUpload} className="space-y-2">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Upload HTML reference doc</div>
              <input ref={fileInputRef} type="file" accept=".html,.htm" className="w-full text-sm text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-600" />
              <Button type="submit" disabled={uploading} variant="secondary" size="sm" className="w-full">{uploading ? 'Uploading...' : 'Upload HTML'}</Button>
            </form>
            <div className="border-t" />
            <form onSubmit={handleAdd} className="space-y-2">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Create blank (no schedule)</div>
              <Button type="submit" variant="secondary" size="sm" className="w-full">Create blank</Button>
            </form>
          </div>
        </details>
      </Modal>

      {/* ─── View programme HTML modal (legacy) ──────────────── */}
      <Modal open={!!viewProgramme} onClose={() => setViewProgramme(null)} title={viewProgramme?.name || 'Programme'} wide>
        {viewProgramme?.htmlContent && (
          <div
            className="prose prose-sm max-w-none overflow-auto max-h-[70vh]"
            dangerouslySetInnerHTML={{ __html: viewProgramme.htmlContent }}
          />
        )}
      </Modal>

      {/* ─── Versions modal ──────────────────────────────────── */}
      <Modal open={!!versionProgramme} onClose={() => { setVersionProgramme(null); setVersionError(''); }} title={`${versionProgramme?.name || ''} — Versions`} wide>
        {versionError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{versionError}</div>}

        {versionsLoading ? (
          <div className="text-center py-6 text-gray-400">Loading versions...</div>
        ) : versions.length === 0 ? (
          <div className="text-center py-6 text-gray-400">No versions found</div>
        ) : (
          <div className="space-y-3">
            {versions.map((v) => (
              <div key={v.id} className="border rounded-lg overflow-hidden">
                <div className="p-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2">
                      v{v.version}
                      {statusBadge(v.status)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {v.numWeeks} weeks
                      {v.manualFileName && <span className="ml-2">· Manual: {v.manualFileName}</span>}
                    </div>
                    <div className="text-xs text-gray-400">
                      Created {new Date(v.createdAt).toLocaleDateString()}
                      {v.publishedAt && <span className="ml-2">· Published {new Date(v.publishedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-3 items-center">
                    <button
                      onClick={() => togglePreview(v.programmeId, v.id)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                    >
                      {previewVersionId === v.id
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                      Preview
                    </button>
                    {v.status === 'DRAFT' && canManage && (
                      <Button size="sm" variant="outline" onClick={() => handlePublish(v.programmeId, v.id)} className="text-green-600 hover:text-green-700 hover:bg-green-50">
                        Publish
                      </Button>
                    )}
                    {v.status === 'PUBLISHED' && canManage && (
                      <Button size="sm" onClick={() => openApply(v.programmeId, v.id, versionProgramme?.name || '', v.version, v.numWeeks)}>
                        Apply to horse
                      </Button>
                    )}
                  </div>
                </div>

                {/* Inline schedule preview */}
                {previewVersionId === v.id && (
                  <div className="border-t bg-gray-50 p-3">
                    {previewLoading ? (
                      <div className="text-xs text-gray-400 text-center py-2">Loading schedule...</div>
                    ) : previewData?.scheduleData && previewData.scheduleData.length > 0 ? (() => {
                      const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                      const byWeek: Record<number, typeof previewData.scheduleData> = {};
                      for (const e of previewData.scheduleData) {
                        if (!byWeek[e.week]) byWeek[e.week] = [];
                        byWeek[e.week]!.push(e);
                      }
                      const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);
                      return (
                        <div className="overflow-x-auto">
                          <table className="text-xs w-full min-w-max border-collapse">
                            <thead>
                              <tr>
                                <th className="text-left pr-3 py-1 text-gray-500 font-medium whitespace-nowrap">Week</th>
                                {DAYS.map((d) => (
                                  <th key={d} className="px-1.5 py-1 text-gray-500 font-medium text-center">{d}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {weeks.map((wk) => (
                                <tr key={wk} className="border-t border-gray-200">
                                  <td className="pr-3 py-1 text-gray-400 font-medium whitespace-nowrap">W{wk}</td>
                                  {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                                    const entry = byWeek[wk]?.find((e) => e.day === day);
                                    return (
                                      <td key={day} className="px-1.5 py-1 text-center">
                                        {entry && !entry.title.toLowerCase().includes('rest') ? (
                                          <div
                                            className="bg-purple-100 text-purple-700 rounded px-1 py-0.5 text-[11px] leading-tight truncate max-w-[64px]"
                                            title={`${entry.title}${entry.durationMin ? ` · ${entry.durationMin}min` : ''}`}
                                          >
                                            {entry.title || entry.category}
                                          </div>
                                        ) : entry ? (
                                          <div className="text-gray-300 text-[11px]">Rest</div>
                                        ) : (
                                          <div className="text-gray-200">–</div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })() : (
                      <div className="text-xs text-gray-400 text-center py-2">No schedule data available</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ─── In-app programme builder modal ─────────────────── */}
      <Modal
        open={builderOpen}
        onClose={() => { setBuilderOpen(false); setEditCell(null); }}
        title={`Build version — ${builderProgrammeName}`}
        wide
      >
        {/* Week count */}
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-700">Weeks:</label>
          <select
            value={builderNumWeeks}
            onChange={(e) => { setBuilderNumWeeks(Number(e.target.value)); setEditCell(null); }}
            className="border rounded-lg px-2 py-1 text-sm"
          >
            {[1,2,3,4,5,6,7,8,9,10,11,12,16,20,24].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">Click any cell to add a session. Blank cells default to Rest.</span>
        </div>

        {/* Grid */}
        <div className="overflow-auto border rounded-lg max-h-64">
          <table className="text-xs w-full border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="px-2 py-2 text-left text-gray-500 font-medium border-b w-12">Week</th>
                {DAYS_SHORT.map((d) => (
                  <th key={d} className="px-1 py-2 text-center text-gray-500 font-medium border-b min-w-[72px]">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: builderNumWeeks }, (_, wi) => {
                const week = wi + 1;
                return (
                  <tr key={week} className="border-b last:border-0">
                    <td className="px-2 py-1 text-gray-400 font-medium whitespace-nowrap">W{week}</td>
                    {[1,2,3,4,5,6,7].map((day) => {
                      return (
                        <td key={day} className="px-1 py-1">
                          <div className="space-y-0.5">
                            {(['AM', 'PM'] as const).map((slot) => {
                              const key = `${week}-${day}-${slot}`;
                              const cell = builderCells[key];
                              const isSelected = editCell?.week === week && editCell?.day === day && editCell?.slot === slot;
                              const colorClass = cell ? (CELL_COLORS[cell.category] ?? CELL_COLORS.Other) : '';
                              return (
                                <button
                                  key={slot}
                                  onClick={() => selectCell(week, day, slot)}
                                  className={`w-full min-h-[24px] rounded border text-left px-1 py-0.5 transition-colors text-[10px] leading-tight ${
                                    isSelected ? 'ring-2 ring-brand-500 ring-offset-1' : ''
                                  } ${
                                    cell
                                      ? colorClass
                                      : 'border-dashed border-gray-200 text-gray-300 hover:border-gray-300 hover:text-gray-400'
                                  }`}
                                >
                                  {cell ? (
                                    <span className="font-medium truncate block max-w-[60px]">{slot} {cell.title}</span>
                                  ) : (
                                    <span className="text-center block w-full">{slot} +</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cell editor */}
        {editCell && (
          <div className="mt-3 border rounded-lg p-3 bg-gray-50 space-y-3">
            <div className="text-sm font-medium text-gray-700">
              Week {editCell.week} · {DAYS_SHORT[editCell.day - 1]} · {editCell.slot}
            </div>

            {/* Title + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Session title</label>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="e.g. Canter work"
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEditCell(); if (e.key === 'Escape') setEditCell(null); }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duration (min)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" min={1} value={editForm.durationMin} onChange={(e) => setEditForm({ ...editForm, durationMin: e.target.value })} placeholder="Min" className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                <span className="text-gray-400 shrink-0">–</span>
                <input type="number" min={1} value={editForm.durationMax} onChange={(e) => setEditForm({ ...editForm, durationMax: e.target.value })} placeholder="Max" className="w-full border rounded-lg px-2 py-1.5 text-sm" />
              </div>
            </div>

            {/* Intensity — RPE or Distance/Pace toggle */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs font-medium text-gray-600">Intensity</label>
                <div className="flex rounded-lg border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, intensityMode: 'rpe' })}
                    className={`px-2.5 py-1 ${editForm.intensityMode === 'rpe' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    RPE
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, intensityMode: 'distance' })}
                    className={`px-2.5 py-1 border-l ${editForm.intensityMode === 'distance' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    Distance / Pace
                  </button>
                </div>
              </div>

              {editForm.intensityMode === 'rpe' ? (
                <select value={editForm.intensity} onChange={(e) => setEditForm({ ...editForm, intensity: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm">
                  <option value="">None</option>
                  {INTENSITY_LEVELS.map((l) => (
                    <option key={l.label} value={l.label}>{l.label} (RPE {l.rpeMin}–{l.rpeMax})</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="number" min={0} step={0.1} value={editForm.distance} onChange={(e) => setEditForm({ ...editForm, distance: e.target.value })} placeholder="Distance" className="w-24 border rounded-lg px-2 py-1.5 text-sm" />
                  <select value={editForm.distanceUnit} onChange={(e) => setEditForm({ ...editForm, distanceUnit: e.target.value as 'km' | 'miles' })} className="border rounded-lg px-2 py-1.5 text-sm">
                    <option value="km">km</option>
                    <option value="miles">miles</option>
                  </select>
                  <span className="text-gray-400 text-xs">@</span>
                  <input type="text" value={editForm.pace} onChange={(e) => setEditForm({ ...editForm, pace: e.target.value })} placeholder="e.g. 6:30" className="w-20 border rounded-lg px-2 py-1.5 text-sm" />
                  <select value={editForm.paceUnit} onChange={(e) => setEditForm({ ...editForm, paceUnit: e.target.value as EditForm['paceUnit'] })} className="border rounded-lg px-2 py-1.5 text-sm">
                    <option value="min/km">min/km</option>
                    <option value="min/mile">min/mi</option>
                    <option value="km/h">km/h</option>
                    <option value="mph">mph</option>
                  </select>
                </div>
              )}
            </div>

            {/* Jumping extras */}
            {editForm.category === 'Jumping' && (
              <div className="border-t pt-3">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Jumping details</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Height</label>
                    <input value={editForm.jumpHeight} onChange={(e) => setEditForm({ ...editForm, jumpHeight: e.target.value })} placeholder="e.g. 80cm" className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Type</label>
                    <select value={editForm.jumpType} onChange={(e) => setEditForm({ ...editForm, jumpType: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm">
                      <option value="">Any</option>
                      {JUMP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">No. of fences</label>
                    <input type="number" min={1} value={editForm.jumpCount} onChange={(e) => setEditForm({ ...editForm, jumpCount: e.target.value })} placeholder="e.g. 8" className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="ghost" onClick={clearEditCell}>Clear cell</Button>
              <Button size="sm" variant="outline" onClick={() => setEditCell(null)}>Cancel</Button>
              <Button size="sm" onClick={saveEditCell}>Save cell</Button>
            </div>
          </div>
        )}

        {/* Category colour legend */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {CATEGORIES.filter((c) => c !== 'Rest').map((c) => (
            <span key={c} className={`text-[11px] px-2 py-0.5 rounded-full border ${CELL_COLORS[c] ?? CELL_COLORS.Other}`}>{c}</span>
          ))}
        </div>

        <div className="flex justify-between items-center mt-4 pt-3 border-t">
          <div className="text-xs text-gray-400">
            {Object.keys(builderCells).length} session{Object.keys(builderCells).length === 1 ? '' : 's'} planned
            {' '}· {builderNumWeeks * 7 - Object.keys(builderCells).length} rest days
          </div>
          <Button onClick={handleSaveBuilder} disabled={builderSaving}>
            {builderSaving ? 'Saving...' : 'Save as draft'}
          </Button>
        </div>
      </Modal>

      {/* ─── Apply to horse modal ────────────────────────────── */}
      <Modal open={!!applyVersion} onClose={() => setApplyVersion(null)} title={`Apply ${applyVersion?.programmeName || ''} v${applyVersion?.version || ''}`}>
        {applyError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{applyError}</div>}

        <form onSubmit={handleApply} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Horse</label>
            <select
              value={applyForm.horseId}
              onChange={(e) => setApplyForm({ ...applyForm, horseId: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              required
            >
              <option value="">Select a horse...</option>
              {horses.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
            <input
              type="date"
              value={applyForm.startDate}
              onChange={(e) => setApplyForm({ ...applyForm, startDate: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              required
            />
            {applyForm.startDate && applyVersion && (
              <p className="text-xs text-gray-500 mt-1.5">
                {applyVersion.numWeeks}-week plan ending{' '}
                <span className="font-medium text-gray-700">
                  {new Date(
                    new Date(applyForm.startDate).getTime() + (applyVersion.numWeeks * 7 - 1) * 24 * 60 * 60 * 1000
                  ).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </p>
            )}
          </div>
          <Button type="submit" disabled={applying} className="w-full">
            {applying ? 'Applying...' : 'Apply programme'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
