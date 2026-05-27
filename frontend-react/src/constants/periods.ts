export const PERIOD_OPTIONS = [
  { value: "7", label: "Semana" },
  { value: "30", label: "Mes" },
  { value: "180", label: "Medio año" },
  { value: "365", label: "Año" },
  { value: "36500", label: "Todo" },
] as const;

export type PeriodValue = (typeof PERIOD_OPTIONS)[number]["value"];
