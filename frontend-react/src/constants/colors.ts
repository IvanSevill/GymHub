export const MUSCLE_COLORS: Record<string, string> = {
  pecho: "#f97316",
  espalda: "#3b82f6",
  pierna: "#a855f7",
  hombro: "#10b981",
  brazo: "#f59e0b",
  abdomen: "#ec4899",
  "glúteo": "#06b6d4",
  "glúte": "#06b6d4",
};

export const CHART_COLORS: string[] = [
  "#f97316",
  "#a855f7",
  "#3b82f6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
];

export const AZM_ZONES = [
  { key: "Quema grasa" as const, fill: "#f59e0b" },
  { key: "Cardio" as const, fill: "#f97316" },
  { key: "Pico" as const, fill: "#ef4444" },
] as const;
