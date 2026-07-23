import React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Upload,
  Calendar as CalIcon,
} from "lucide-react";

interface Props {
  currentDate: Date;
  isSyncing: boolean;
  syncPhase?: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSync: () => void;
  onCreateEvent: () => void;
  onUploadCardio: () => void;
}

const CalendarHeader: React.FC<Props> = ({
  currentDate,
  isSyncing,
  syncPhase,
  onPrev,
  onNext,
  onToday,
  onSync,
  onCreateEvent,
  onUploadCardio,
}) => (
  <div className="flex justify-between items-center bg-white/[0.02] border border-white/[0.06] px-4 py-2 rounded-3xl shrink-0">
    <div className="flex items-center gap-3">
      <div className="hidden sm:flex w-10 h-10 bg-primary/10 rounded-xl items-center justify-center text-primary border border-primary/20 shrink-0">
        <CalIcon size={20} />
      </div>
      <div className="flex flex-col">
        <h1 className="hidden sm:block text-xl font-black text-white uppercase tracking-tighter">
          Calendario
        </h1>
        <p className="text-[10px] sm:text-[8px] font-bold sm:font-semibold text-white sm:text-slate-500 uppercase tracking-[0.15em] capitalize">
          {format(currentDate, "MMMM yyyy", { locale: es })}
        </p>
        {isSyncing && syncPhase && (
          <p className="text-[9px] font-bold text-primary/80 uppercase tracking-[0.12em] mt-0.5 animate-pulse">
            {syncPhase}
          </p>
        )}
      </div>
    </div>

    <div className="flex items-center gap-1 sm:gap-2">
      <button
        onClick={onUploadCardio}
        title="Subir cardio de Fitbit a Google Calendar"
        className="p-2 hover:bg-primary/10 rounded-xl transition-all text-slate-500 hover:text-primary border border-transparent hover:border-primary/20"
      >
        <Upload size={15} />
      </button>
      <button
        onClick={onCreateEvent}
        title="Nuevo evento futuro"
        className="p-2 hover:bg-primary/10 rounded-xl transition-all text-slate-500 hover:text-primary border border-transparent hover:border-primary/20"
      >
        <Plus size={16} />
      </button>
      <button
        onClick={onSync}
        disabled={isSyncing}
        title="Sincronizar con Google Calendar y Fitbit"
        className="p-2 hover:bg-primary/10 rounded-xl transition-all text-slate-500 hover:text-primary border border-transparent hover:border-primary/20 disabled:opacity-40"
      >
        <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
      </button>
      <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 items-center gap-0.5">
        <button
          onClick={onPrev}
          className="p-1.5 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={onToday}
          className="hidden sm:block px-3 py-1.5 text-[10px] font-black text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all uppercase tracking-widest"
        >
          Hoy
        </button>
        <button
          onClick={onNext}
          className="p-1.5 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  </div>
);

export default CalendarHeader;
