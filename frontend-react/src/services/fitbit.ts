import api from "./api";

export interface SleepLog {
  id: string;
  user_id: string;
  fitbit_log_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  duration_ms: number;
  efficiency: number;
  minutes_asleep: number;
  minutes_awake: number;
  minutes_to_fall_asleep: number;
  time_in_bed: number;
  minutes_deep: number;
  minutes_light: number;
  minutes_rem: number;
  minutes_wake: number;
  is_main_sleep: boolean;
  log_type: string | null;
}

export interface DailyHealth {
  id: string;
  user_id: string;
  date: string;
  steps: number;
  floors: number;
  resting_heart_rate: number;
  calories_out: number;
  minutes_sedentary: number;
  minutes_lightly_active: number;
  minutes_fairly_active: number;
  minutes_very_active: number;
  distance_km: number;
}

export interface SyncStatus {
  last_sleep_date: string | null;
  last_daily_date: string | null;
  has_data: boolean;
}

export interface SyncResult {
  sleep_synced: number;
  days_synced: number;
  from_date: string;
  to_date: string;
  error?: string;
}

export const fitbitService = {
  sync: async (): Promise<SyncResult> => {
    const res = await api.post<SyncResult>("/fitbit/sync");
    return res.data;
  },

  getSyncStatus: async (): Promise<SyncStatus> => {
    const res = await api.get<SyncStatus>("/fitbit/sync-status");
    return res.data;
  },

  getSleep: async (days = 30): Promise<SleepLog[]> => {
    const res = await api.get<SleepLog[]>(`/fitbit/sleep?days=${days}`);
    return res.data;
  },

  getDaily: async (days = 30): Promise<DailyHealth[]> => {
    const res = await api.get<DailyHealth[]>(`/fitbit/daily?days=${days}`);
    return res.data;
  },
};
