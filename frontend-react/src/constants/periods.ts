export const PERIOD_OPTIONS = [
  { value: "7", label: "Semana" },
  { value: "30", label: "Mes" },
  { value: "180", label: "Medio año" },
  { value: "365", label: "Año" },
  { value: "36500", label: "Todo" },
] as const;

export type PeriodValue = (typeof PERIOD_OPTIONS)[number]["value"];

export const GLOBAL_PERIODS = [
  { value: "7", label: "Semana" },
  { value: "30", label: "Mes" },
  { value: "90", label: "Trimestre" },
  { value: "180", label: "Semestre" },
  { value: "365", label: "Año" },
] as const;

export type GlobalPeriodValue = (typeof GLOBAL_PERIODS)[number]["value"];
