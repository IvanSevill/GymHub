import { useState, useCallback } from "react";
import { workoutService, Workout } from "../../../services/workout";
import { exerciseService, Exercise } from "../../../services/exercise";
import { useToast } from "../../../context/ToastContext";
import type { DraftSet } from "../types";

export function useWorkoutEdit(refresh: () => Promise<void>) {
  const { addToast } = useToast();
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [draftSets, setDraftSets] = useState<DraftSet[]>([]);
  const [muscleExercises, setMuscleExercises] = useState<
    Record<string, Exercise[]>
  >({});
  const [isSaving, setIsSaving] = useState(false);

  const enterEditMode = useCallback(
    async (workout: Workout) => {
      const existingByExId: Record<string, DraftSet[]> = {};
      const draft: DraftSet[] = workout.exercise_sets.map((s) => {
        const d: DraftSet = {
          exercise_id: s.exercise_id,
          exercise_name: s.exercise?.name ?? "",
          muscle_name: s.exercise?.muscle?.name ?? "",
          muscle_id: s.exercise?.muscle?.id ?? "",
          value: s.value,
          measurement: s.measurement,
          is_completed: s.is_completed,
        };
        if (!existingByExId[d.exercise_id]) existingByExId[d.exercise_id] = [];
        existingByExId[d.exercise_id].push(d);
        return d;
      });

      const muscleIds = [
        ...new Set(draft.map((s) => s.muscle_id).filter(Boolean)),
      ];
      const cache: Record<string, Exercise[]> = { ...muscleExercises };
      await Promise.all(
        muscleIds.map(async (mid) => {
          if (!cache[mid]) cache[mid] = await exerciseService.getExercises(mid);
        }),
      );
      setMuscleExercises(cache);

      const muscleIdToName: Record<string, string> = {};
      for (const d of draft) {
        if (d.muscle_id && d.muscle_name)
          muscleIdToName[d.muscle_id] = d.muscle_name;
      }

      for (const mid of muscleIds) {
        const muscleName = muscleIdToName[mid];
        if (!muscleName) continue;
        for (const ex of cache[mid] ?? []) {
          if (!existingByExId[ex.id]) {
            draft.push({
              exercise_id: ex.id,
              exercise_name: ex.name,
              muscle_name: muscleName,
              muscle_id: mid,
              value: "",
              measurement: "kg",
              is_completed: false,
            });
          }
        }
      }

      setDraftSets(draft);
      setEditingWorkoutId(workout.id);
    },
    [muscleExercises],
  );

  const cancelEdit = useCallback(() => {
    setEditingWorkoutId(null);
    setDraftSets([]);
  }, []);

  const saveEdit = useCallback(
    async (workout: Workout) => {
      setIsSaving(true);
      try {
        const setsToSave = draftSets.filter(
          (s) => s.is_completed || (s.value !== "" && s.value !== "0"),
        );
        await workoutService.updateWorkout(workout.id, {
          start_time: workout.start_time,
          end_time: workout.end_time,
          title: workout.title,
          exercise_sets: setsToSave.map((s) => ({
            exercise_id: s.exercise_id,
            value: s.value || "0",
            measurement: s.measurement,
            is_completed: s.is_completed,
          })),
        });
        await refresh();
        setEditingWorkoutId(null);
        setDraftSets([]);
        addToast("Sesión actualizada", "success");
      } catch {
        addToast("Error al guardar los cambios", "error");
      } finally {
        setIsSaving(false);
      }
    },
    [draftSets, refresh, addToast],
  );

  return {
    editingWorkoutId,
    draftSets,
    muscleExercises,
    isSaving,
    enterEditMode,
    cancelEdit,
    saveEdit,
    setDraftSets,
  };
}
