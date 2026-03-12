import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL;

const gymhubApi = axios.create({
  baseURL: API_URL,
});

// Add a request interceptor to include the JWT token
gymhubApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for errors
gymhubApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    const message = error.response?.data?.detail || 'An unexpected error occurred';
    toast.error(message);
    return Promise.reject(error);
  }
);

export const authApi = {
  loginWithGoogle: (code) => gymhubApi.post('/auth/google', { code }),
  getFitbitAuthUrl: () => gymhubApi.get('/auth/fitbit'),
  disconnectFitbit: () => gymhubApi.delete('/auth/fitbit'),
};

export const workoutApi = {
  getWorkouts: (params) => gymhubApi.get('/workouts', { params }),
  createWorkout: (data) => gymhubApi.post('/workouts', data),
  updateWorkout: (id, data) => gymhubApi.put(`/workouts/${id}`, data),
  deleteWorkout: (id) => gymhubApi.delete(`/workouts/${id}`),
  syncFitbit: (id) => gymhubApi.post(`/workouts/${id}/sync-fitbit`),
  syncAll: () => gymhubApi.get('/workouts/sync-all'),
  getCalendars: () => gymhubApi.get('/workouts/calendars'),
  setCalendar: (id) => gymhubApi.post(`/workouts/set-calendar?calendar_id=${id}`),
};

export const exerciseApi = {
  getExercises: (params) => gymhubApi.get('/exercises', { params }),
  createExercise: (data) => gymhubApi.post('/exercises', data),
  getMuscles: () => gymhubApi.get('/muscles'),
};

export const analyticsApi = {
  getWeightProgress: (exerciseId, period) => 
    gymhubApi.get('/analytics/weight-progress', { params: { exercise_id: exerciseId, period } }),
  getFrequency: (params) => gymhubApi.get('/analytics/frequency', { params }),
  getMaxLifts: () => gymhubApi.get('/analytics/max-lifts'),
  getExerciseHistory: (exerciseId) => gymhubApi.get(`/analytics/exercise-history/${exerciseId}`),
};

export const adminApi = {
  exportMock: () => gymhubApi.get('/admin/export-mock'),
  importMock: (data) => gymhubApi.post('/admin/import-mock', data),
};

export default gymhubApi;
