import React from "react";
import { Timer, Flame, Heart, MapPin } from "lucide-react";
import { Workout } from "../../services/workout";
import { fmtDuration } from "../calendar/helpers";

type FitbitData = NonNullable<Workout["fitbit_data"]>;

const FitbitMetricsGrid: React.FC<{ data: FitbitData }> = ({ data: f }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
    {f.duration_ms > 0 && (
      <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
        <Timer size={13} className="text-slate-400 shrink-0" />
        <div>
          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
            Duración
          </p>
          <p className="text-sm font-black text-white tabular-nums">
            {fmtDuration(f.duration_ms)}
          </p>
        </div>
      </div>
    )}
    {f.calories > 0 && (
      <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
        <Flame size={13} className="text-orange-400 shrink-0" />
        <div>
          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
            Calorías
          </p>
          <p className="text-sm font-black text-orange-400 tabular-nums">
            {f.calories}
          </p>
        </div>
      </div>
    )}
    {f.heart_rate_avg > 0 && (
      <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
        <Heart size={13} className="text-red-400 shrink-0" />
        <div>
          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
            FC Media
          </p>
          <p className="text-sm font-black text-red-400 tabular-nums">
            {f.heart_rate_avg} bpm
          </p>
        </div>
      </div>
    )}
    {f.distance_km > 0 && (
      <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
        <MapPin size={13} className="text-blue-400 shrink-0" />
        <div>
          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
            Distancia
          </p>
          <p className="text-sm font-black text-blue-400 tabular-nums">
            {f.distance_km.toFixed(1)} km
          </p>
        </div>
      </div>
    )}
  </div>
);

export default FitbitMetricsGrid;
