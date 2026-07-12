import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { User } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // send refresh cookie
});

let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

export interface RefreshResult {
  accessToken: string;
  user: User;
}

// Single-flight refresh shared by both app bootstrap and the 401 interceptor.
// Refresh tokens are single-use (rotated server-side), so two concurrent
// /auth/refresh calls with the same cookie would make the second one fail on an
// already-rotated token and log the user out. React StrictMode's double effect
// invocation (which runs bootstrap twice) is the most common trigger — hence the
// "logged out after refresh" symptom. Coalescing every caller onto one in-flight
// promise guarantees exactly one refresh request per burst.
let refreshPromise: Promise<RefreshResult | null> | null = null;

export function refreshSession(): Promise<RefreshResult | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        accessToken = res.data.accessToken;
        return { accessToken: res.data.accessToken as string, user: res.data.user as User };
      })
      .catch(() => {
        accessToken = null;
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// On 401, try one silent refresh, then replay the request.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const isAuthCall = original?.url?.includes('/auth/');
    if (error.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      const result = await refreshSession();
      if (result) {
        original.headers.Authorization = `Bearer ${result.accessToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);
