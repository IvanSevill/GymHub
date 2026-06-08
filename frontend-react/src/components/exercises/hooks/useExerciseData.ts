import { useEffect, useState } from "react";
import { exerciseService } from "../../../services/exercise";
import type { Exercise } from "../../../services/exercise";
import { analyticsService, MaxLift } from "../../../services/analytics";
import { useToast } from "../../../context/ToastContext";

interface UseExerciseDataResult {
  exercises: Exercise[];
  prsMap: Record<string, MaxLift>;
  selectedMuscleId: string | null;
  setSelectedMuscleId: (id: string | null) => void;
  loading: boolean;
}

export function useExerciseData(): UseExerciseDataResult {
  const { addToast } = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [prsMap, setPrsMap] = useState<Record<string, MaxLift>>({});
  const [selectedMuscleId, setSelectedMuscleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    exerciseService
      .getExercises()
      .then((exs) =>
        setExercises(exs.sort((a, b) => a.name.localeCompare(b.name))),
      )
      .catch(() => addToast("Error al cargar los ejercicios", "error"))
      .finally(() => setLoading(false));

    analyticsService
      .getMaxLifts()
      .then((lifts) =>
        setPrsMap(Object.fromEntries(lifts.map((l) => [l.exercise_id, l]))),
      )
      .catch(() => {});
  }, []);

  return { exercises, prsMap, selectedMuscleId, setSelectedMuscleId, loading };
}
