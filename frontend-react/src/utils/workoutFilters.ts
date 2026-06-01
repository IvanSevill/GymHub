import { Workout } from "../services/workout";

export function filterByMuscle(
  workouts: Workout[],
  selectedMuscles: string[],
  filterMode: "or" | "and",
): Workout[] {
  if (selectedMuscles.length === 0) return workouts;
  return workouts.filter((workout) => {
    const muscleIds = new Set(
      workout.exercise_sets
        .map((s) => s.exercise?.muscle?.id)
        .filter((id): id is string => Boolean(id)),
    );
    return filterMode === "and"
      ? selectedMuscles.every((id) => muscleIds.has(id))
      : selectedMuscles.some((id) => muscleIds.has(id));
  });
}

export function filterByFitbit(
  workouts: Workout[],
  showOnlyFitbit: boolean,
): Workout[] {
  if (!showOnlyFitbit) return workouts;
  return workouts.filter((w) => w.fitbit_data != null);
}

export function filterByDateRange(
  workouts: Workout[],
  startDate: string,
  endDate: string,
): Workout[] {
  return workouts.filter((w) => {
    const t = w.start_time;
    return t >= startDate && t <= endDate;
  });
}
