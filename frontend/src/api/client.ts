const BASE = '/api';

// Access token is kept in memory only — never persisted to localStorage.
// The refresh token lives in an httpOnly cookie managed by the server.
let accessToken: string | null = null;

export function setAccessToken(token: string) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
}

export function getAccessToken() {
  return accessToken;
}

export async function tryRefresh(): Promise<boolean> {
  try {
    // The httpOnly cookie is sent automatically via credentials: 'include'
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' });

  // If 401, try refreshing token via httpOnly cookie
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' });
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text || `Request failed (${res.status})` };
    }
    throw new ApiError(res.status, (body.error as string) || `Request failed (${res.status})`, body);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
