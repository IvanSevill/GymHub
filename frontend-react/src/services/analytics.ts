import api from "./api";

export interface WeightProgressPoint {
  date: string;
  value: number;
}

export interface ExerciseFrequency {
  exercise_name: string;
  count: number;
  muscle_name: string;
}

export interface MaxLift {
  exercise_id: string;
  exercise_name: string;
  muscle_name: string;
  max_value: number;
  measurement: string;
  date: string;
}

export interface AnalyticsSummary {
  workout_count: number;
  prev_workout_count: number;
  total_volume_kg: number;
  prev_total_volume_kg: number;
  avg_duration_min: number | null;
  prev_avg_duration_min: number | null;
  pr_count: number;
  prev_pr_count: number;
}

export interface WorkoutFrequencyPoint {
  week: string;
  count: number;
}

export interface VolumeTrendPoint {
  date: string;
  volume: number;
}

export const analyticsService = {
  getWeightProgress: async (
    exerciseId: string,
    days: number = 30,
  ): Promise<WeightProgressPoint[]> => {
    const response = await api.get<WeightProgressPoint[]>(
      "/analytics/weight-progress",
      { params: { exercise_id: exerciseId, days } },
    );
    return response.data;
  },
  getExerciseFrequency: async (
    muscleId?: string,
    days: number = 730,
  ): Promise<ExerciseFrequency[]> => {
    const params: Record<string, unknown> = { days };
    if (muscleId) params.muscle_id = muscleId;
    const response = await api.get<ExerciseFrequency[]>(
      "/analytics/frequency",
      {
        params,
      },
    );
    return response.data;
  },
  getMaxLifts: async (): Promise<MaxLift[]> => {
    const response = await api.get<MaxLift[]>("/analytics/max-lifts");
    return response.data;
  },
  getExerciseHistory: async (exerciseId: string): Promise<any[]> => {
    const response = await api.get<any[]>(
      `/analytics/exercise-history/${exerciseId}`,
    );
    return response.data;
  },
  getSummary: async (days: number = 30): Promise<AnalyticsSummary> => {
    const response = await api.get<AnalyticsSummary>("/analytics/summary", {
      params: { days },
    });
    return response.data;
  },
  getWorkoutFrequency: async (
    days: number = 90,
  ): Promise<WorkoutFrequencyPoint[]> => {
    const response = await api.get<WorkoutFrequencyPoint[]>(
      "/analytics/workout-frequency",
      { params: { days } },
    );
    return response.data;
  },
  getVolumeTrend: async (days: number = 90): Promise<VolumeTrendPoint[]> => {
    const response = await api.get<VolumeTrendPoint[]>(
      "/analytics/volume-trend",
      { params: { days } },
    );
    return response.data;
  },
};
