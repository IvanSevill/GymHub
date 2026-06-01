import type { ExerciseFrequency } from "../services/analytics";
import { capitalize } from "./chartFormatters";

export function aggregateByMuscle(
  data: ExerciseFrequency[],
): { name: string; count: number }[] {
  const acc = data.reduce((map: Record<string, number>, curr) => {
    const m = curr.muscle_name ? capitalize(curr.muscle_name) : "Otro";
    map[m] = (map[m] || 0) + curr.count;
    return map;
  }, {});
  return Object.entries(acc)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function aggregateByExercise(
  data: ExerciseFrequency[],
): { name: string; count: number }[] {
  return data
    .filter((d) => d.exercise_name)
    .slice(0, 10)
    .map((d) => ({
      name: d.muscle_name
        ? `${capitalize(d.muscle_name)} — ${capitalize(d.exercise_name)}`
        : capitalize(d.exercise_name),
      count: d.count,
    }));
}
