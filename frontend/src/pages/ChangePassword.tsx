import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { PasswordInput } from '../components/ui/password-input';
import { PASSWORD_RULES, passwordValid } from '../lib/passwordRules';

export default function ChangePassword() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const passwordsMatch = newPassword === confirm;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError('');

    if (!passwordValid(newPassword)) {
      setError('Please meet all password requirements below.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (user) {
        updateUser({ ...user, mustChangePassword: false });
      }
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Change Password</h1>
          {user?.mustChangePassword && (
            <p className="text-amber-400 mt-2 text-sm">
              You must set a new password before continuing. Use the temporary password you were given as your current password.
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-lg border p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setTouched(true); }}
                required
                minLength={12}
              />
              {touched && newPassword.length > 0 && (
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
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {touched && confirm.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Changing...' : 'Change password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
