import { useEffect, useState, FormEvent, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Programme } from '../types';
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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this programme?')) return;
    await api(`/programmes/${id}`, { method: 'DELETE' });
    load();
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
              <div className="font-semibold text-gray-900">{p.name}</div>
              {p.description && <div className="text-sm text-gray-500 mt-1">{p.description}</div>}
              {p.originalFileName && (
                <div className="text-xs text-blue-600 mt-1">Uploaded: {p.originalFileName}</div>
              )}
              {p.horseNames && p.horseNames.length > 0 && (
                <div className="text-xs text-gray-400 mt-1">Horses: {p.horseNames.join(', ')}</div>
              )}
              <div className="text-xs text-gray-400 mt-2">{p._count?.planBlocks || 0} plan blocks</div>
              <div className="flex gap-2 mt-2">
                {p.htmlContent && (
                  <button onClick={() => setViewProgramme(p)} className="text-xs text-blue-600 hover:underline">View</button>
                )}
                {canManage && (
                  <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add programme modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setError(''); }} title="New programme">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

        {/* Upload HTML file */}
        <form onSubmit={handleUpload} className="space-y-3 mb-4">
          <div className="text-sm font-medium text-gray-700">Upload HTML programme</div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm"
              className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
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
          <button type="submit" disabled={uploading} className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload HTML file'}
          </button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">or create manually</span></div>
        </div>

        {/* Manual creation */}
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

      {/* View programme HTML modal */}
      <Modal open={!!viewProgramme} onClose={() => setViewProgramme(null)} title={viewProgramme?.name || 'Programme'}>
        {viewProgramme?.htmlContent && (
          <div
            className="prose prose-sm max-w-none overflow-auto max-h-[70vh]"
            dangerouslySetInnerHTML={{ __html: viewProgramme.htmlContent }}
          />
        )}
      </Modal>
    </div>
  );
}
