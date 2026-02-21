import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { User, InviteToken } from '../types';
import Modal from '../components/Modal';

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<InviteToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
      await api('/auth/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail }),
      });
      setSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      setShowInvite(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    await api(`/users/${userId}`, { method: 'DELETE' });
    load();
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Users</h2>
        <button onClick={() => setShowInvite(true)} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
          Invite user
        </button>
      </div>

      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>}

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
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.name || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {u.assignments?.map((a) => a.horse?.name).filter(Boolean).join(', ') || '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== currentUser?.id && (
                    <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 hover:underline text-xs">Delete</button>
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Expires</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{inv.email}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {inv.usedAt ? (
                      <span className="text-xs text-green-600">Accepted</span>
                    ) : new Date(inv.expiresAt) < new Date() ? (
                      <span className="text-xs text-red-500">Expired</span>
                    ) : (
                      <span className="text-xs text-amber-600">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite user">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
        <form onSubmit={handleInvite} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2" required placeholder="user@example.com" />
          </div>
          <p className="text-xs text-gray-500">An invite link will be sent to this email. The invite expires in 72 hours.</p>
          <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700">Send invite</button>
        </form>
      </Modal>
    </div>
  );
}
