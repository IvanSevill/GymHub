import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { workoutService, type Workout } from "../../../services/workout";
import { useCalendarWorkouts } from "./useCalendarWorkouts";

vi.mock("../../../services/workout", () => ({
  workoutService: { getWorkouts: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const workout = (id: string): Workout => ({
  id,
  user_id: "user",
  start_time: "2026-07-16T10:00:00",
  end_time: "2026-07-16T11:00:00",
  title: id,
  exercise_sets: [],
});

describe("useCalendarWorkouts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows only the latest request to update workouts and loading state", async () => {
    const older = deferred<Workout[]>();
    const newer = deferred<Workout[]>();
    vi.mocked(workoutService.getWorkouts)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { result } = renderHook(() => useCalendarWorkouts());

    let olderRequest!: Promise<Workout[]>;
    let newerRequest!: Promise<Workout[]>;
    act(() => {
      olderRequest = result.current.fetchWorkouts();
      newerRequest = result.current.fetchWorkouts();
    });
    await act(async () => newer.resolve([workout("new")]));
    await newerRequest;
    expect(result.current.workouts[0].id).toBe("new");
    expect(result.current.loading).toBe(false);

    await act(async () => older.resolve([workout("old")]));
    await olderRequest;
    expect(result.current.workouts[0].id).toBe("new");
    expect(result.current.loading).toBe(false);
  });

  it("preserves workouts on refresh failure and propagates only when requested", async () => {
    vi.mocked(workoutService.getWorkouts)
      .mockResolvedValueOnce([workout("visible")])
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useCalendarWorkouts());
    await act(async () => {
      await result.current.fetchWorkouts();
    });
    await act(async () => {
      await result.current.fetchWorkouts();
    });
    expect(result.current.workouts[0].id).toBe("visible");
    expect(result.current.error).toBe(true);

    await expect(
      act(async () => result.current.fetchWorkouts({ propagateError: true })),
    ).rejects.toThrow("offline");
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
