import axios from "axios";
import { getToken, setToken } from "./tokenStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let _isRefreshing = false;
let _pendingQueue: Array<{
  resolve: (t: string) => void;
  reject: (e: unknown) => void;
}> = [];

function drainQueue(error: unknown, token: string | null) {
  _pendingQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  _pendingQueue = [];
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes("/auth/refresh") &&
      !window.location.pathname.includes("/login")
    ) {
      if (_isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          _pendingQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      _isRefreshing = true;

      try {
        const { data } = await api.post<{ access_token: string }>(
          "/auth/refresh",
        );
        setToken(data.access_token);
        drainQueue(null, data.access_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch (refreshError) {
        setToken(null);
        drainQueue(refreshError, null);
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        _isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
