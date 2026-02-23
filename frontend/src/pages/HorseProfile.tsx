import { useEffect, useState, useRef, FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Horse, User } from '../types';
import Modal from '../components/Modal';

type Tab = 'overview' | 'vet' | 'farrier' | 'vaccinations' | 'expenses';

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
  const [editForm, setEditForm] = useState({ name: '', age: '', breed: '', stableLocation: '', ownerNotes: '', identifyingInfo: '' });

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

  const isAdmin = user?.role === 'ADMIN';
  const canEdit = isAdmin || horse?._permission === 'EDIT';

  const loadHorse = async () => {
    try {
      const h = await api<Horse>(`/horses/${id}`);
      setHorse(h);
      setEditForm({
        name: h.name,
        age: h.age?.toString() || '',
        breed: h.breed || '',
        stableLocation: h.stableLocation || '',
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

  useEffect(() => { loadHorse(); }, [id]);
  useEffect(() => { loadRecords(tab); }, [tab, id]);

  const handleEditHorse = async (e: FormEvent) => {
    e.preventDefault();
    await api(`/horses/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: editForm.name,
        age: editForm.age ? parseInt(editForm.age) : null,
        breed: editForm.breed || null,
        stableLocation: editForm.stableLocation || null,
        ownerNotes: editForm.ownerNotes || null,
        identifyingInfo: editForm.identifyingInfo || null,
      }),
    });
    setEditing(false);
    loadHorse();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this horse? This cannot be undone.')) return;
    await api(`/horses/${id}`, { method: 'DELETE' });
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
    loadHorse();
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    await api(`/horses/${id}/assignments/${assignmentId}`, { method: 'DELETE' });
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
      loadRecords(tab);
    } catch (err: unknown) {
      setRecError(err instanceof Error ? err.message : 'Failed to add record');
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    const endpoint = tab === 'vet' ? 'vet-visits' : tab === 'farrier' ? 'farrier-visits' : tab;
    await api(`/health/${id}/${endpoint}/${recordId}`, { method: 'DELETE' });
    loadRecords(tab);
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!horse) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'vet', label: 'Vet visits' },
    { key: 'farrier', label: 'Farrier' },
    { key: 'vaccinations', label: 'Vaccinations' },
    { key: 'expenses', label: 'Expenses' },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/horses" className="text-gray-400 hover:text-gray-600">&larr;</Link>
        <h2 className="text-2xl font-bold text-gray-900">{horse.name}</h2>
        <Link to={`/horses/${id}/planner`} className="ml-auto bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
          Planner
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Horse photo */}
          <div className="bg-white rounded-xl border p-5">
            <div className="flex items-start gap-5">
              <div className="shrink-0">
                {horse.photoUrl ? (
                  <img src={horse.photoUrl} alt={horse.name} className="w-32 h-32 rounded-xl object-cover border" />
                ) : (
                  <div className="w-32 h-32 rounded-xl bg-gray-100 border flex items-center justify-center text-gray-300 text-4xl">
                    &#x1f40e;
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex flex-col gap-2">
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto} className="text-sm text-brand-600 hover:underline">
                    {uploadingPhoto ? 'Uploading...' : horse.photoUrl ? 'Change photo' : 'Upload photo'}
                  </button>
                  {horse.photoUrl && (
                    <button onClick={handleRemovePhoto} className="text-sm text-red-500 hover:underline">Remove photo</button>
                  )}
                  {photoError && <div className="text-sm text-red-600">{photoError}</div>}
                </div>
              )}
            </div>
          </div>

          {/* Horse details */}
          <div className="bg-white rounded-xl border p-5">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stable location</label>
                  <input value={editForm.stableLocation} onChange={(e) => setEditForm({ ...editForm, stableLocation: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
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
                  <button type="submit" className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700">Save</button>
                  <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-sm border hover:bg-gray-50">Cancel</button>
                </div>
              </form>
            ) : (
              <div>
                <div className="grid grid-cols-2 gap-4">
                  {horse.breed && <div><span className="text-sm text-gray-500">Breed</span><div>{horse.breed}</div></div>}
                  {horse.age && <div><span className="text-sm text-gray-500">Age</span><div>{horse.age}</div></div>}
                  {horse.stableLocation && <div><span className="text-sm text-gray-500">Stable</span><div>{horse.stableLocation}</div></div>}
                  {horse.identifyingInfo && <div><span className="text-sm text-gray-500">ID info</span><div>{horse.identifyingInfo}</div></div>}
                </div>
                {horse.ownerNotes && <div className="mt-4"><span className="text-sm text-gray-500">Notes</span><div className="mt-1">{horse.ownerNotes}</div></div>}
                {isAdmin && (
                  <div className="flex gap-2 mt-4 pt-4 border-t">
                    <button onClick={() => setEditing(true)} className="text-sm text-brand-600 hover:underline">Edit</button>
                    <button onClick={handleDelete} className="text-sm text-red-600 hover:underline">Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Assignments */}
          {isAdmin && (
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">User assignments</h3>
                <button onClick={openAssign} className="text-sm text-brand-600 hover:underline">Assign user</button>
              </div>
              {horse.assignments && horse.assignments.length > 0 ? (
                <div className="space-y-2">
                  {horse.assignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <span className="font-medium">{a.user?.name || a.user?.email}</span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${a.permission === 'EDIT' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {a.permission}
                        </span>
                      </div>
                      <button onClick={() => handleRemoveAssignment(a.id)} className="text-sm text-red-500 hover:underline">Remove</button>
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

      {/* Health / expense records tab */}
      {tab !== 'overview' && (
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold capitalize">{tab === 'vet' ? 'Vet visits' : tab === 'farrier' ? 'Farrier visits' : tab}</h3>
            {canEdit && (
              <button onClick={() => { setRecForm({ date: new Date().toISOString().split('T')[0], notes: '', name: '', dueDate: '', amount: '' }); setShowAddRecord(true); }} className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-brand-700">
                Add record
              </button>
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
                            <img src={r.fileUrl} alt={r.fileName || 'Attachment'} className="max-w-xs max-h-40 rounded-lg border object-cover" />
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
                    <button onClick={() => handleDeleteRecord(r.id)} className="text-xs text-red-500 hover:underline shrink-0 ml-3">Delete</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700">Assign</button>
        </form>
      </Modal>

      {/* Add record modal */}
      <Modal open={showAddRecord} onClose={() => { setShowAddRecord(false); setRecError(''); }} title={`Add ${tab} record`}>
        {recError && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{recError}</div>}
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
          <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700">Save</button>
        </form>
      </Modal>
    </div>
  );
}
