import api from "./api";
import type { Muscle } from "./exercise";

export interface ExerciseRequestUserInfo {
  id: string;
  name: string;
  email: string;
  picture_url?: string;
}

export interface ExerciseRequest {
  id: string;
  type: "exercise" | "muscle_with_exercise";
  exercise_name: string;
  muscle_id?: string;
  muscle_name?: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason?: string;
  exercise_id?: string;
  created_at: string;
  reviewed_at?: string;
  requested_by: ExerciseRequestUserInfo;
  muscle?: Muscle;
}

export interface ExerciseRequestCreate {
  type: "exercise" | "muscle_with_exercise";
  exercise_name: string;
  muscle_id?: string;
  muscle_name?: string;
}

export interface ExerciseRequestUpdate {
  exercise_name?: string;
  muscle_id?: string;
  muscle_name?: string;
}

export const exerciseRequestService = {
  createRequest: async (
    data: ExerciseRequestCreate,
  ): Promise<ExerciseRequest> => {
    const response = await api.post<ExerciseRequest>(
      "/exercise-requests",
      data,
    );
    return response.data;
  },

  getMyRequests: async (): Promise<ExerciseRequest[]> => {
    const response = await api.get<ExerciseRequest[]>("/exercise-requests/my");
    return response.data;
  },

  getAllRequests: async (status?: string): Promise<ExerciseRequest[]> => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    const response = await api.get<ExerciseRequest[]>("/exercise-requests", {
      params,
    });
    return response.data;
  },

  approveRequest: async (id: string): Promise<ExerciseRequest> => {
    const response = await api.put<ExerciseRequest>(
      `/exercise-requests/${id}/approve`,
    );
    return response.data;
  },

  rejectRequest: async (
    id: string,
    reason?: string,
  ): Promise<ExerciseRequest> => {
    const response = await api.put<ExerciseRequest>(
      `/exercise-requests/${id}/reject`,
      {
        rejection_reason: reason ?? null,
      },
    );
    return response.data;
  },

  deleteRequest: async (id: string): Promise<void> => {
    await api.delete(`/exercise-requests/${id}`);
  },

  updateRequest: async (
    id: string,
    data: ExerciseRequestUpdate,
  ): Promise<ExerciseRequest> => {
    const response = await api.put<ExerciseRequest>(
      `/exercise-requests/${id}`,
      data,
    );
    return response.data;
  },

  adminEditRequest: async (
    id: string,
    data: ExerciseRequestUpdate,
  ): Promise<ExerciseRequest> => {
    const response = await api.put<ExerciseRequest>(
      `/exercise-requests/${id}/admin-edit`,
      data,
    );
    return response.data;
  },
};
