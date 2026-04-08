import { useState, useEffect, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, setTokens } from '../api/client';
import { AuthTokens } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { FormField } from '../components/ui/form-field';
import { PasswordInput } from '../components/ui/password-input';
import { PASSWORD_RULES, passwordValid } from '../lib/passwordRules';

const ROLE_LABELS: Record<string, string> = {
  STABLE_LEAD: 'Stable Lead',
  RIDER: 'Rider',
  GROOM: 'Groom',
  OWNER: 'Owner',
  TRAINER: 'Trainer',
};

interface InvitePreview {
  email: string;
  role: string;
  inviterName: string;
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState('');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<InvitePreview>(`/auth/invite-preview?token=${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch(() => setPreviewError('This invite link is invalid or has expired.'));
  }, [token]);

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
    setError('');
    if (!passwordValid(password)) {
      setError('Please meet all password requirements.');
      return;
    }
    if (!acceptTerms) {
      setError('You must accept the Terms of Service and Privacy Policy.');
      return;
    }
    setLoading(true);
    try {
      const data = await api<AuthTokens>('/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, name, password, acceptTerms: true }),
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
          {/* Invite context banner */}
          {previewError ? (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {previewError}
            </div>
          ) : preview ? (
            <div className="mb-5 p-3 bg-brand-50 border border-brand-100 rounded-lg">
              <p className="text-sm text-brand-800">
                <span className="font-semibold">{preview.inviterName}</span> has invited you to join as a{' '}
                <span className="font-semibold">{ROLE_LABELS[preview.role] ?? preview.role}</span>.
              </p>
              <p className="text-xs text-brand-600 mt-0.5">Invite sent to {preview.email}</p>
            </div>
          ) : (
            /* Loading skeleton */
            <div className="mb-5 h-14 rounded-lg bg-gray-100 animate-pulse" />
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Your name" htmlFor="name">
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How should we address you?"
                autoComplete="name"
                required
              />
            </FormField>
            <div>
              <FormField label="Choose a password" htmlFor="password">
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={12}
                />
              </FormField>
              <ul className="mt-2 space-y-1">
                {PASSWORD_RULES.map((r) => (
                  <li key={r.label} className={`flex items-center gap-1.5 text-xs transition-colors ${r.test(password) ? 'text-green-600' : 'text-gray-400'}`}>
                    <span>{r.test(password) ? '✓' : '○'}</span>
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="acceptTerms"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="acceptTerms" className="text-sm text-gray-600">
                I agree to the{' '}
                <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Terms of Service</Link>
                {' '}and{' '}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Privacy Policy</Link>
              </label>
            </div>
            <Button type="submit" disabled={loading || !acceptTerms || !!previewError} className="w-full">
              {loading ? 'Setting up...' : 'Create account'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
