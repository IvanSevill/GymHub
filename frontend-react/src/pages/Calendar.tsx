import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  createCorrelationId,
  normalizeSyncError,
  prioritizeDiagnostics,
  syncDiagnosticMessage,
  type SyncDiagnostic,
} from "../services/syncDiagnostics";

const Calendar: React.FC = () => {
  const { addToast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState("");
  const syncInFlight = useRef(false);
  const syncSequence = useRef(0);
  const mounted = useRef(true);

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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    const operationId = ++syncSequence.current;
    const correlationId = createCorrelationId();
    const diagnostics: SyncDiagnostic[] = [];
    let bulkResult: Awaited<
      ReturnType<typeof workoutService.syncFitbitBulk>
    > | null = null;
    let fitbitResult: Awaited<
      ReturnType<typeof workoutService.syncFitbitCreate>
    > | null = null;
    setIsSyncing(true);
    try {
      // Step 1: pull calendar events into DB
      setSyncPhase("Calendar");
      try {
        await workoutService.syncAllFromCalendar(correlationId);
      } catch (syncError) {
        diagnostics.push(normalizeSyncError(syncError, correlationId));
      }
      // Step 2: attach Fitbit data to existing gym workouts
      setSyncPhase("Fitbit");
      try {
        bulkResult = await workoutService.syncFitbitBulk(correlationId);
        if (bulkResult.outcome === "partial") {
          const issues =
            bulkResult.issues.length > 0
              ? bulkResult.issues
              : [
                  {
                    stage: "processing" as const,
                    code: "FITBIT_PROCESSING_FAILED",
                    retryable: false,
                  },
                ];
          diagnostics.push(
            ...issues.map((issue) => ({
              stage: issue.stage,
              code: issue.code,
              retryable: issue.retryable,
              correlationId: bulkResult!.correlation_id,
            })),
          );
        }
      } catch (syncError) {
        diagnostics.push(normalizeSyncError(syncError, correlationId));
      }
      // Step 3: create standalone workouts for Fitbit activities not yet in DB
      setSyncPhase("Act. nuevas");
      try {
        fitbitResult = await workoutService.syncFitbitCreate(correlationId);
        if (fitbitResult.outcome === "partial") {
          const issues =
            fitbitResult.issues.length > 0
              ? fitbitResult.issues
              : [
                  {
                    stage: "processing" as const,
                    code: "FITBIT_PROCESSING_FAILED",
                    retryable: false,
                  },
                ];
          diagnostics.push(
            ...issues.map((issue) => ({
              stage: issue.stage,
              code: issue.code,
              retryable: issue.retryable,
              correlationId: fitbitResult!.correlation_id,
            })),
          );
        }
      } catch (syncError) {
        diagnostics.push(normalizeSyncError(syncError, correlationId));
      }
      try {
        await fetchWorkouts({ propagateError: true });
      } catch (refreshError) {
        diagnostics.push(normalizeSyncError(refreshError, correlationId));
      }

      if (!mounted.current || syncSequence.current !== operationId) return;
      const primaryDiagnostic = prioritizeDiagnostics(diagnostics);
      if (primaryDiagnostic) {
        const errMsg = syncDiagnosticMessage(primaryDiagnostic);
        console.log("[Sync error]", {
          diagnostic: primaryDiagnostic,
          message: errMsg,
        });
        addToast(errMsg, "error", 10000);
      } else {
        // Prefer the backend's human-readable message when available
        const bulkMsg = bulkResult?.message;
        const fitbitMsg = fitbitResult?.message;
        let displayMsg = "";
        if (bulkMsg && fitbitMsg) {
          displayMsg = `${bulkMsg} ${fitbitMsg}`;
        } else if (bulkMsg) {
          displayMsg = bulkMsg;
        } else if (fitbitMsg) {
          displayMsg = fitbitMsg;
        } else {
          displayMsg = "Sincronización completada";
        }
        console.log("[Sync OK]", {
          message: displayMsg,
          bulk: bulkResult
            ? {
                outcome: bulkResult.outcome,
                synced: bulkResult.synced,
                not_found: bulkResult.not_found,
                total: bulkResult.total,
                message: bulkResult.message,
              }
            : null,
          fitbit: fitbitResult
            ? {
                outcome: fitbitResult.outcome,
                created: fitbitResult.created,
                message: fitbitResult.message,
              }
            : null,
        });
        addToast(displayMsg, "success");
      }
    } catch (uiError) {
      if (mounted.current && syncSequence.current === operationId) {
        const diagnostic = normalizeSyncError(uiError, correlationId);
        const errMsg = syncDiagnosticMessage(diagnostic);
        console.log("[Sync exception]", { diagnostic, message: errMsg });
        addToast(errMsg, "error", 10000);
      }
    } finally {
      if (syncSequence.current === operationId) {
        syncInFlight.current = false;
        if (mounted.current) {
          setIsSyncing(false);
          setSyncPhase("");
        }
      }
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
        syncPhase={syncPhase}
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
