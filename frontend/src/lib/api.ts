import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

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

// On 401, try one silent refresh, then replay the request.
let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
    accessToken = data.accessToken;
    return accessToken;
  } catch {
    accessToken = null;
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const isAuthCall = original?.url?.includes('/auth/');
    if (error.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      refreshing = refreshing ?? doRefresh();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);
