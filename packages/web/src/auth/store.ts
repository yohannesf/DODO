// Auth state (spec §9): access token in memory only; profile/permissions
// cached in Dexie so the app stays usable offline. Sync waits for re-auth
// when the token cannot be refreshed.
import { create } from 'zustand';
import type { AuthUser, LoginResponse } from '@dodo/shared';
import { openDb } from '../db/db';
import { setTokenProvider } from '../api/client';

let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export type AuthStatus = 'unknown' | 'authed' | 'anon';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** true when running on the offline auth cache without a live token */
  offlineSession: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  boot: () => Promise<void>;
}

async function applyLogin(res: LoginResponse, offlineSession: boolean) {
  accessToken = res.accessToken;
  const db = openDb(res.user.id);
  await db.authCache.put({
    id: 'auth',
    user: res.user,
    cachedAt: new Date().toISOString(),
  });
  scheduleRefresh(res.expiresIn);
  useAuth.setState({ status: 'authed', user: res.user, offlineSession });
}

function scheduleRefresh(expiresIn: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  // refresh two minutes before expiry
  refreshTimer = setTimeout(
    () => void tryRefresh(),
    Math.max((expiresIn - 120) * 1000, 30_000),
  );
}

export async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST' });
    if (!res.ok) return false;
    await applyLogin((await res.json()) as LoginResponse, false);
    return true;
  } catch {
    // offline — keep the cached session usable (spec §9)
    return false;
  }
}

export const useAuth = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,
  offlineSession: false,

  async login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? 'login failed');
    }
    await applyLogin((await res.json()) as LoginResponse, false);
  },

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    accessToken = null;
    if (refreshTimer) clearTimeout(refreshTimer);
    set({ status: 'anon', user: null, offlineSession: false });
  },

  async boot() {
    if (await tryRefresh()) return;
    // offline (or expired session) — fall back to the last cached user
    const lastUserId = localStorage.getItem('dodo:lastUserId');
    if (lastUserId && !navigator.onLine) {
      const db = openDb(lastUserId);
      const cached = await db.authCache.get('auth');
      if (cached) {
        set({ status: 'authed', user: cached.user, offlineSession: true });
        return;
      }
    }
    set({ status: 'anon', user: null, offlineSession: false });
  },
}));

// remember the last user for offline boot (per-user db name, spec §9)
useAuth.subscribe((state) => {
  if (state.user) localStorage.setItem('dodo:lastUserId', state.user.id);
});

setTokenProvider({
  getToken: () => accessToken,
  refresh: tryRefresh,
});
