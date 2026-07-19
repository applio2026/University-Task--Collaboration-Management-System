import { create } from 'zustand';
import { api, setAccessToken, refreshSession } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { User } from '../types';

// ── Idle-session policy ───────────────────────────────────
// Log the user out after this much inactivity. The last-activity timestamp lives
// in localStorage so it survives a page refresh and is shared across tabs: a
// refresh while active restores the session, but a refresh after being idle past
// the limit does not.
export const IDLE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes
const IDLE_KEY = 'uni_last_activity';

export function touchActivity(): void {
  try {
    localStorage.setItem(IDLE_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — idle logout simply won't persist across reloads */
  }
}
function clearActivity(): void {
  try {
    localStorage.removeItem(IDLE_KEY);
  } catch {
    /* ignore */
  }
}
/** Milliseconds until idle logout, or null if there is no recorded session. */
export function idleMsRemaining(): number | null {
  try {
    const raw = localStorage.getItem(IDLE_KEY);
    if (!raw) return null;
    const last = Number(raw);
    if (!Number.isFinite(last)) return null;
    return IDLE_LIMIT_MS - (Date.now() - last);
  } catch {
    return null;
  }
}
export function isIdleExpired(): boolean {
  const remaining = idleMsRemaining();
  return remaining !== null && remaining <= 0;
}

interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string, captchaToken: string, captchaAnswer: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'idle',

  login: async (email, password, captchaToken, captchaAnswer) => {
    const { data } = await api.post('/auth/login', { email, password, captchaToken, captchaAnswer });
    setAccessToken(data.accessToken);
    connectSocket(data.accessToken);
    touchActivity();
    set({ user: data.user, status: 'authenticated' });
  },

  logout: async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    disconnectSocket();
    clearActivity();
    set({ user: null, status: 'unauthenticated' });
  },

  // On app load, try to silently restore a session via the refresh cookie.
  // Uses the shared single-flight refresh so StrictMode's double invocation (or
  // any concurrent 401 retry) results in exactly one /auth/refresh call — a
  // second call would race the token rotation and log the user straight back out.
  bootstrap: async () => {
    set({ status: 'loading' });
    // If the previous session sat idle past the limit, don't silently restore it —
    // revoke the refresh token server-side and require a fresh login.
    if (isIdleExpired()) {
      await api.post('/auth/logout').catch(() => undefined);
      clearActivity();
      setAccessToken(null);
      set({ user: null, status: 'unauthenticated' });
      return;
    }
    const result = await refreshSession();
    if (result) {
      touchActivity();
      connectSocket(result.accessToken);
      set({ user: result.user, status: 'authenticated' });
    } else {
      clearActivity();
      set({ user: null, status: 'unauthenticated' });
    }
  },
}));
