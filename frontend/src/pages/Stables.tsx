import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Stable } from '../types';
import Modal from '../components/Modal';
import { Button } from '../components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';

export default function Stables() {
  const { user } = useAuth();
  const [stables, setStables] = useState<Stable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', address: '' });
  const [error, setError] = useState('');

  // Edit
  const [editStable, setEditStable] = useState<Stable | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '' });

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Stable | null>(null);

  const isAdmin = user?.role === 'ADMIN';

  const load = async () => {
    try {
      const s = await api<Stable[]>('/stables');
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
      await api('/stables', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, address: form.address || null }),
      });
      setShowAdd(false);
      setForm({ name: '', address: '' });
      toast.success('Stable created');
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create stable');
    }
  };

  const openEdit = (s: Stable) => {
    setEditStable(s);
    setEditForm({ name: s.name, address: s.address || '' });
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editStable) return;
    setError('');
    try {
      await api(`/stables/${editStable.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editForm.name, address: editForm.address || null }),
      });
      setEditStable(null);
      toast.success('Stable updated');
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update stable');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api(`/stables/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('Stable deleted');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-5 flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-60" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Stables</h2>
        {isAdmin && (
          <Button onClick={() => setShowAdd(true)}>Add stable</Button>
        )}
      </div>

      {stables.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          No stables yet. Create one to start grouping your horses by location.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stables.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{s.name}</div>
                  {s.address && <div className="text-sm text-gray-500 mt-0.5">{s.address}</div>}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors" title="Edit">
                      <Pencil className="w-4 h-4 text-gray-400" />
                    </button>
                    <button onClick={() => setDeleteTarget(s)} className="p-1.5 hover:bg-red-50 rounded-md transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {s._count?.horses ?? 0} horse{(s._count?.horses ?? 0) === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add stable modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setError(''); }} title="Add stable">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          <Button type="submit" className="w-full">Create stable</Button>
        </form>
      </Modal>

      {/* Edit stable modal */}
      <Modal open={!!editStable} onClose={() => { setEditStable(null); setError(''); }} title="Edit stable">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        <form onSubmit={handleEdit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          <Button type="submit" className="w-full">Save changes</Button>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete stable">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? Horses in this stable will become unassigned.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
