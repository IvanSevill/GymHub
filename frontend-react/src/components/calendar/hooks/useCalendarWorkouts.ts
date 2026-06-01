import { useState, useCallback } from "react";
import { workoutService, Workout } from "../../../services/workout";
import { useToast } from "../../../context/ToastContext";

export function useCalendarWorkouts() {
  const { addToast } = useToast();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkouts = useCallback(async (): Promise<Workout[]> => {
    setLoading(true);
    try {
      const fresh = await workoutService.getWorkouts();
      setWorkouts(fresh);
      return fresh;
    } catch {
      addToast("Error al cargar los entrenamientos", "error");
      return [];
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  return { workouts, loading, fetchWorkouts };
}
