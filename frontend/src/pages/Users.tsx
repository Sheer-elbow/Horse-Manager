import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { User, InviteToken } from '../types';
import Modal from '../components/Modal';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<InviteToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: '' as User['role'] });
  const [inviteRole, setInviteRole] = useState<'TRAINER' | 'RIDER' | 'OWNER'>('RIDER');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const load = async () => {
    try {
      const [u, inv] = await Promise.all([
        api<User[]>('/users'),
        api<InviteToken[]>('/auth/invites'),
      ]);
      setUsers(u);
      setInvites(inv);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const result = await api<{ message: string; inviteUrl?: string; emailError?: string }>('/auth/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (result.emailError) {
        setSuccess(`${result.message}\n\nInvite link: ${result.inviteUrl}`);
      } else {
        toast.success(`Invite sent to ${inviteEmail}`);
      }
      setInviteEmail('');
      setShowInvite(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    }
  };

  const openEditUser = (u: User) => {
    setEditUser(u);
    setEditForm({ name: u.name || '', role: u.role });
  };

  const handleEditUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      await api(`/users/${editUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editForm.name || null, role: editForm.role }),
      });
      setEditUser(null);
      toast.success('User updated');
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const u = users.find((u) => u.id === userId);
    setDeleteTarget({ id: userId, name: u?.name || u?.email || 'this user' });
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api(`/users/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('User deleted');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteTarget(null);
    }
  };

  const roleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return <Badge variant="brand">{role}</Badge>;
      case 'TRAINER': return <Badge variant="info">{role}</Badge>;
      case 'RIDER': return <Badge variant="success">{role}</Badge>;
      default: return <Badge variant="warning">{role}</Badge>;
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Users</h2>
        <Button onClick={() => setShowInvite(true)}>Invite user</Button>
      </div>

      {success && (
        <div className={`mb-4 p-3 border rounded-lg text-sm ${success.includes('Invite link') ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {success.split('\n').map((line, i) => (
            <div key={i} className={line.startsWith('Invite link:') ? 'mt-2 font-mono text-xs break-all select-all' : ''}>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Users table */}
      <div className="bg-white rounded-xl border overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Horses</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.name || '-'}</td>
                <td className="px-4 py-3">{roleBadge(u.role)}</td>
                <td className="px-4 py-3 text-gray-500">
                  {u.assignments?.map((a) => a.horse?.name).filter(Boolean).join(', ') || '-'}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Button variant="link" size="sm" onClick={() => openEditUser(u)}>Edit</Button>
                  {u.id !== currentUser?.id && (
                    <Button variant="link" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDeleteUser(u.id)}>Delete</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending invites */}
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Pending invites</h3>
      <div className="bg-white rounded-xl border overflow-hidden">
        {invites.filter((i) => !i.usedAt).length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-500 text-sm">No pending invites</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Expires</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">{inv.email}</td>
                  <td className="px-4 py-3">{roleBadge(inv.role)}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {inv.usedAt ? (
                      <Badge variant="success">Accepted</Badge>
                    ) : new Date(inv.expiresAt) < new Date() ? (
                      <Badge variant="danger">Expired</Badge>
                    ) : (
                      <Badge variant="warning">Pending</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete user confirmation modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete user">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={confirmDeleteUser}>Delete</Button>
        </div>
      </Modal>

      {/* Invite modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite user">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        <form onSubmit={handleInvite} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2" required placeholder="user@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'TRAINER' | 'RIDER' | 'OWNER')} className="w-full border rounded-lg px-3 py-2">
              <option value="RIDER">Rider</option>
              <option value="TRAINER">Trainer</option>
              <option value="OWNER">Owner</option>
            </select>
          </div>
          <p className="text-xs text-gray-500">An invite link will be sent to this email. The invite expires in 72 hours.</p>
          <Button type="submit" className="w-full">Send invite</Button>
        </form>
      </Modal>

      {/* Edit user modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit user">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        <form onSubmit={handleEditUser} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="px-3 py-2 bg-gray-50 border rounded-lg text-sm text-gray-500">{editUser?.email}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="Display name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as User['role'] })} className="w-full border rounded-lg px-3 py-2" disabled={editUser?.id === currentUser?.id}>
              <option value="ADMIN">Admin</option>
              <option value="TRAINER">Trainer</option>
              <option value="RIDER">Rider</option>
              <option value="OWNER">Owner</option>
            </select>
            {editUser?.id === currentUser?.id && <p className="text-xs text-gray-400 mt-1">Cannot change your own role</p>}
          </div>
          <Button type="submit" className="w-full">Save changes</Button>
        </form>
      </Modal>
    </div>
  );
}
