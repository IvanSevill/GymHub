import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { exerciseService, Exercise } from "../../../services/exercise";
import {
  analyticsService,
  AnalyticsSummary,
  WorkoutFrequencyPoint,
  MuscleBalancePoint,
  SessionDuration,
} from "../../../services/analytics";

interface VolumeTrendDataPoint {
  date: string;
  volume: number;
  formattedDate: string;
}

interface AnalyticsData {
  exercises: Exercise[];
  summary: AnalyticsSummary | null;
  freqData: WorkoutFrequencyPoint[];
  volumeData: VolumeTrendDataPoint[];
  muscleBalance: MuscleBalancePoint[];
  sessionDurations: SessionDuration[];
  loading: boolean;
  error: boolean;
  reload: () => void;
}

export function useAnalyticsData(globalDays: string): AnalyticsData {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [freqData, setFreqData] = useState<WorkoutFrequencyPoint[]>([]);
  const [volumeData, setVolumeData] = useState<VolumeTrendDataPoint[]>([]);
  const [muscleBalance, setMuscleBalance] = useState<MuscleBalancePoint[]>([]);
  const [sessionDurations, setSessionDurations] = useState<SessionDuration[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);
      const days = Number(globalDays);
      const results = await Promise.allSettled([
        exerciseService.getExercises(),
        analyticsService.getSummary(days),
        analyticsService.getWorkoutFrequency(days),
        analyticsService.getVolumeTrend(days),
        analyticsService.getMuscleBalance(days),
        analyticsService.getSessionDurations(days),
      ]);

      if (cancelled) return;

      // A genuine backend failure rejects every request; that must surface as
      // an error state, not as an empty dashboard. Partial failures keep the
      // data that did load and are treated as success.
      if (results.every((r) => r.status === "rejected")) {
        setError(true);
        setLoading(false);
        return;
      }

      const [exRes, summaryRes, freqRes, volRes, muscleRes, durRes] = results;

      if (exRes.status === "fulfilled") setExercises(exRes.value);
      if (summaryRes.status === "fulfilled") setSummary(summaryRes.value);
      if (freqRes.status === "fulfilled") setFreqData(freqRes.value);
      if (volRes.status === "fulfilled")
        setVolumeData(
          volRes.value.map((d) => ({
            ...d,
            formattedDate: format(parseISO(d.date), "dd MMM", { locale: es }),
          })),
        );
      if (muscleRes.status === "fulfilled") setMuscleBalance(muscleRes.value);
      if (durRes.status === "fulfilled") setSessionDurations(durRes.value);

      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [globalDays, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => setReloadKey((k) => k + 1);

  return {
    exercises,
    summary,
    freqData,
    volumeData,
    muscleBalance,
    sessionDurations,
    loading,
    error,
    reload,
  };
}
