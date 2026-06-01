import { useEffect, useState } from "react";
import {
  workoutService,
  CardioPendingWorkout,
  SyncCardioResult,
} from "../../../services/workout";

type ModalState = "loading" | "ready" | "empty" | "error" | "syncing" | "done";

export function useCardioSync(isOpen: boolean, onSynced: () => void) {
  const [state, setState] = useState<ModalState>("loading");
  const [workouts, setWorkouts] = useState<CardioPendingWorkout[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<SyncCardioResult | null>(null);

  const loadPending = () => {
    setState("loading");
    workoutService
      .getCardioPending()
      .then((data) => {
        setWorkouts(data);
        setState(data.length === 0 ? "empty" : "ready");
      })
      .catch(() => setState("error"));
  };

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set());
    setResult(null);
    loadPending();
  }, [isOpen]);

  const toggleAll = () => {
    setSelected(
      selected.size === workouts.length
        ? new Set()
        : new Set(workouts.map((w) => w.id)),
    );
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSync = async () => {
    if (selected.size === 0) return;
    setState("syncing");
    try {
      const res = await workoutService.syncCardioToCalendar([...selected]);
      setResult(res);
      setState("done");
      if (res.synced > 0) onSynced();
    } catch {
      setState("error");
    }
  };

  return {
    state,
    workouts,
    selected,
    result,
    toggleAll,
    toggle,
    handleSync,
    retry: loadPending,
  };
}
