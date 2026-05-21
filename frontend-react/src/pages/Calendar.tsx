import React, { useEffect, useState, useMemo } from "react";
import { workoutService, Workout, WorkoutCreate } from "../services/workout";
import { exerciseService, Exercise } from "../services/exercise";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { useToast } from "../context/ToastContext";
import CalendarHeader from "../components/calendar/CalendarHeader";
import CalendarGrid from "../components/calendar/CalendarGrid";
import CalendarLegend from "../components/calendar/CalendarLegend";
import CreateEventModal from "../components/calendar/CreateEventModal";
import DayDetailModal from "../components/calendar/DayDetailModal";
import type { DraftSet } from "../components/calendar/types";

const Calendar: React.FC = () => {
  const { addToast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayWorkouts, setSelectedDayWorkouts] = useState<{
    date: Date;
    workouts: Workout[];
  } | null>(null);

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [draftSets, setDraftSets] = useState<DraftSet[]>([]);
  const [muscleExercises, setMuscleExercises] = useState<
    Record<string, Exercise[]>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  const daysInGrid = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const result = [...days];
    while (result.length < 42) {
      const last = result[result.length - 1];
      result.push(new Date(last.getTime() + 86400000));
    }
    return result;
  }, [currentDate]);

  useEffect(() => {
    fetchWorkouts();
  }, [currentDate]);

  const fetchWorkouts = async () => {
    setLoading(true);
    try {
      setWorkouts(await workoutService.getWorkouts());
    } catch {
      addToast("Error al cargar los entrenamientos", "error");
    } finally {
      setLoading(false);
    }
  };

  const enterEditMode = async (workout: Workout) => {
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
  };

  const cancelEdit = () => {
    setEditingWorkoutId(null);
    setDraftSets([]);
  };

  const saveEdit = async (workout: Workout) => {
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
      await fetchWorkouts();
      setEditingWorkoutId(null);
      setDraftSets([]);
      addToast("Sesión actualizada", "success");
    } catch {
      addToast("Error al guardar los cambios", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateEvent = async (
    title: string,
    start: string,
    end: string,
  ) => {
    const payload: WorkoutCreate = {
      title,
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      exercise_sets: [],
    };
    await workoutService.createWorkout(payload);
    await fetchWorkouts();
    setIsCreatingEvent(false);
    addToast("Evento creado correctamente", "success");
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // Step 1: pull calendar events into DB
      await workoutService.syncAllFromCalendar().catch(() => {});
      // Step 2: attach Fitbit data to existing gym workouts
      await workoutService.syncFitbitBulk().catch(() => null);
      // Step 3: create standalone workouts for Fitbit activities not in DB yet
      const fitbitResult = await workoutService
        .syncFitbitCreate()
        .catch(() => null);
      await fetchWorkouts();
      if (fitbitResult && fitbitResult.created > 0) {
        addToast(
          `${fitbitResult.created} actividad(es) Fitbit añadida(s) al calendario`,
          "success",
        );
      } else {
        addToast("Sincronización completada", "success");
      }
    } catch {
      addToast("Error al sincronizar", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const closeModal = () => {
    setSelectedDayWorkouts(null);
    setEditingWorkoutId(null);
    setDraftSets([]);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto flex flex-col">
      <CalendarHeader
        currentDate={currentDate}
        isSyncing={isSyncing}
        onPrev={() => setCurrentDate(subMonths(currentDate, 1))}
        onNext={() => setCurrentDate(addMonths(currentDate, 1))}
        onToday={() => setCurrentDate(new Date())}
        onSync={handleSync}
        onCreateEvent={() => setIsCreatingEvent(true)}
      />

      <CalendarGrid
        daysInGrid={daysInGrid}
        currentDate={currentDate}
        workouts={workouts}
        loading={loading}
        onDayClick={(day, dayWorkouts) =>
          setSelectedDayWorkouts({ date: day, workouts: dayWorkouts })
        }
      />

      <CalendarLegend />

      <CreateEventModal
        isOpen={isCreatingEvent}
        onClose={() => setIsCreatingEvent(false)}
        onSubmit={handleCreateEvent}
      />

      <DayDetailModal
        selectedDay={selectedDayWorkouts}
        editingWorkoutId={editingWorkoutId}
        draftSets={draftSets}
        isSaving={isSaving}
        onClose={closeModal}
        onEnterEdit={enterEditMode}
        onCancelEdit={cancelEdit}
        onSaveEdit={saveEdit}
        onDraftChange={setDraftSets}
      />
    </div>
  );
};

export default Calendar;
