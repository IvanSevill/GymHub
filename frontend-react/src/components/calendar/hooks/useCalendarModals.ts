import { useState } from "react";
import type { Workout } from "../../../services/workout";

export function useCalendarModals() {
  const [selectedDayWorkouts, setSelectedDayWorkouts] = useState<{
    date: Date;
    workouts: Workout[];
  } | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isUploadingCardio, setIsUploadingCardio] = useState(false);

  return {
    selectedDayWorkouts,
    setSelectedDayWorkouts,
    isCreatingEvent,
    setIsCreatingEvent,
    isUploadingCardio,
    setIsUploadingCardio,
  };
}
