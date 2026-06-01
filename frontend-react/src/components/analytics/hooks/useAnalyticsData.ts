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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
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
  }, [globalDays]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    exercises,
    summary,
    freqData,
    volumeData,
    muscleBalance,
    sessionDurations,
    loading,
  };
}
