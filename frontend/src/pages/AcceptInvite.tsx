import { useState, FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, setTokens } from '../api/client';
import { AuthTokens } from '../types';
import { Button } from '../components/ui/button';
import { PASSWORD_RULES, passwordValid } from '../lib/passwordRules';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar px-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border p-6 text-center">
          <p className="text-gray-700 font-medium">Invalid invite link</p>
          <p className="text-sm text-gray-500 mt-1">This link is missing an invite token. Please check your email and try again.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordTouched(true);
    setError('');
    if (!passwordValid(password)) {
      setError('Please meet all password requirements.');
      return;
    }
    setLoading(true);
    try {
      const data = await api<AuthTokens>('/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, name, password }),
      });
      setTokens(data.accessToken, data.refreshToken);
      window.location.href = '/';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Smart Stable Manager</h1>
          <p className="text-sidebar-muted mt-2">Accept your invitation</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg border p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="How should we address you?"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Choose a password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordTouched(true); }}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
                minLength={12}
              />
              {passwordTouched && password.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {PASSWORD_RULES.map((r) => (
                    <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.test(password) ? 'text-green-600' : 'text-gray-400'}`}>
                      <span>{r.test(password) ? '✓' : '○'}</span>
                      {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Setting up...' : 'Create account'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
