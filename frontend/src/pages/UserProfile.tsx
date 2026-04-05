import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { PASSWORD_RULES, passwordValid } from '../lib/passwordRules';

interface ProfileData {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  STABLE_LEAD: 'Stable Lead',
  TRAINER: 'Trainer',
  RIDER: 'Rider',
  GROOM: 'Groom',
  OWNER: 'Owner',
};

export default function UserProfile() {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Name form
  const [name, setName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    api<ProfileData>('/users/me')
      .then((p) => { setProfile(p); setName(p.name ?? ''); })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleNameSave = async (e: FormEvent) => {
    e.preventDefault();
    setNameLoading(true);
    try {
      const updated = await api<ProfileData>('/users/me', {
        method: 'PUT',
        body: JSON.stringify({ name: name.trim() || null }),
      });
      setProfile(updated);
      toast.success('Name updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update name');
    } finally {
      setNameLoading(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordTouched(true);
    setPasswordError('');
    if (!passwordValid(newPassword)) {
      setPasswordError('Please meet all password requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setPasswordLoading(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordTouched(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-lg">
        <div className="h-8 bg-gray-100 rounded w-40 animate-pulse" />
        <div className="bg-white rounded-xl border p-6 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">My Profile</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account details</p>
      </div>

      {/* Account info (read-only) */}
      <div className="bg-white rounded-xl border p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Account</h3>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Email</div>
          <div className="text-sm text-gray-900">{profile?.email}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Role</div>
          <div className="text-sm text-gray-900">{ROLE_LABELS[authUser?.role ?? ''] ?? authUser?.role}</div>
        </div>
      </div>

      {/* Name */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Display name</h3>
        <form onSubmit={handleNameSave} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Your display name"
            />
          </div>
          <Button type="submit" disabled={nameLoading}>
            {nameLoading ? 'Saving...' : 'Save name'}
          </Button>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Change password</h3>
        {passwordError && (
          <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{passwordError}</div>
        )}
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPasswordTouched(true); }}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
              minLength={12}
            />
            {passwordTouched && newPassword.length > 0 && (
              <ul className="mt-2 space-y-1">
                {PASSWORD_RULES.map((r) => (
                  <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.test(newPassword) ? 'text-green-600' : 'text-gray-400'}`}>
                    <span>{r.test(newPassword) ? '✓' : '○'}</span>
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>
          <Button type="submit" disabled={passwordLoading}>
            {passwordLoading ? 'Updating...' : 'Update password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
