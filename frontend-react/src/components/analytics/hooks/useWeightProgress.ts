import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { analyticsService } from "../../../services/analytics";
import { Exercise } from "../../../services/exercise";

interface WeightDataPoint {
  date: string;
  value: number;
  formattedDate: string;
}

interface UseWeightProgressResult {
  selectedExercise: string;
  setSelectedExercise: (id: string) => void;
  weightData: WeightDataPoint[];
  loadingWeights: boolean;
  weightError: boolean;
  setWeightError: (v: boolean) => void;
  days: string;
  setDays: (d: string) => void;
}

export function useWeightProgress(
  exercises: Exercise[],
): UseWeightProgressResult {
  const [selectedExercise, setSelectedExercise] = useState("");
  const [weightData, setWeightData] = useState<WeightDataPoint[]>([]);
  const [loadingWeights, setLoadingWeights] = useState(false);
  const [weightError, setWeightError] = useState(false);
  const [days, setDays] = useState("30");

  useEffect(() => {
    if (exercises.length > 0 && !selectedExercise) {
      setSelectedExercise(exercises[0].id);
    }
  }, [exercises]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedExercise) return;
    let cancelled = false;
    setLoadingWeights(true);
    setWeightData([]);
    setWeightError(false);
    analyticsService
      .getWeightProgress(selectedExercise, Number(days))
      .then((res) => {
        if (!cancelled)
          setWeightData(
            res.map((d) => ({
              ...d,
              formattedDate: format(parseISO(d.date), "dd MMM", { locale: es }),
            })),
          );
      })
      .catch(() => {
        if (!cancelled) setWeightError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingWeights(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedExercise, days]);

  return {
    selectedExercise,
    setSelectedExercise,
    weightData,
    loadingWeights,
    weightError,
    setWeightError,
    days,
    setDays,
  };
}
