import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useToast } from "../context/ToastContext";
import { workoutService, type Workout } from "../services/workout";
import {
  SyncDiagnosticError,
  invalidSyncResponse,
} from "../services/syncDiagnostics";
import Calendar from "./Calendar";

vi.mock("../context/ToastContext", () => ({ useToast: vi.fn() }));
vi.mock("../services/workout", () => ({
  workoutService: {
    getWorkouts: vi.fn(),
    syncAllFromCalendar: vi.fn(),
    syncFitbitBulk: vi.fn(),
    syncFitbitCreate: vi.fn(),
    deleteWorkout: vi.fn(),
    createWorkout: vi.fn(),
    updateWorkout: vi.fn(),
  },
}));
vi.mock("../components/calendar/hooks/useWorkoutEdit", () => ({
  useWorkoutEdit: () => ({
    editingWorkoutId: null,
    draftSets: [],
    isSaving: false,
    enterEditMode: vi.fn(),
    cancelEdit: vi.fn(),
    saveEdit: vi.fn(),
    setDraftSets: vi.fn(),
  }),
}));
vi.mock("../components/calendar/hooks/useCalendarModals", () => ({
  useCalendarModals: () => ({
    selectedDayDate: new Date(2026, 6, 16, 12),
    setSelectedDayDate: vi.fn(),
    isCreatingEvent: false,
    setIsCreatingEvent: vi.fn(),
    isUploadingCardio: false,
    setIsUploadingCardio: vi.fn(),
  }),
}));
vi.mock("../components/calendar/CalendarHeader", () => ({
  default: ({
    onSync,
    isSyncing,
  }: {
    onSync: () => void;
    isSyncing: boolean;
  }) => (
    <button data-testid="sync" onClick={onSync}>
      {isSyncing ? "syncing" : "sync"}
    </button>
  ),
}));
vi.mock("../components/calendar/CalendarGrid", () => ({
  default: () => <div />,
}));
vi.mock("../components/calendar/CalendarLegend", () => ({
  default: () => <div />,
}));
vi.mock("../components/calendar/CreateEventModal", () => ({
  default: () => <div />,
}));
vi.mock("../components/calendar/CardioUploadModal", () => ({
  default: () => <div />,
}));
vi.mock("../components/ui/ErrorState", () => ({
  default: () => <div>error state</div>,
}));
vi.mock("../components/calendar/DayDetailModal", () => ({
  default: ({
    selectedDay,
  }: {
    selectedDay: { workouts: Workout[] } | null;
  }) => (
    <div data-testid="modal-calories">
      {selectedDay?.workouts[0]?.fitbit_data?.calories ?? "none"}
    </div>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const refreshedWorkout: Workout = {
  id: "workout-1",
  user_id: "user",
  start_time: "2026-07-16T10:00:00",
  end_time: "2026-07-16T11:00:00",
  title: "Weights",
  exercise_sets: [],
  fitbit_data: {
    calories: 420,
    heart_rate_avg: 130,
    duration_ms: 3600000,
    azm_fat_burn: 10,
    azm_cardio: 5,
    azm_peak: 0,
    distance_km: 0,
    elevation_gain_m: 0,
    has_gps: false,
  },
};

describe("Calendar sync orchestration", () => {
  const addToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useToast).mockReturnValue({
      addToast,
      removeToast: vi.fn(),
      toasts: [],
    });
    vi.mocked(workoutService.getWorkouts).mockResolvedValue([]);
    vi.mocked(workoutService.syncAllFromCalendar).mockResolvedValue({
      message: "ok",
    });
    vi.mocked(workoutService.syncFitbitBulk).mockImplementation(async (id) => ({
      synced: 0,
      not_found: 0,
      total: 0,
      failed: 0,
      outcome: "no_data",
      correlation_id: id,
      issues: [],
    }));
    vi.mocked(workoutService.syncFitbitCreate).mockImplementation(
      async (id) => ({
        created: 0,
        created_activities: [],
        failed: 0,
        outcome: "no_data",
        correlation_id: id,
        issues: [],
      }),
    );
  });

  it("shares one correlation ID, preserves step order, and ignores duplicate clicks", async () => {
    const firstStep = deferred<{ message: string }>();
    vi.mocked(workoutService.syncAllFromCalendar).mockReturnValue(
      firstStep.promise,
    );
    render(<Calendar />);
    await waitFor(() =>
      expect(workoutService.getWorkouts).toHaveBeenCalledTimes(1),
    );

    fireEvent.click(screen.getByTestId("sync"));
    fireEvent.click(screen.getByTestId("sync"));
    expect(workoutService.syncAllFromCalendar).toHaveBeenCalledTimes(1);
    firstStep.resolve({ message: "ok" });

    await waitFor(() =>
      expect(workoutService.syncFitbitCreate).toHaveBeenCalledTimes(1),
    );
    const correlationIds = [
      vi.mocked(workoutService.syncAllFromCalendar).mock.calls[0][0],
      vi.mocked(workoutService.syncFitbitBulk).mock.calls[0][0],
      vi.mocked(workoutService.syncFitbitCreate).mock.calls[0][0],
    ];
    expect(new Set(correlationIds).size).toBe(1);
    expect(addToast).toHaveBeenCalledTimes(1);
  });

  it("treats partial 200 responses as stage-aware diagnostics", async () => {
    vi.mocked(workoutService.syncFitbitBulk).mockImplementation(async (id) => ({
      synced: 1,
      not_found: 0,
      total: 2,
      failed: 1,
      outcome: "partial",
      correlation_id: id,
      issues: [
        {
          stage: "processing",
          code: "FITBIT_ACTIVITY_PROCESSING_FAILED",
          retryable: false,
          count: 1,
        },
      ],
    }));
    render(<Calendar />);
    await waitFor(() =>
      expect(workoutService.getWorkouts).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getByTestId("sync"));

    await waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(addToast.mock.calls[0][0]).toContain("procesar o asociar");
    expect(addToast.mock.calls[0][1]).toBe("error");
    expect(addToast.mock.calls[0][2]).toBe(10000);
    expect(addToast.mock.calls[0][0]).not.toBe("Sincronización completada");
  });

  it("shows a safe thrown stage and releases the spinner", async () => {
    const correlationId = "50debc2b-c826-46d0-9b6e-bf2a4dd9257f";
    vi.mocked(workoutService.syncFitbitBulk).mockRejectedValue(
      new SyncDiagnosticError({
        stage: "database_persistence",
        code: "FITBIT_PERSISTENCE_FAILED",
        retryable: true,
        correlationId,
      }),
    );
    render(<Calendar />);
    await waitFor(() =>
      expect(workoutService.getWorkouts).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getByTestId("sync"));

    await waitFor(() =>
      expect(screen.getByTestId("sync").textContent).toBe("sync"),
    );
    expect(addToast.mock.calls[0][0]).toContain(
      "No se aplicaron los cambios pendientes",
    );
    expect(addToast.mock.calls[0][0]).toContain(correlationId);
  });

  it("releases the spinner and reports completion after StrictMode effect replay", async () => {
    const firstStep = deferred<{ message: string }>();
    vi.mocked(workoutService.syncAllFromCalendar).mockReturnValue(
      firstStep.promise,
    );
    render(
      <StrictMode>
        <Calendar />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(workoutService.getWorkouts).toHaveBeenCalledTimes(2),
    );

    fireEvent.click(screen.getByTestId("sync"));
    expect(screen.getByTestId("sync").textContent).toBe("syncing");
    firstStep.resolve({ message: "ok" });

    await waitFor(() =>
      expect(screen.getByTestId("sync").textContent).toBe("sync"),
    );
    expect(addToast).toHaveBeenCalledWith(
      "Sincronización completada",
      "success",
    );
  });

  it("treats malformed success responses as HTTP diagnostics", async () => {
    const correlationId = "50debc2b-c826-46d0-9b6e-bf2a4dd9257f";
    vi.mocked(workoutService.syncFitbitBulk).mockRejectedValue(
      invalidSyncResponse(correlationId),
    );
    render(<Calendar />);
    await waitFor(() =>
      expect(workoutService.getWorkouts).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getByTestId("sync"));

    await waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(addToast.mock.calls[0][0]).toContain(
      "No se pudo comunicar con GymHub",
    );
    expect(addToast.mock.calls[0][0]).toContain(correlationId);
    expect(screen.getByTestId("sync").textContent).toBe("sync");
  });

  it("refreshes live modal data after success", async () => {
    vi.mocked(workoutService.getWorkouts)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([refreshedWorkout]);
    render(<Calendar />);
    await waitFor(() =>
      expect(workoutService.getWorkouts).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getByTestId("sync"));

    await waitFor(() =>
      expect(screen.getByTestId("modal-calories").textContent).toBe("420"),
    );
    expect(addToast).toHaveBeenCalledWith(
      "Sincronización completada",
      "success",
    );
  });

  it("does not claim success when the final refresh fails", async () => {
    vi.mocked(workoutService.getWorkouts)
      .mockResolvedValueOnce([refreshedWorkout])
      .mockRejectedValueOnce(
        invalidSyncResponse("50debc2b-c826-46d0-9b6e-bf2a4dd9257f"),
      );
    render(<Calendar />);
    await waitFor(() =>
      expect(screen.getByTestId("modal-calories").textContent).toBe("420"),
    );
    fireEvent.click(screen.getByTestId("sync"));

    await waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(addToast.mock.calls[0][0]).toContain(
      "No se pudo comunicar con GymHub",
    );
    expect(addToast.mock.calls[0][1]).toBe("error");
    expect(screen.getByTestId("modal-calories").textContent).toBe("420");
  });
});
