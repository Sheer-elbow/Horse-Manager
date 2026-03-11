import { useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Horse, Stable } from '../types';
import Modal from '../components/Modal';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/Skeleton';
import { AuthenticatedImage } from '../components/AuthenticatedImage';

export default function HorseList() {
  const { user } = useAuth();
  const [horses, setHorses] = useState<Horse[]>([]);
  const [stables, setStables] = useState<Stable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', age: '', breed: '', stableId: '', ownerNotes: '', identifyingInfo: '' });
  const [error, setError] = useState('');
  const [stableFilter, setStableFilter] = useState<string>('all');

  const load = async () => {
    try {
      const [h, s] = await Promise.all([
        api<Horse[]>('/horses'),
        api<Stable[]>('/stables'),
      ]);
      setHorses(h);
      setStables(s);
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
      await api('/horses', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          age: form.age ? parseInt(form.age) : null,
          breed: form.breed || null,
          stableId: form.stableId || null,
          ownerNotes: form.ownerNotes || null,
          identifyingInfo: form.identifyingInfo || null,
        }),
      });
      setShowAdd(false);
      setForm({ name: '', age: '', breed: '', stableId: '', ownerNotes: '', identifyingInfo: '' });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add horse');
    }
  };

  const filteredHorses = stableFilter === 'all'
    ? horses
    : stableFilter === 'none'
      ? horses.filter((h) => !h.stableId)
      : horses.filter((h) => h.stableId === stableFilter);

  if (loading) return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-5">
            <div className="flex items-center gap-4 mb-3">
              <Skeleton className="w-16 h-16 shrink-0" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Horses</h2>
        <div className="flex items-center gap-3">
          {stables.length > 0 && (
            <select
              value={stableFilter}
              onChange={(e) => setStableFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="all">All stables</option>
              {stables.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="none">No stable</option>
            </select>
          )}
          {(user?.role === 'ADMIN' || user?.role === 'OWNER') && (
            <Button onClick={() => setShowAdd(true)}>Add horse</Button>
          )}
        </div>
      </div>

      {filteredHorses.length === 0 ? (
        <p className="text-gray-500">{horses.length === 0 ? 'No horses yet.' : 'No horses in this stable.'}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredHorses.map((h) => (
            <Link key={h.id} to={`/horses/${h.id}`} className="bg-white rounded-xl border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 mb-3">
                {h.photoUrl ? (
                  <AuthenticatedImage src={h.photoUrl} alt={h.name} className="w-16 h-16 rounded-lg object-cover border shrink-0" fallback={<div className="w-16 h-16 rounded-lg bg-gray-100 border flex items-center justify-center text-gray-300 text-2xl shrink-0">&#x1f40e;</div>} />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-100 border flex items-center justify-center text-gray-300 text-2xl shrink-0">&#x1f40e;</div>
                )}
                <div className="font-semibold text-gray-900 text-lg">{h.name}</div>
              </div>
              <div className="space-y-1">
                {h.breed && <div className="text-sm text-gray-500">Breed: {h.breed}</div>}
                {h.age && <div className="text-sm text-gray-500">Age: {h.age}</div>}
                {h.stable && <div className="text-sm text-gray-400">Stable: {h.stable.name}</div>}
                {!h.stable && h.stableLocation && <div className="text-sm text-gray-400">Location: {h.stableLocation}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add horse">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
              <input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Breed</label>
              <input value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stable</label>
            <select
              value={form.stableId}
              onChange={(e) => setForm({ ...form, stableId: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">No stable</option>
              {stables.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Identifying info</label>
            <input value={form.identifyingInfo} onChange={(e) => setForm({ ...form, identifyingInfo: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner notes</label>
            <textarea value={form.ownerNotes} onChange={(e) => setForm({ ...form, ownerNotes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} />
          </div>
          <Button type="submit" className="w-full">Add horse</Button>
        </form>
      </Modal>
    </div>
  );
}
