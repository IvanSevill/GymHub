import React from "react";
import { Flame, Heart, Timer } from "lucide-react";
import { Workout } from "../../services/workout";
import { fmtDuration } from "../calendar/helpers";

type FitbitData = NonNullable<Workout["fitbit_data"]>;

const FitbitMetricsCompact: React.FC<{ data: FitbitData }> = ({ data: f }) => (
  <div className="mt-3 flex flex-wrap gap-2">
    {f.calories > 0 && (
      <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/15 text-[10px] font-black text-orange-400 tabular-nums">
        <Flame size={10} />
        {f.calories} kcal
      </span>
    )}
    {f.heart_rate_avg > 0 && (
      <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/15 text-[10px] font-black text-red-400 tabular-nums">
        <Heart size={10} />
        {f.heart_rate_avg} bpm
      </span>
    )}
    {f.duration_ms > 0 && (
      <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-[10px] font-black text-slate-400 tabular-nums">
        <Timer size={10} />
        {fmtDuration(f.duration_ms)}
      </span>
    )}
  </div>
);

export default FitbitMetricsCompact;
