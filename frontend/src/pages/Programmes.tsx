import { useEffect, useState, FormEvent, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../api/client';
import { Programme, ProgrammeVersion, Horse } from '../types';
import Modal from '../components/Modal';

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

  // Manual viewer modal
  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualHtml, setManualHtml] = useState<string | null>(null);
  const [manualLoading, setManualLoading] = useState(false);

  // Apply modal
  const [applyVersion, setApplyVersion] = useState<{ programmeId: string; versionId: string; programmeName: string; version: number } | null>(null);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [applyForm, setApplyForm] = useState({ horseId: '', startDate: '' });
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');

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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this programme?')) return;
    await api(`/programmes/${id}`, { method: 'DELETE' });
    load();
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
    setManualTitle(p.name);
    setManualHtml(null);
    setManualLoading(true);
    setShowManual(true);
    try {
      const v = await api<ProgrammeVersion[]>(`/programmes/${p.id}/versions`);
      if (v.length === 0) {
        setManualHtml('<p>No versions found.</p>');
        return;
      }
      const full = await api<ProgrammeVersion>(`/programmes/${p.id}/versions/${v[0].id}`);
      setManualHtml(full.manualHtml || null);
    } catch {
      setManualHtml('<p class="text-red-600">Failed to load manual.</p>');
    } finally {
      setManualLoading(false);
    }
  };

  const handlePublish = async (programmeId: string, versionId: string) => {
    setVersionError('');
    try {
      await api(`/programmes/${programmeId}/versions/${versionId}/publish`, { method: 'POST' });
      // Reload versions and programme list
      const v = await api<ProgrammeVersion[]>(`/programmes/${programmeId}/versions`);
      setVersions(v);
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
      case 'PUBLISHED': return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">Published</span>;
      case 'DRAFT': return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 font-medium">Draft</span>;
      case 'ARCHIVED': return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500 font-medium">Archived</span>;
      default: return null;
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Programmes</h2>
        {canManage && (
          <button onClick={() => setShowAdd(true)} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
            New programme
          </button>
        )}
      </div>

      {programmes.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          No programmes yet. Programmes let you group horses under a shared plan template.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programmes.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border p-5">
              <div className="flex items-start justify-between">
                <div className="font-semibold text-gray-900">{p.name}</div>
                <div className="flex gap-1.5 ml-2 shrink-0">
                  {isVersioned(p) ? (
                    statusBadge(p.status!)
                  ) : (
                    <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 font-medium">Legacy</span>
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
              <div className="text-xs text-gray-400 mt-2">{p._count?.planBlocks || 0} plan blocks</div>

              <div className="flex flex-wrap gap-2 mt-3">
                {/* Legacy: view HTML */}
                {p.htmlContent && (
                  <button onClick={() => setViewProgramme(p)} className="text-xs text-blue-600 hover:underline">View HTML</button>
                )}
                {/* Versioned: manage versions */}
                {isVersioned(p) && (
                  <button onClick={() => openVersions(p)} className="text-xs text-brand-600 hover:underline">Versions</button>
                )}
                {/* View manual from latest version */}
                {isVersioned(p) && (
                  <button onClick={() => openManual(p)} className="text-xs text-indigo-600 hover:underline">Manual</button>
                )}
                {canManage && (
                  <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Add programme modal ─────────────────────────────── */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setError(''); }} title="New programme" wide>
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm whitespace-pre-line">{error}</div>}

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
          <button type="submit" disabled={uploading} className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload ZIP package'}
          </button>
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
          <button type="submit" disabled={uploading} className="w-full bg-gray-600 text-white py-2 rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload HTML file'}
          </button>
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
          <button type="submit" className="w-full bg-gray-600 text-white py-2 rounded-lg font-medium hover:bg-gray-700">Create manually</button>
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

      {/* ─── Manual viewer modal ─────────────────────────────── */}
      <Modal open={showManual} onClose={() => setShowManual(false)} title={`${manualTitle} — Manual`} wide>
        {manualLoading ? (
          <div className="text-center py-8 text-gray-400">Loading manual...</div>
        ) : manualHtml ? (
          <div
            className="prose prose-sm max-w-none overflow-auto max-h-[70vh]"
            dangerouslySetInnerHTML={{ __html: manualHtml }}
          />
        ) : (
          <div className="text-center py-8 text-gray-400">No manual included in this programme version.</div>
        )}
      </Modal>

      {/* ─── Versions modal ──────────────────────────────────── */}
      <Modal open={!!versionProgramme} onClose={() => { setVersionProgramme(null); setVersionError(''); }} title={`${versionProgramme?.name || ''} — Versions`} wide>
        {versionError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{versionError}</div>}

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
                    <button
                      onClick={() => handlePublish(v.programmeId, v.id)}
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                    >
                      Publish
                    </button>
                  )}
                  {v.status === 'PUBLISHED' && canManage && (
                    <button
                      onClick={() => openApply(v.programmeId, v.id, versionProgramme?.name || '', v.version)}
                      className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700"
                    >
                      Apply to horse
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ─── Apply to horse modal ────────────────────────────── */}
      <Modal open={!!applyVersion} onClose={() => setApplyVersion(null)} title={`Apply ${applyVersion?.programmeName || ''} v${applyVersion?.version || ''}`}>
        {applyError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{applyError}</div>}

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
          <button
            type="submit"
            disabled={applying}
            className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {applying ? 'Applying...' : 'Apply programme'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
