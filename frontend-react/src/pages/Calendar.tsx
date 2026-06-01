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

const Calendar: React.FC = () => {
  const { addToast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);

  const { workouts, loading, fetchWorkouts } = useCalendarWorkouts();
  const {
    selectedDayWorkouts,
    setSelectedDayWorkouts,
    isCreatingEvent,
    setIsCreatingEvent,
    isUploadingCardio,
    setIsUploadingCardio,
  } = useCalendarModals();

  // Refreshes the workout list and keeps the open day-modal in sync
  const refreshAll = useCallback(async () => {
    const fresh = await fetchWorkouts();
    setSelectedDayWorkouts((prev) => {
      if (!prev) return null;
      return {
        date: prev.date,
        workouts: fresh.filter((w) =>
          isSameDay(parseWorkoutTime(w.start_time), prev.date),
        ),
      };
    });
  }, [fetchWorkouts, setSelectedDayWorkouts]);

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
    await workoutService.deleteWorkout(workoutId);
    const fresh = await fetchWorkouts();
    setSelectedDayWorkouts((prev) => {
      if (!prev) return null;
      const remaining = fresh.filter((w) =>
        isSameDay(parseWorkoutTime(w.start_time), prev.date),
      );
      return remaining.length > 0
        ? { date: prev.date, workouts: remaining }
        : null;
    });
    addToast("Evento eliminado", "success");
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
    try {
      // Step 1: pull calendar events into DB
      await workoutService.syncAllFromCalendar().catch(() => {});
      // Step 2: attach Fitbit data to existing gym workouts
      await workoutService.syncFitbitBulk().catch(() => null);
      // Step 3: create standalone workouts for Fitbit activities not yet in DB
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
    setSelectedDayWorkouts(null);
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
