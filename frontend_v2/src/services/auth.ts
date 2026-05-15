import api from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  picture_url?: string;
  is_root: number;
  has_calendar: boolean;
  fitbit_connected: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const authService = {
  loginWithGoogle: async (code: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/google', { code });
    return response.data;
  },
  getCurrentUser: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },
  getFitbitAuthUrl: async (): Promise<{ url: string }> => {
    const response = await api.get<{ url: string }>('/auth/fitbit');
    return response.data;
  },
  disconnectFitbit: async (): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>('/auth/fitbit');
    return response.data;
  },
};
