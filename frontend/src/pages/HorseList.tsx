import { useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Horse } from '../types';
import Modal from '../components/Modal';

export default function HorseList() {
  const { user } = useAuth();
  const [horses, setHorses] = useState<Horse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', age: '', breed: '', stableLocation: '', ownerNotes: '', identifyingInfo: '' });
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const h = await api<Horse[]>('/horses');
      setHorses(h);
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
          stableLocation: form.stableLocation || null,
          ownerNotes: form.ownerNotes || null,
          identifyingInfo: form.identifyingInfo || null,
        }),
      });
      setShowAdd(false);
      setForm({ name: '', age: '', breed: '', stableLocation: '', ownerNotes: '', identifyingInfo: '' });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add horse');
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Horses</h2>
        {user?.role === 'ADMIN' && (
          <button onClick={() => setShowAdd(true)} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
            Add horse
          </button>
        )}
      </div>

      {horses.length === 0 ? (
        <p className="text-gray-500">No horses yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {horses.map((h) => (
            <Link key={h.id} to={`/horses/${h.id}`} className="bg-white rounded-xl border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 mb-3">
                {h.photoUrl ? (
                  <img src={h.photoUrl} alt={h.name} className="w-16 h-16 rounded-lg object-cover border shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-100 border flex items-center justify-center text-gray-300 text-2xl shrink-0">&#x1f40e;</div>
                )}
                <div className="font-semibold text-gray-900 text-lg">{h.name}</div>
              </div>
              <div className="space-y-1">
                {h.breed && <div className="text-sm text-gray-500">Breed: {h.breed}</div>}
                {h.age && <div className="text-sm text-gray-500">Age: {h.age}</div>}
                {h.stableLocation && <div className="text-sm text-gray-400">Location: {h.stableLocation}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add horse">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Stable location</label>
            <input value={form.stableLocation} onChange={(e) => setForm({ ...form, stableLocation: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Identifying info</label>
            <input value={form.identifyingInfo} onChange={(e) => setForm({ ...form, identifyingInfo: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner notes</label>
            <textarea value={form.ownerNotes} onChange={(e) => setForm({ ...form, ownerNotes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} />
          </div>
          <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700">Add horse</button>
        </form>
      </Modal>
    </div>
  );
}
