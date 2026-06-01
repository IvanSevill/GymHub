// formatWeek: used in WorkoutFrequencyChart and MuscleBalanceChart
export function formatWeek(w: string): string {
  const parts = w.split("-W");
  return parts.length === 2 ? `S${parts[1]}` : w;
}

// fmtVolume: used in VolumeTrendChart and MuscleBalanceChart
export function fmtVolume(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}kg`;
}

// capitalize: used in MuscleBalanceChart, WeightProgressCard, FrequencyAnalysisCard
export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
