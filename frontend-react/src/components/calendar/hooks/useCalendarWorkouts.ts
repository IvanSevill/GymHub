import { useState, useCallback, useRef } from "react";
import { workoutService, Workout } from "../../../services/workout";

export function useCalendarWorkouts() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestSequence = useRef(0);

  const fetchWorkouts = useCallback(
    async (options: { propagateError?: boolean } = {}): Promise<Workout[]> => {
      const requestId = ++requestSequence.current;
      setLoading(true);
      setError(false);
      try {
        const fresh = await workoutService.getWorkouts();
        if (requestId === requestSequence.current) {
          setWorkouts(fresh);
        }
        return fresh;
      } catch (requestError) {
        if (requestId === requestSequence.current) {
          setError(true);
        }
        if (options.propagateError) throw requestError;
        return [];
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  return { workouts, loading, error, fetchWorkouts };
}
