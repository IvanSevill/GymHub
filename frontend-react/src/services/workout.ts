import api from "./api";
import {
  invalidSyncResponse,
  isCanonicalUuid,
  type ServerSyncStage,
} from "./syncDiagnostics";

export type SyncOutcome = "success" | "partial" | "no_data" | "skipped";

export interface SyncIssue {
  stage: ServerSyncStage;
  code: string;
  retryable: boolean;
  count?: number;
}

interface SyncResponseBase {
  failed: number;
  outcome: SyncOutcome;
  correlation_id: string;
  issues: SyncIssue[];
  message?: string;
}

export interface FitbitBulkSyncResponse extends SyncResponseBase {
  synced: number;
  not_found: number;
  total: number;
  skipped?: string;
}

export interface CreatedFitbitActivity {
  activity_name: string;
  date: string;
}

export interface FitbitCreateMissingResponse extends SyncResponseBase {
  created: number;
  created_activities: CreatedFitbitActivity[];
}

const SYNC_OUTCOMES = new Set<SyncOutcome>([
  "success",
  "partial",
  "no_data",
  "skipped",
]);

function isSyncIssue(value: unknown): value is SyncIssue {
  if (!value || typeof value !== "object") return false;
  const issue = value as Record<string, unknown>;
  return (
    [
      "fitbit_auth",
      "fitbit_api",
      "processing",
      "database_persistence",
    ].includes(String(issue.stage)) &&
    typeof issue.code === "string" &&
    typeof issue.retryable === "boolean" &&
    (issue.count === undefined || typeof issue.count === "number")
  );
}

function isSyncResponseBase(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return (
    typeof response.failed === "number" &&
    typeof response.outcome === "string" &&
    SYNC_OUTCOMES.has(response.outcome as SyncOutcome) &&
    isCanonicalUuid(response.correlation_id) &&
    Array.isArray(response.issues) &&
    response.issues.every(isSyncIssue)
  );
}

function validateBulkResponse(
  value: unknown,
  correlationId: string,
): FitbitBulkSyncResponse {
  if (
    !isSyncResponseBase(value) ||
    typeof value.synced !== "number" ||
    typeof value.not_found !== "number" ||
    typeof value.total !== "number"
  ) {
    throw invalidSyncResponse(correlationId);
  }
  return value as unknown as FitbitBulkSyncResponse;
}

function validateCreateResponse(
  value: unknown,
  correlationId: string,
): FitbitCreateMissingResponse {
  if (
    !isSyncResponseBase(value) ||
    typeof value.created !== "number" ||
    !Array.isArray(value.created_activities) ||
    !value.created_activities.every(
      (activity) =>
        activity !== null &&
        typeof activity === "object" &&
        typeof (activity as Record<string, unknown>).activity_name ===
          "string" &&
        typeof (activity as Record<string, unknown>).date === "string",
    )
  ) {
    throw invalidSyncResponse(correlationId);
  }
  return value as unknown as FitbitCreateMissingResponse;
}

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
    fitbit_log_id?: string | null;
    calories: number;
    heart_rate_avg: number;
    duration_ms: number;
    activity_name?: string;
    azm_fat_burn: number;
    azm_cardio: number;
    azm_peak: number;
    distance_km: number;
    elevation_gain_m: number;
    has_gps: boolean;
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

export interface CardioPendingWorkout {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  activity_name: string;
  duration_ms: number;
  calories: number;
  heart_rate_avg: number;
  distance_km: number;
}

export interface SyncCardioResult {
  synced: number;
  failed: number;
  already_synced: number;
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
  syncAllFromCalendar: async (
    correlationId?: string,
  ): Promise<{ message: string; correlation_id?: string }> => {
    const response = await api.get<{
      message: string;
      correlation_id?: string;
    }>("/workouts/sync-all", {
      headers: correlationId
        ? { "X-Correlation-ID": correlationId }
        : undefined,
    });
    return response.data;
  },
  syncFitbitBulk: async (
    correlationId: string,
  ): Promise<FitbitBulkSyncResponse> => {
    const response = await api.post<unknown>(
      "/workouts/sync-fitbit-bulk",
      undefined,
      { headers: { "X-Correlation-ID": correlationId } },
    );
    return validateBulkResponse(response.data, correlationId);
  },
  syncFitbitCreate: async (
    correlationId: string,
    days: number = 30,
  ): Promise<FitbitCreateMissingResponse> => {
    const response = await api.post<unknown>(
      `/workouts/sync-fitbit-create-missing?days=${days}`,
      undefined,
      { headers: { "X-Correlation-ID": correlationId } },
    );
    return validateCreateResponse(response.data, correlationId);
  },
  getRoute: async (
    workoutId: string,
  ): Promise<{ lat: number; lon: number; ele: number | null }[]> => {
    const response = await api.get(`/workouts/${workoutId}/route`);
    return response.data;
  },
  createCalendar: async (
    name: string,
  ): Promise<{ id: string; summary: string }> => {
    const response = await api.post<{ id: string; summary: string }>(
      `/workouts/create-calendar?name=${encodeURIComponent(name)}`,
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
  reformatAll: async (): Promise<{
    updated: number;
    failed: number;
    total: number;
  }> => {
    const response = await api.post<{
      updated: number;
      failed: number;
      total: number;
    }>("/workouts/reformat-all");
    return response.data;
  },
  resetAll: async (): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>(
      "/exercises/reset-all",
    );
    return response.data;
  },
  resetExercisesAndResync: async (): Promise<{
    deleted_sets: number;
    deleted_exercises: number;
    message: string;
  }> => {
    const response = await api.post("/exercises/reset-and-resync");
    return response.data;
  },
  getCardioPending: async (): Promise<CardioPendingWorkout[]> => {
    const response = await api.get<CardioPendingWorkout[]>(
      "/workouts/cardio-pending",
    );
    return response.data;
  },
  syncCardioToCalendar: async (
    workoutIds: string[],
  ): Promise<SyncCardioResult> => {
    const response = await api.post<SyncCardioResult>(
      "/workouts/sync-cardio-to-calendar",
      { workout_ids: workoutIds },
    );
    return response.data;
  },
};
