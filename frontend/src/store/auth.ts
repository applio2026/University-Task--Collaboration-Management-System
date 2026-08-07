import { create } from 'zustand';
import { api, setAccessToken, refreshSession } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { useActiveWorkspace } from './workspace';
import type { User } from '../types';

// ── Idle-session policy ───────────────────────────────────
// Log the user out after this much inactivity, enforced by a live timer while
// the app is open (see App.tsx's useIdleLogout) — refreshing the page is
// itself a user action and always restores the session via the refresh
// cookie, regardless of how long it's been since the last mouse/key event.
export const IDLE_LIMIT_MS = 8 * 60 * 60 * 1000; // 8 hours (a work session)
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
    // Don't leak a workspace selection into the next login on a shared device.
    useActiveWorkspace.getState().setActiveWorkspace(null);
    set({ user: null, status: 'unauthenticated' });
  },

  // On app load, try to silently restore a session via the refresh cookie.
  // Uses the shared single-flight refresh so StrictMode's double invocation (or
  // any concurrent 401 retry) results in exactly one /auth/refresh call — a
  // second call would race the token rotation and log the user straight back out.
  //
  // Deliberately does NOT gate this on isIdleExpired(): the idle policy
  // (IDLE_LIMIT_MS, 8h) is enforced by the live timer in App.tsx's
  // useIdleLogout while the app is open, which is the only place that can
  // distinguish "genuinely idle" from "just reading the page for a bit."
  // Checking the stale pre-refresh activity timestamp here caused a real bug —
  // any refresh after the limit of not touching the mouse (completely normal
  // while reading) looked indistinguishable from "was idle," logging the user
  // out on the very refresh that proves they're still there.
  bootstrap: async () => {
    set({ status: 'loading' });
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
