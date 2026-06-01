import React from "react";
import { TrendingUp } from "lucide-react";
import { Workout } from "../../services/workout";

type FitbitData = NonNullable<Workout["fitbit_data"]>;

const FitbitZonesBar: React.FC<{ data: FitbitData }> = ({ data: f }) => {
  const totalAzm = f.azm_fat_burn + f.azm_cardio + f.azm_peak;
  if (totalAzm <= 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <TrendingUp size={11} className="text-slate-500" />
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
          Zonas activas ({totalAzm} min)
        </span>
      </div>
      <div className="flex rounded-full overflow-hidden h-2 gap-0.5">
        {f.azm_fat_burn > 0 && (
          <div
            className="bg-yellow-400/70 rounded-full"
            style={{ flex: f.azm_fat_burn }}
            title={`Quema de grasa: ${f.azm_fat_burn} min`}
          />
        )}
        {f.azm_cardio > 0 && (
          <div
            className="bg-orange-400/80 rounded-full"
            style={{ flex: f.azm_cardio }}
            title={`Cardio: ${f.azm_cardio} min`}
          />
        )}
        {f.azm_peak > 0 && (
          <div
            className="bg-red-500 rounded-full"
            style={{ flex: f.azm_peak }}
            title={`Pico: ${f.azm_peak} min`}
          />
        )}
      </div>
      <div className="flex gap-3">
        {f.azm_fat_burn > 0 && (
          <span className="text-[9px] text-yellow-400/70 font-bold">
            Grasa {f.azm_fat_burn}m
          </span>
        )}
        {f.azm_cardio > 0 && (
          <span className="text-[9px] text-orange-400/80 font-bold">
            Cardio {f.azm_cardio}m
          </span>
        )}
        {f.azm_peak > 0 && (
          <span className="text-[9px] text-red-400 font-bold">
            Pico {f.azm_peak}m
          </span>
        )}
      </div>
    </div>
  );
};

export default FitbitZonesBar;
