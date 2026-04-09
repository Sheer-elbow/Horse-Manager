import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setAccessToken, clearAccessToken, tryRefresh, getAccessToken } from '../api/client';
import { User } from '../types';

interface AuthTokenResponse {
  accessToken: string;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount, attempt a silent refresh via the httpOnly cookie.
    // If that succeeds we get a fresh access token and can fetch /auth/me.
    // If no cookie exists (first visit / logged out), this quietly fails.
    const init = async () => {
      try {
        // First check if we already have an in-memory token (e.g. SPA navigation)
        if (getAccessToken()) {
          const u = await api<User>('/auth/me');
          setUser(u);
        } else {
          // Try silent refresh via httpOnly cookie
          const refreshed = await tryRefresh();
          if (refreshed) {
            const u = await api<User>('/auth/me');
            setUser(u);
          }
        }
      } catch {
        clearAccessToken();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort — clear local state regardless
    }
    clearAccessToken();
    setUser(null);
  };

  const updateUser = (u: User) => setUser(u);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
