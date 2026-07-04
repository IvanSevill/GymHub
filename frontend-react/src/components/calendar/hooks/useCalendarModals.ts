import { useState } from "react";

export function useCalendarModals() {
  // Only the selected day is stored; the day's workouts are derived from the
  // live workout list in the page, so any refresh (e.g. a Fitbit sync) flows
  // into the open modal without needing to re-snapshot them here.
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isUploadingCardio, setIsUploadingCardio] = useState(false);

  return {
    selectedDayDate,
    setSelectedDayDate,
    isCreatingEvent,
    setIsCreatingEvent,
    isUploadingCardio,
    setIsUploadingCardio,
  };
}
