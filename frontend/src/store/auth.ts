import { create } from 'zustand';
import { api, setAccessToken } from '../lib/api';
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
  bootstrap: async () => {
    set({ status: 'loading' });
    try {
      const { data } = await api.post('/auth/refresh');
      setAccessToken(data.accessToken);
      connectSocket(data.accessToken);
      set({ user: data.user, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'unauthenticated' });
    }
  },
}));
