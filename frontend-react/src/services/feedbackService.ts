import api from "./api";

export interface FeedbackResponse {
  id: string;
  message: string;
  rating: number | null;
  created_at: string;
  user_name: string;
  user_email: string;
}

export const feedbackService = {
  submit: async (data: { message: string; rating?: number }): Promise<void> => {
    await api.post("/feedback", data);
  },
  getAll: async (): Promise<FeedbackResponse[]> => {
    const res = await api.get<FeedbackResponse[]>("/feedback");
    return res.data;
  },
};
