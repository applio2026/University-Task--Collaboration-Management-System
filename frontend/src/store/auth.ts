import { create } from 'zustand';
import { api, setAccessToken, refreshSession } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { User } from '../types';

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
    set({ user: data.user, status: 'authenticated' });
  },

  logout: async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    disconnectSocket();
    set({ user: null, status: 'unauthenticated' });
  },

  // On app load, try to silently restore a session via the refresh cookie.
  // Uses the shared single-flight refresh so StrictMode's double invocation (or
  // any concurrent 401 retry) results in exactly one /auth/refresh call — a
  // second call would race the token rotation and log the user straight back out.
  bootstrap: async () => {
    set({ status: 'loading' });
    const result = await refreshSession();
    if (result) {
      connectSocket(result.accessToken);
      set({ user: result.user, status: 'authenticated' });
    } else {
      set({ user: null, status: 'unauthenticated' });
    }
  },
}));
