import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, CalendarDays, LayoutGrid, Check } from "lucide-react";
import { addHours, format } from "date-fns";
import { es } from "date-fns/locale";
import { exerciseService } from "../../services/exercise";
import type { Muscle } from "../../services/exercise";
import type { WeeklyAssignment } from "./types";
import { makeDefaultSplit } from "./helpers";

export interface EventPayload {
  title: string;
  start: string;
  end: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (events: EventPayload[]) => Promise<void>;
}

type Mode = "single" | "weekly";
type SplitType = 3 | 4;

const SPLITS: Record<SplitType, { label: string }[]> = {
  3: [
    { label: "Espalda - Bíceps" },
    { label: "Pecho - Hombros - Tríceps" },
    { label: "Pierna - Abdominales" },
  ],
  4: [
    { label: "Espalda - Bíceps" },
    { label: "Hombros - Tríceps" },
    { label: "Pecho - Abdominales" },
    { label: "Pierna" },
  ],
};

const DEFAULT_TIME = "10:00";
const SPLIT_OFFSETS: Record<SplitType, number[]> = {
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
};

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return format(d, "yyyy-MM-dd");
}

function buildEventTimes(
  date: string,
  time: string,
): { start: string; end: string } {
  const [h, m] = time.split(":").map(Number);
  const start = new Date(`${date}T${time}`);
  start.setHours(h, m, 0, 0);
  const end = addHours(start, 1);
  return {
    start: format(start, "yyyy-MM-dd'T'HH:mm:ss"),
    end: format(end, "yyyy-MM-dd'T'HH:mm:ss"),
  };
}

function fmtDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return format(new Date(y, mo - 1, d), "eee d MMM", { locale: es });
}

function validateSingleForm(
  selectedMuscles: string[],
  singleStart: string,
  singleEnd: string,
): string | null {
  if (selectedMuscles.length === 0)
    return "Selecciona al menos un grupo muscular";
  if (singleEnd <= singleStart)
    return "La hora de fin debe ser posterior al inicio";
  return null;
}

function buildSingleEventTitle(
  muscles: Muscle[],
  selectedIds: string[],
): string {
  return selectedIds
    .map((id) => muscles.find((m) => m.id === id)?.name ?? "")
    .filter(Boolean)
    .map((n) => n.charAt(0).toUpperCase() + n.slice(1))
    .join(" - ");
}

function buildSingleEvent(
  title: string,
  date: string,
  startTime: string,
  endTime: string,
): EventPayload {
  return {
    title,
    start: format(new Date(`${date}T${startTime}`), "yyyy-MM-dd'T'HH:mm:ss"),
    end: format(new Date(`${date}T${endTime}`), "yyyy-MM-dd'T'HH:mm:ss"),
  };
}

function buildWeeklyEvents(
  splitType: SplitType,
  assignments: Record<number, WeeklyAssignment>,
): EventPayload[] {
  return SPLITS[splitType].map((day, i) => ({
    title: day.label,
    ...buildEventTimes(
      assignments[i]?.date ?? daysFromNow(i + 1),
      assignments[i]?.time ?? DEFAULT_TIME,
    ),
  }));
}

// ── Date picker ─────────────────────────────────────────────────────────────

interface DatePickerProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  className = "",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const open = () => {
    try {
      inputRef.current?.showPicker();
    } catch {
      inputRef.current?.click();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={open}
        aria-label="Seleccionar fecha"
        className="flex items-center gap-2 w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white hover:border-primary/40 transition-colors cursor-pointer"
      >
        <CalendarDays size={14} className="text-slate-400 shrink-0" />
        <span className="capitalize">
          {value ? fmtDate(value) : "Seleccionar fecha"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 1,
          height: 1,
          top: 0,
          left: 0,
        }}
      />
    </div>
  );
};

// ── Single-event panel ──────────────────────────────────────────────────────

