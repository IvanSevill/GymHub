import { parseISO } from "date-fns";

// The backend stores datetimes as UTC without timezone indicator (naive UTC).
// parseISO on a no-Z string treats it as local time, causing an offset equal
// to the UTC offset (e.g. -2h in CEST). Appending "Z" forces UTC interpretation.
export function parseWorkoutTime(s: string): Date {
  if (!s) return new Date(NaN);
  return parseISO(s.endsWith("Z") || s.includes("+") ? s : s + "Z");
}
