import type { ExerciseSet } from "../../services/workout";
import type {
  DraftSet,
  ExerciseGroup,
  MuscleGroup,
  WeeklyAssignment,
} from "./types";

export const MS_PER_DAY = 86400000;
export const CALENDAR_GRID_SIZE = 42;

export const HOURS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
export const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);

export const DEFAULT_EVENT_TIME = "10:00";

export function makeDefaultSplit(
  offsets: number[],
): Record<number, WeeklyAssignment> {
  return Object.fromEntries(
    offsets.map((offset, i) => [
      i,
      { date: daysFromNow(offset), time: DEFAULT_EVENT_TIME },
    ]),
  );
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const isCardioWorkout = (w: {
  fitbit_data?: { activity_name?: string } | null;
}) => {
  const name = (w.fitbit_data?.activity_name ?? "").toLowerCase();
  return (
    !!w.fitbit_data && name !== "" && name !== "weights" && name !== "walk"
  );
};

export const fmtDuration = (ms: number) => {
  const total = Math.round(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const groupWorkoutSets = (sets: ExerciseSet[]): MuscleGroup[] => {
  const map: Record<string, MuscleGroup> = {};
  for (const s of sets) {
    if (!s.exercise?.name) continue; // skip sets with missing exercise data
    const mName = s.exercise.muscle?.name ?? "Sin grupo";
    const eName = s.exercise.name;
    if (!map[mName]) map[mName] = { name: mName, exercises: [] };
    const mg = map[mName];
    let eg: ExerciseGroup | undefined = mg.exercises.find(
      (e) => e.name === eName,
    );
    if (!eg) {
      eg = { name: eName, sets: [] };
      mg.exercises.push(eg);
    }
    eg.sets.push(s);
  }
  return Object.values(map)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((mg) => ({
      ...mg,
      exercises: mg.exercises.sort((a, b) => a.name.localeCompare(b.name)),
    }));
};

export const groupDraftSets = (sets: DraftSet[]) => {
  const muscles: Record<
    string,
    { muscle_id: string; exercises: Record<string, DraftSet[]> }
  > = {};
  for (const s of sets) {
    if (!s.muscle_name || !s.exercise_id) continue; // skip incomplete data
    if (!muscles[s.muscle_name])
      muscles[s.muscle_name] = { muscle_id: s.muscle_id, exercises: {} };
    if (!muscles[s.muscle_name].exercises[s.exercise_id])
      muscles[s.muscle_name].exercises[s.exercise_id] = [];
    muscles[s.muscle_name].exercises[s.exercise_id].push(s);
  }
  return muscles;
};
