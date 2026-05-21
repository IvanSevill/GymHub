import React from "react";
import { Zap } from "lucide-react";

const CalendarLegend: React.FC = () => (
  <div className="flex justify-center gap-5 py-3 px-4 glass-card shrink-0 flex-wrap">
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_5px_rgba(249,115,22,0.6)]" />
      <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
        Con Fitbit
      </span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-primary/40 border border-primary/40" />
      <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
        Sin Fitbit
      </span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full border border-primary/60" />
      <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
        Planeado
      </span>
    </div>
    <div className="flex items-center gap-2">
      <Zap size={11} className="text-accent fill-accent" />
      <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
        Cardio
      </span>
    </div>
  </div>
);

export default CalendarLegend;
