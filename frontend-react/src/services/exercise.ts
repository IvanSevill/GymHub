import api from "./api";

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
    const response = await api.get<Muscle[]>("/muscles");
    return response.data;
  },
  getExercises: async (muscleId?: string): Promise<Exercise[]> => {
    const params: any = {};
    if (muscleId) params.muscle_id = muscleId;
    const response = await api.get<Exercise[]>("/exercises", { params });
    return response.data;
  },
  createExercise: async (name: string, muscleId: string): Promise<Exercise> => {
    const response = await api.post<Exercise>("/exercises", {
      name,
      muscle_id: muscleId,
    });
    return response.data;
  },
  createMuscle: async (name: string): Promise<Muscle> => {
    const response = await api.post<Muscle>("/muscles", { name });
    return response.data;
  },
  updateMuscle: async (muscleId: string, name: string): Promise<Muscle> => {
    const response = await api.put<Muscle>(`/muscles/${muscleId}`, { name });
    return response.data;
  },
  deleteMuscle: async (muscleId: string): Promise<void> => {
    await api.delete(`/muscles/${muscleId}`);
  },
  updateExercise: async (
    exerciseId: string,
    name: string,
  ): Promise<Exercise> => {
    const response = await api.put<Exercise>(`/exercises/${exerciseId}`, {
      name,
    });
    return response.data;
  },
  deleteExercise: async (exerciseId: string): Promise<void> => {
    await api.delete(`/exercises/${exerciseId}`);
  },
};
