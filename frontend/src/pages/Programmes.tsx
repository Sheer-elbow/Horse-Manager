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
import { MoreVertical, Pencil, Trash2, Eye, Layers, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

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

  // Apply modal
  const [applyVersion, setApplyVersion] = useState<{ programmeId: string; versionId: string; programmeName: string; version: number } | null>(null);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [applyForm, setApplyForm] = useState({ horseId: '', startDate: '' });
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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
    try {
      const v = await api<ProgrammeVersion[]>(`/programmes/${p.id}/versions`);
      if (v.length === 0) { toast.error('No versions found.'); return; }
      const full = await api<ProgrammeVersion>(`/programmes/${p.id}/versions/${v[0].id}`);
      if (!full.manualHtml) { toast.error('No manual included in this version.'); return; }
      const blob = new Blob([full.manualHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
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

  const openApply = async (programmeId: string, versionId: string, programmeName: string, version: number) => {
    setApplyVersion({ programmeId, versionId, programmeName, version });
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

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

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
            <div key={p.id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
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
                  <div className="font-semibold text-gray-900">{p.name}</div>
                )}
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  {isVersioned(p) ? (
                    statusBadge(p.status!)
                  ) : (
                    <Badge variant="info">Legacy</Badge>
                  )}
                  {canManage && renamingId !== p.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 hover:bg-gray-100 rounded-md transition-colors">
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
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setError(''); }} title="New programme" wide>
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm whitespace-pre-line">{error}</div>}

        {/* Upload ZIP package */}
        <form onSubmit={handleZipUpload} className="space-y-3 mb-4">
          <div className="text-sm font-medium text-gray-700">Upload ZIP package (schedule.csv + manual.html)</div>
          <div>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>
          <Button type="submit" disabled={uploading} className="w-full">
            {uploading ? 'Uploading...' : 'Upload ZIP package'}
          </Button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">or legacy methods</span></div>
        </div>

        {/* Upload HTML file (legacy) */}
        <form onSubmit={handleUpload} className="space-y-3 mb-4">
          <div className="text-sm font-medium text-gray-700">Upload HTML programme (legacy)</div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm"
              className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name (optional, defaults to filename)</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Programme name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <Button type="submit" disabled={uploading} variant="secondary" className="w-full">
            {uploading ? 'Uploading...' : 'Upload HTML file'}
          </Button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">or create manually</span></div>
        </div>

        {/* Manual creation (legacy) */}
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <Button type="submit" variant="secondary" className="w-full">Create manually</Button>
        </form>
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
              <div key={v.id} className="border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">
                    v{v.version}
                    <span className="ml-2">{statusBadge(v.status)}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {v.numWeeks} weeks
                    {v.manualFileName && <span className="ml-2">Manual: {v.manualFileName}</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    Created {new Date(v.createdAt).toLocaleDateString()}
                    {v.publishedAt && <span className="ml-2">Published {new Date(v.publishedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 ml-3">
                  {v.status === 'DRAFT' && canManage && (
                    <Button size="sm" variant="outline" onClick={() => handlePublish(v.programmeId, v.id)} className="text-green-600 hover:text-green-700 hover:bg-green-50">
                      Publish
                    </Button>
                  )}
                  {v.status === 'PUBLISHED' && canManage && (
                    <Button size="sm" onClick={() => openApply(v.programmeId, v.id, versionProgramme?.name || '', v.version)}>
                      Apply to horse
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
          </div>
          <Button type="submit" disabled={applying} className="w-full">
            {applying ? 'Applying...' : 'Apply programme'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
