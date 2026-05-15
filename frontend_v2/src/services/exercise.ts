import api from './api';

export interface Muscle {
  id: string;
  name: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscle_id: string;
  muscle?: Muscle;
}

export const exerciseService = {
  getMuscles: async (): Promise<Muscle[]> => {
    const response = await api.get<Muscle[]>('/muscles');
    return response.data;
  },
  getExercises: async (muscleId?: string): Promise<Exercise[]> => {
    const params: any = {};
    if (muscleId) params.muscle_id = muscleId;
    const response = await api.get<Exercise[]>('/exercises', { params });
    return response.data;
  },
  createExercise: async (name: string, muscleId: string): Promise<Exercise> => {
    const response = await api.post<Exercise>('/exercises', { name, muscle_id: muscleId });
    return response.data;
  },
};
