import { useEffect, useState, FormEvent } from 'react';
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

  const isAdmin = user?.role === 'ADMIN';

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
        {isAdmin && (
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
              <div className="text-xs text-gray-400 mt-2">{p._count?.planBlocks || 0} plan blocks</div>
              {isAdmin && (
                <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:underline mt-2">Delete</button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New programme">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} />
          </div>
          <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700">Create</button>
        </form>
      </Modal>
    </div>
  );
}
