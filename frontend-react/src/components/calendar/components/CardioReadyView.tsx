import React from "react";
import {
  CheckSquare,
  Flame,
  Heart,
  Loader2,
  MapPin,
  Square,
  Timer,
  Upload,
} from "lucide-react";
import { format } from "date-fns";
import { parseWorkoutTime } from "../../../utils/dateUtils";
import { es } from "date-fns/locale";
import type { CardioPendingWorkout } from "../../../services/workout";
import { fmtDuration } from "../helpers";

type SyncState = "ready" | "syncing";

interface Props {
  workouts: CardioPendingWorkout[];
  selected: Set<string>;
  state: SyncState;
  onToggleAll: () => void;
  onToggle: (id: string) => void;
  onSync: () => void;
}

const CardioReadyView: React.FC<Props> = ({
  workouts,
  selected,
  state,
  onToggleAll,
  onToggle,
  onSync,
}) => (
  <div className="space-y-2">
    <button
      onClick={onToggleAll}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition-colors"
    >
      {selected.size === workouts.length ? (
        <CheckSquare size={14} className="text-primary" />
      ) : (
        <Square size={14} />
      )}
      Seleccionar todo ({workouts.length})
    </button>

    <div className="space-y-2 max-h-64 overflow-y-auto">
      {workouts.map((w) => {
        const isSelected = selected.has(w.id);
        return (
          <button
            key={w.id}
            onClick={() => onToggle(w.id)}
            disabled={state === "syncing"}
            className="w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-all border disabled:opacity-50"
            style={{
              background: isSelected
                ? "rgba(249,115,22,0.06)"
                : "rgba(255,255,255,0.03)",
              borderColor: isSelected
                ? "rgba(249,115,22,0.3)"
                : "rgba(255,255,255,0.07)",
            }}
          >
            <div className="mt-0.5 shrink-0 text-primary">
              {isSelected ? (
                <CheckSquare size={14} />
              ) : (
                <Square size={14} className="text-slate-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  {w.activity_name}
                </span>
                <span className="text-[10px] text-slate-500">
                  {format(parseWorkoutTime(w.start_time), "d MMM", {
                    locale: es,
                  })}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {w.duration_ms > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Timer size={9} />
                    {fmtDuration(w.duration_ms)}
                  </span>
                )}
                {w.calories > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-orange-400/80">
                    <Flame size={9} />
                    {w.calories} kcal
                  </span>
                )}
                {w.heart_rate_avg > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-red-400/80">
                    <Heart size={9} />
                    {w.heart_rate_avg} bpm
                  </span>
                )}
                {w.distance_km > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-blue-400/80">
                    <MapPin size={9} />
                    {w.distance_km.toFixed(1)} km
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>

    <button
      onClick={onSync}
      disabled={selected.size === 0 || state === "syncing"}
      className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-40"
      style={{ background: "rgba(249,115,22,0.9)" }}
    >
      {state === "syncing" ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Subiendo…
        </>
      ) : (
        <>
          <Upload size={14} />
          Subir{" "}
          {selected.size > 0
            ? `${selected.size} actividad${selected.size !== 1 ? "es" : ""}`
            : "seleccionadas"}
        </>
      )}
    </button>
  </div>
);

export default CardioReadyView;
