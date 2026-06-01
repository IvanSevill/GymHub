import type { Workout } from "../../services/workout";

export interface TimeEdit {
  startH: number;
  startM: number;
  endH: number;
  endM: number;
}

export interface WeeklyAssignment {
  date: string;
  time: string;
}

export interface DraftSet {
  exercise_id: string;
  exercise_name: string;
  muscle_name: string;
  muscle_id: string;
  value: string;
  measurement: string;
  is_completed: boolean;
}

export interface ExerciseGroup {
  name: string;
  sets: import("../../services/workout").ExerciseSet[];
}

export interface MuscleGroup {
  name: string;
  exercises: ExerciseGroup[];
}

export type FitbitData = NonNullable<Workout["fitbit_data"]>;

export const MEASUREMENTS = ["kg", "reps", "s", "min"];
export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
