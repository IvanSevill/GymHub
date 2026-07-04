import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isSameDay,
} from "date-fns";
import { parseWorkoutTime } from "../utils/dateUtils";
import { workoutService, WorkoutCreate } from "../services/workout";
import { useToast } from "../context/ToastContext";
import CalendarHeader from "../components/calendar/CalendarHeader";
import CalendarGrid from "../components/calendar/CalendarGrid";
import CalendarLegend from "../components/calendar/CalendarLegend";
import CreateEventModal, {
  EventPayload,
} from "../components/calendar/CreateEventModal";
import DayDetailModal from "../components/calendar/DayDetailModal";
import CardioUploadModal from "../components/calendar/CardioUploadModal";
import { useCalendarWorkouts } from "../components/calendar/hooks/useCalendarWorkouts";
import { useWorkoutEdit } from "../components/calendar/hooks/useWorkoutEdit";
import { useCalendarModals } from "../components/calendar/hooks/useCalendarModals";
import { MS_PER_DAY, CALENDAR_GRID_SIZE } from "../components/calendar/helpers";
import ErrorState from "../components/ui/ErrorState";

const Calendar: React.FC = () => {
  const { addToast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);

  const { workouts, loading, error, fetchWorkouts } = useCalendarWorkouts();
  const {
    selectedDayDate,
    setSelectedDayDate,
    isCreatingEvent,
    setIsCreatingEvent,
    isUploadingCardio,
    setIsUploadingCardio,
  } = useCalendarModals();

  // The open day-modal is derived from the live workout list, so any refresh
  // (calendar pull, Fitbit sync, edit, delete) flows into it automatically.
  // A day left with no workouts collapses to null, which closes the modal.
  const selectedDayWorkouts = useMemo(() => {
    if (!selectedDayDate) return null;
    const dayWorkouts = workouts.filter((w) =>
      isSameDay(parseWorkoutTime(w.start_time), selectedDayDate),
    );
    return dayWorkouts.length > 0
      ? { date: selectedDayDate, workouts: dayWorkouts }
      : null;
  }, [workouts, selectedDayDate]);

  // Refresh the workout list; the derived day-modal above updates on its own.
  const refreshAll = useCallback(async () => {
    await fetchWorkouts();
  }, [fetchWorkouts]);

  const {
    editingWorkoutId,
    draftSets,
    isSaving,
    enterEditMode,
    cancelEdit,
    saveEdit,
    setDraftSets,
  } = useWorkoutEdit(refreshAll);

  const daysInGrid = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const result = [...days];
    // Pad to a fixed 6×7 grid
    while (result.length < CALENDAR_GRID_SIZE) {
      result.push(new Date(result[result.length - 1].getTime() + MS_PER_DAY));
    }
    return result;
  }, [currentDate]);

  useEffect(() => {
    fetchWorkouts();
  }, [currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteWorkout = async (workoutId: string) => {
    try {
      await workoutService.deleteWorkout(workoutId);
      // The derived day-modal recomputes from the refreshed list and closes
      // itself if this was the day's last workout.
      await fetchWorkouts();
      addToast("Evento eliminado", "success");
    } catch {
      addToast("No se pudo eliminar el evento", "error");
    }
  };

  const handleCreateEvent = async (events: EventPayload[]) => {
    await Promise.all(
      events.map((e) =>
        workoutService.createWorkout({
          title: e.title,
          start_time: e.start,
          end_time: e.end,
          exercise_sets: [],
        } as WorkoutCreate),
      ),
    );
    await fetchWorkouts();
    setIsCreatingEvent(false);
    addToast(
      events.length > 1
        ? `${events.length} sesiones planificadas correctamente`
        : "Evento creado correctamente",
      "success",
    );
  };

  const handleSync = async () => {
    setIsSyncing(true);
    // Each step is independent and best-effort (e.g. Fitbit may be
    // disconnected), so a failing step must not abort the others. But we no
    // longer swallow failures silently: we count them and warn the user if
    // any step did not complete.
    let failures = 0;
    let fitbitResult: Awaited<
      ReturnType<typeof workoutService.syncFitbitCreate>
    > | null = null;
    try {
      // Step 1: pull calendar events into DB
      try {
        await workoutService.syncAllFromCalendar();
      } catch {
        failures++;
      }
      // Step 2: attach Fitbit data to existing gym workouts
      try {
        await workoutService.syncFitbitBulk();
      } catch {
        failures++;
      }
      // Step 3: create standalone workouts for Fitbit activities not yet in DB
      try {
        fitbitResult = await workoutService.syncFitbitCreate();
      } catch {
        failures++;
      }
      await fetchWorkouts();

      if (failures > 0) {
        addToast(
          "Sincronización parcial: algunos pasos no se completaron",
          "error",
        );
      } else if (fitbitResult && fitbitResult.created > 0) {
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

  const handleUpdateTime = async (
    workoutId: string,
    startTime: string,
    endTime: string,
  ) => {
    const workout = workouts.find((w) => w.id === workoutId);
    if (!workout) return;
    await workoutService.updateWorkout(workoutId, {
      start_time: startTime,
      end_time: endTime,
      title: workout.title,
      exercise_sets: workout.exercise_sets.map((s) => ({
        exercise_id: s.exercise_id,
        value: s.value,
        measurement: s.measurement,
        is_completed: s.is_completed,
      })),
    });
    await refreshAll();
    addToast("Horario actualizado", "success");
  };

  const closeModal = () => {
    setSelectedDayDate(null);
    cancelEdit();
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
        onUploadCardio={() => setIsUploadingCardio(true)}
      />

      {error && !loading ? (
        <ErrorState
          message="No se pudieron cargar tus entrenamientos. Comprueba tu conexión e inténtalo de nuevo."
          onRetry={() => fetchWorkouts()}
          retrying={loading}
        />
      ) : (
        <CalendarGrid
          daysInGrid={daysInGrid}
          currentDate={currentDate}
          workouts={workouts}
          loading={loading}
          onDayClick={(day) => setSelectedDayDate(day)}
        />
      )}

      <CalendarLegend />

      <CreateEventModal
        isOpen={isCreatingEvent}
        onClose={() => setIsCreatingEvent(false)}
        onSubmit={handleCreateEvent}
      />

      <CardioUploadModal
        isOpen={isUploadingCardio}
        onClose={() => setIsUploadingCardio(false)}
        onSynced={fetchWorkouts}
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
        onDelete={handleDeleteWorkout}
        onUpdateTime={handleUpdateTime}
      />
    </div>
  );
};

export default Calendar;
