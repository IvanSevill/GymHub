import api from './api';

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

export const analyticsService = {
  getWeightProgress: async (exerciseId: string, period: string = 'month'): Promise<WeightProgressPoint[]> => {
    const response = await api.get<WeightProgressPoint[]>('/analytics/weight-progress', {
      params: { exercise_id: exerciseId, period },
    });
    return response.data;
  },
  getExerciseFrequency: async (muscleId?: string, days: number = 730): Promise<ExerciseFrequency[]> => {
    const params: any = { days };
    if (muscleId) params.muscle_id = muscleId;
    const response = await api.get<ExerciseFrequency[]>('/analytics/frequency', { params });
    return response.data;
  },
  getMaxLifts: async (): Promise<MaxLift[]> => {
    const response = await api.get<MaxLift[]>('/analytics/max-lifts');
    return response.data;
  },
  getExerciseHistory: async (exerciseId: string): Promise<any[]> => {
    const response = await api.get<any[]>(`/analytics/exercise-history/${exerciseId}`);
    return response.data;
  },
};
