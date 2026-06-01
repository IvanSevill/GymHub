import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CheckSquare,
  Flame,
  Heart,
  Loader2,
  MapPin,
  Square,
  Timer,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  workoutService,
  CardioPendingWorkout,
  SyncCardioResult,
} from "../../services/workout";
import { SkeletonBlock } from "../ui/Skeleton";
import { fmtDuration } from "./helpers";

type ModalState = "loading" | "ready" | "empty" | "error" | "syncing" | "done";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSynced: () => void;
}

const CardioUploadModal: React.FC<Props> = ({ isOpen, onClose, onSynced }) => {
  const [state, setState] = useState<ModalState>("loading");
  const [workouts, setWorkouts] = useState<CardioPendingWorkout[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<SyncCardioResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setState("loading");
    setSelected(new Set());
    setResult(null);
    workoutService
      .getCardioPending()
      .then((data) => {
        setWorkouts(data);
        setState(data.length === 0 ? "empty" : "ready");
      })
      .catch(() => setState("error"));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const toggleAll = () => {
    if (selected.size === workouts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(workouts.map((w) => w.id)));
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSync = async () => {
    if (selected.size === 0) return;
    setState("syncing");
    try {
      const res = await workoutService.syncCardioToCalendar([...selected]);
      setResult(res);
      setState("done");
      if (res.synced > 0) onSynced();
    } catch {
      setState("error");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/75 z-50 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
          >
            <div
              className="glass-card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
                <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/15 shrink-0">
                  <Upload size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white tracking-tight">
                    Subir cardio a Google Calendar
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Actividades Fitbit sin evento en Calendar
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5">
                {state === "loading" && (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <SkeletonBlock key={i} className="h-16 rounded-2xl" />
                    ))}
                  </div>
                )}

                {state === "error" && (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                    <AlertCircle size={28} className="text-red-500/60" />
                    <p className="text-sm text-slate-500">
                      Error al cargar las actividades
                    </p>
                    <button
                      onClick={() => {
                        setState("loading");
                        workoutService
                          .getCardioPending()
                          .then((data) => {
                            setWorkouts(data);
                            setState(data.length === 0 ? "empty" : "ready");
                          })
                          .catch(() => setState("error"));
                      }}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      Reintentar
                    </button>
                  </div>
                )}

                {state === "empty" && (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                    <Zap size={28} className="text-slate-700" />
                    <p className="text-sm text-slate-500">
                      No hay actividades de cardio pendientes de subir
                    </p>
                    <p className="text-[10px] text-slate-600 max-w-xs">
                      Todas tus actividades Fitbit ya tienen evento en Google
                      Calendar, o no tienes actividades de cardio registradas.
                    </p>
                  </div>
                )}

                {(state === "ready" || state === "syncing") && (
                  <div className="space-y-2">
                    {/* Select all */}
                    <button
                      onClick={toggleAll}
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
                            onClick={() => toggle(w.id)}
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
                                  {format(parseISO(w.start_time), "d MMM", {
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
                      onClick={handleSync}
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
                )}

                {state === "done" && result && (
                  <div className="space-y-4 text-center py-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto border border-primary/20">
                      <Upload size={20} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-white font-black text-base">
                        Sincronización completada
                      </p>
                      <div className="flex justify-center gap-6 mt-3">
                        {result.synced > 0 && (
                          <div className="text-center">
                            <p className="text-2xl font-black text-primary">
                              {result.synced}
                            </p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                              Subidas
                            </p>
                          </div>
                        )}
                        {result.failed > 0 && (
                          <div className="text-center">
                            <p className="text-2xl font-black text-red-400">
                              {result.failed}
                            </p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                              Fallidas
                            </p>
                          </div>
                        )}
                        {result.already_synced > 0 && (
                          <div className="text-center">
                            <p className="text-2xl font-black text-slate-400">
                              {result.already_synced}
                            </p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                              Ya subidas
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className="btn-secondary text-xs px-6 py-2.5 rounded-xl"
                    >
                      Cerrar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CardioUploadModal;