interface SinglePanelProps {
  muscles: Muscle[];
  selectedMuscles: string[];
  onToggle: (id: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  startTime: string;
  onStartChange: (v: string) => void;
  endTime: string;
  onEndChange: (v: string) => void;
}

const SinglePanel: React.FC<SinglePanelProps> = ({
  muscles,
  selectedMuscles,
  onToggle,
  date,
  onDateChange,
  startTime,
  onStartChange,
  endTime,
  onEndChange,
}) => (
  <div className="space-y-5">
    <div>
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">
        Grupos musculares
      </p>
      {muscles.length === 0 ? (
        <p className="text-[10px] text-slate-600 font-semibold">
          Cargando grupos musculares…
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {muscles.map((m) => {
            const on = selectedMuscles.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => onToggle(m.id)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all capitalize ${
                  on
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300"
                }`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      )}
    </div>

    <div>
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
        Fecha
      </p>
      <DatePicker value={date} onChange={onDateChange} />
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
          Inicio
        </p>
        <input
          type="time"
          value={startTime}
          onChange={(e) => onStartChange(e.target.value)}
          className="w-full bg-black/30 border border-white/10 rounded-2xl px-3 py-3 text-xs text-white outline-none focus:border-primary/50 transition-colors"
        />
      </div>
      <div>
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
          Fin
        </p>
        <input
          type="time"
          value={endTime}
          onChange={(e) => onEndChange(e.target.value)}
          className="w-full bg-black/30 border border-white/10 rounded-2xl px-3 py-3 text-xs text-white outline-none focus:border-primary/50 transition-colors"
        />
      </div>
    </div>
  </div>
);

// ── Weekly-planning panel ───────────────────────────────────────────────────

interface WeeklyPanelProps {
  splitType: SplitType;
  onSplitChange: (t: SplitType) => void;
  assignments: Record<number, WeeklyAssignment>;
  onAssignmentChange: (i: number, val: WeeklyAssignment) => void;
}

const WeeklyPanel: React.FC<WeeklyPanelProps> = ({
  splitType,
  onSplitChange,
  assignments,
  onAssignmentChange,
}) => {
  const split = SPLITS[splitType];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">
          Tipo de split
        </p>
        <div className="grid grid-cols-2 gap-2">
          {([3, 4] as SplitType[]).map((t) => (
            <button
              key={t}
              onClick={() => onSplitChange(t)}
              className={`py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${
                splitType === t
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
              }`}
            >
              Split {t} días
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {split.map((day, i) => {
          const asgn = assignments[i];
          if (!asgn) return null;
          return (
            <div
              key={i}
              className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-black text-primary">
                    {String.fromCharCode(65 + i)}
                  </span>
                </div>
                <p className="text-[11px] font-black text-white leading-tight">
                  {day.label}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1.5">
                    Fecha
                  </p>
                  <DatePicker
                    value={asgn.date}
                    onChange={(v) =>
                      onAssignmentChange(i, { ...asgn, date: v })
                    }
                    className="text-xs"
                  />
                </div>
                <div>
                  <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1.5">
                    Hora inicio
                  </p>
                  <input
                    type="time"
                    value={asgn.time}
                    onChange={(e) =>
                      onAssignmentChange(i, { ...asgn, time: e.target.value })
                    }
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-[9px] text-slate-400 leading-relaxed">
          Cada sesión durará{" "}
          <span className="text-white font-bold">1 hora</span> por defecto.
          Puedes ajustar el horario desde el calendario.
        </p>
      </div>
    </div>
  );
};

// ── Main modal ──────────────────────────────────────────────────────────────

const CreateEventModal: React.FC<Props> = ({ isOpen, onClose, onSubmit }) => {
  const [mode, setMode] = useState<Mode>("single");
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [singleDate, setSingleDate] = useState(() =>
    format(new Date(Date.now() + 86400000), "yyyy-MM-dd"),
  );
  const [singleStart, setSingleStart] = useState(DEFAULT_TIME);
  const [singleEnd, setSingleEnd] = useState("11:00");

  const [splitType, setSplitType] = useState<SplitType>(3);
  const [assignments, setAssignments] = useState<
    Record<number, WeeklyAssignment>
  >(() => makeDefaultSplit(SPLIT_OFFSETS[3]));

  useEffect(() => {
    if (!isOpen) return;
    exerciseService
      .getMuscles()
      .then(setMuscles)
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    setAssignments(makeDefaultSplit(SPLIT_OFFSETS[splitType]));
  }, [splitType]);

  const reset = () => {
    setMode("single");
    setSelectedMuscles([]);
    setSingleDate(format(new Date(Date.now() + 86400000), "yyyy-MM-dd"));
    setSingleStart(DEFAULT_TIME);
    setSingleEnd("11:00");
    setSplitType(3);
    setAssignments(makeDefaultSplit(SPLIT_OFFSETS[3]));
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError("");
    let events: EventPayload[];

    if (mode === "single") {
      const err = validateSingleForm(selectedMuscles, singleStart, singleEnd);
      if (err) {
        setError(err);
        return;
      }
      const title = buildSingleEventTitle(muscles, selectedMuscles);
      events = [buildSingleEvent(title, singleDate, singleStart, singleEnd)];
    } else {
      events = buildWeeklyEvents(splitType, assignments);
    }

    setIsSubmitting(true);
    try {
      await onSubmit(events);
      reset();
    } catch {
      setError("Error al crear los eventos");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMuscle = (id: string) =>
    setSelectedMuscles((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const setModeAndClear = (m: Mode) => {
    setMode(m);
    setError("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 20 }}
            className="bg-surface rounded-t-[2.5rem] sm:rounded-[2rem] border border-white/10 shadow-2xl w-full sm:max-w-lg z-10 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center sticky top-0 bg-surface z-10">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">
                  Nuevo Evento
                </h3>
                <p className="text-[10px] text-primary font-semibold uppercase tracking-widest mt-0.5">
                  Planificación futura
                </p>
              </div>
              <button
                onClick={handleClose}
                aria-label="Cerrar"
                className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mode switcher */}
            <div className="px-6 pt-5">
              <div className="flex gap-1 p-1 bg-black/30 rounded-2xl border border-white/[0.05]">
                <button
                  onClick={() => setModeAndClear("single")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                    mode === "single"
                      ? "bg-primary text-white shadow-lg shadow-primary/20"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <CalendarDays size={11} />
                  Evento único
                </button>
                <button
                  onClick={() => setModeAndClear("weekly")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                    mode === "weekly"
                      ? "bg-primary text-white shadow-lg shadow-primary/20"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <LayoutGrid size={11} />
                  Planificación semanal
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {mode === "single" ? (
                <SinglePanel
                  muscles={muscles}
                  selectedMuscles={selectedMuscles}
                  onToggle={toggleMuscle}
                  date={singleDate}
                  onDateChange={setSingleDate}
                  startTime={singleStart}
                  onStartChange={setSingleStart}
                  endTime={singleEnd}
                  onEndChange={setSingleEnd}
                />
              ) : (
                <WeeklyPanel
                  splitType={splitType}
                  onSplitChange={setSplitType}
                  assignments={assignments}
                  onAssignmentChange={(i, val) =>
                    setAssignments((prev) => ({ ...prev, [i]: val }))
                  }
                />
              )}

              {error && (
                <p className="text-[10px] text-danger font-semibold">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Check size={13} />
                )}
                {mode === "weekly" ? "Planificar semana" : "Crear evento"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CreateEventModal;
