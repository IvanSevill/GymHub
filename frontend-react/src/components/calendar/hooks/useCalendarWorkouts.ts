import { useState, useCallback } from "react";
import { workoutService, Workout } from "../../../services/workout";

export function useCalendarWorkouts() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchWorkouts = useCallback(async (): Promise<Workout[]> => {
    setLoading(true);
    setError(false);
    try {
      const fresh = await workoutService.getWorkouts();
      setWorkouts(fresh);
      return fresh;
    } catch {
      setError(true);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { workouts, loading, error, fetchWorkouts };
}
