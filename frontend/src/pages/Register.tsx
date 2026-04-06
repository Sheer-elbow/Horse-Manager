import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, setTokens } from '../api/client';
import { AuthTokens } from '../types';
import { Button } from '../components/ui/button';
import { PasswordInput } from '../components/ui/password-input';
import { PASSWORD_RULES, passwordValid } from '../lib/passwordRules';

type AccountType = 'owner' | 'stable';

export default function Register() {
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [accountType, setAccountType] = useState<AccountType>('owner');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [stableName, setStableName] = useState('');
  const [stableAddress, setStableAddress] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordTouched(true);
    setError('');
    if (!passwordValid(password)) {
      setError('Please meet all password requirements.');
      return;
    }
    if (!acceptTerms) {
      setError('You must accept the Terms of Service and Privacy Policy.');
      return;
    }
    if (accountType === 'stable' && !stableName.trim()) {
      setError('Please enter a stable name.');
      return;
    }
    setLoading(true);
    try {
      const data = await api<AuthTokens & { user: { id: string; email: string; name: string | null; role: string; mustChangePassword: boolean } }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          acceptTerms: true,
          stableName: accountType === 'stable' ? stableName.trim() : undefined,
          stableAddress: accountType === 'stable' && stableAddress.trim() ? stableAddress.trim() : undefined,
        }),
      });
      setTokens(data.accessToken, data.refreshToken);
      window.location.href = '/';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Smart Stable Manager</h1>
          <p className="text-sidebar-muted mt-2">Create your account</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg border p-6">
          {step === 'type' ? (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">How will you use Smart Stable Manager?</h2>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setAccountType('owner')}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                    accountType === 'owner' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">I own horses</div>
                  <div className="text-sm text-gray-500 mt-0.5">Track health records, training plans and costs for your horses.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('stable')}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                    accountType === 'stable' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">I run a stable</div>
                  <div className="text-sm text-gray-500 mt-0.5">Manage a yard, staff, and multiple horses. Invite your team and clients.</div>
                </button>
              </div>
              <Button className="w-full" onClick={() => setStep('details')}>
                Continue
              </Button>
              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link to="/login" className="text-brand-600 hover:underline">Sign in</Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <PasswordInput
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordTouched(true); }}
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

              {accountType === 'stable' && (
                <>
                  <div className="border-t pt-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">Your stable</div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Stable name</label>
                        <input
                          type="text"
                          value={stableName}
                          onChange={(e) => setStableName(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          placeholder="e.g. Sunridge Equestrian"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address (optional)</label>
                        <input
                          type="text"
                          value={stableAddress}
                          onChange={(e) => setStableAddress(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          placeholder="Street, Town, County"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

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
                  <Link to="/terms" target="_blank" className="text-brand-600 hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy" target="_blank" className="text-brand-600 hover:underline">Privacy Policy</Link>
                </label>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep('type')} className="flex-1">
                  Back
                </Button>
                <Button type="submit" disabled={loading || !acceptTerms} className="flex-1">
                  {loading ? 'Creating account...' : 'Create account'}
                </Button>
              </div>
              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link to="/login" className="text-brand-600 hover:underline">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
