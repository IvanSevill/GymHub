import { useState } from "react";
import { parseISO } from "date-fns";
import type { Workout } from "../../../services/workout";
import type { TimeEdit } from "../types";

export function useTimeEdit() {
  const [timeEditId, setTimeEditId] = useState<string | null>(null);
  const [timeEdit, setTimeEdit] = useState<TimeEdit | null>(null);
  const [isSavingTime, setIsSavingTime] = useState(false);

  const startTimeEdit = (w: Workout) => {
    const start = parseISO(w.start_time);
    const end = parseISO(w.end_time);
    setTimeEdit({
      startH: start.getHours(),
      startM: start.getMinutes(),
      endH: end.getHours(),
      endM: end.getMinutes(),
    });
    setTimeEditId(w.id);
  };

  const clear = () => {
    setTimeEditId(null);
    setTimeEdit(null);
  };

  const save = async (
    workouts: Workout[],
    onUpdateTime: (id: string, start: string, end: string) => Promise<void>,
  ): Promise<void> => {
    if (!timeEditId || !timeEdit) return;
    const w = workouts.find((x) => x.id === timeEditId);
    if (!w) return;

    const base = parseISO(w.start_time);
    // Build a local-time ISO string (no UTC conversion) to match the format
    // the backend expects and how other times are stored in the DB.
    // Using toISOString() here would subtract the UTC offset (e.g. -2h in UTC+2).
    const makeISO = (h: number, m: number) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      const dateStr = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
      return `${dateStr}T${pad(h)}:${pad(m)}:00`;
    };

    setIsSavingTime(true);
    try {
      await onUpdateTime(
        timeEditId,
        makeISO(timeEdit.startH, timeEdit.startM),
        makeISO(timeEdit.endH, timeEdit.endM),
      );
      clear();
    } finally {
      setIsSavingTime(false);
    }
  };

  return {
    timeEditId,
    timeEdit,
    isSavingTime,
    startTimeEdit,
    clear,
    save,
    setTimeEdit,
    isActive: (wId: string) => timeEditId === wId,
  };
}
