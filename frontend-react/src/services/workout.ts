import api from "./api";

export interface ExerciseSet {
  id?: string;
  exercise_id: string;
  value: string;
  measurement: string;
  is_completed: boolean;
  exercise?: {
    id: string;
    name: string;
    muscle?: {
      id: string;
      name: string;
    };
  };
}

export interface Workout {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  title: string;
  google_event_id?: string;
  exercise_sets: ExerciseSet[];
  fitbit_data?: {
    calories: number;
    heart_rate_avg: number;
    duration_ms: number;
    activity_name?: string;
    azm_fat_burn: number;
    azm_cardio: number;
    azm_peak: number;
    distance_km: number;
    elevation_gain_m: number;
  };
}

export interface WorkoutCreate {
  start_time: string;
  end_time: string;
  title: string;
  exercise_sets: {
    exercise_id: string;
    value: string;
    measurement: string;
    is_completed: boolean;
  }[];
}

export const workoutService = {
  getWorkouts: async (
    startDate?: string,
    endDate?: string,
  ): Promise<Workout[]> => {
    const params: any = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const response = await api.get<Workout[]>("/workouts", { params });
    return response.data;
  },
  createWorkout: async (workout: WorkoutCreate): Promise<Workout> => {
    const response = await api.post<Workout>("/workouts", workout);
    return response.data;
  },
  updateWorkout: async (
    id: string,
    workout: WorkoutCreate,
  ): Promise<Workout> => {
    const response = await api.put<Workout>(`/workouts/${id}`, workout);
    return response.data;
  },
  deleteWorkout: async (id: string): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/workouts/${id}`);
    return response.data;
  },
  syncFitbit: async (id: string): Promise<any> => {
    const response = await api.post(`/workouts/${id}/sync-fitbit`);
    return response.data;
  },
  syncAllFromCalendar: async (): Promise<{ message: string }> => {
    const response = await api.get<{ message: string }>("/workouts/sync-all");
    return response.data;
  },
  syncFitbitBulk: async (): Promise<{
    synced: number;
    not_found: number;
    total: number;
  }> => {
    const response = await api.post<{
      synced: number;
      not_found: number;
      total: number;
    }>("/workouts/sync-fitbit-bulk");
    return response.data;
  },
  syncFitbitCreate: async (days: number = 30): Promise<{ created: number }> => {
    const response = await api.post<{ created: number }>(
      `/workouts/sync-fitbit-create-missing?days=${days}`,
    );
    return response.data;
  },
  getCalendars: async (): Promise<any[]> => {
    const response = await api.get<any[]>("/workouts/calendars");
    return response.data;
  },
  setCalendar: async (calendarId: string): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>(
      `/workouts/set-calendar?calendar_id=${calendarId}`,
    );
    return response.data;
  },
};
