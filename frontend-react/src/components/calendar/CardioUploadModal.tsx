import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Upload, X, Zap } from "lucide-react";
import { SkeletonBlock } from "../ui/Skeleton";
import type { SyncCardioResult } from "../../services/workout";
import { useCardioSync } from "./hooks/useCardioSync";
import CardioReadyView from "./components/CardioReadyView";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSynced: () => void;
}

const CardioUploadModal: React.FC<Props> = ({ isOpen, onClose, onSynced }) => {
  const {
    state,
    workouts,
    selected,
    result,
    toggleAll,
    toggle,
    handleSync,
    retry,
  } = useCardioSync(isOpen, onSynced);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

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
                  aria-label="Cerrar"
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
                      onClick={retry}
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
                  <CardioReadyView
                    workouts={workouts}
                    selected={selected}
                    state={state}
                    onToggleAll={toggleAll}
                    onToggle={toggle}
                    onSync={handleSync}
                  />
                )}

                {state === "done" && result && (
                  <DoneView result={result} onClose={onClose} />
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

/* ── Done view ─────────────────────────────────────────────────── */

const DoneView: React.FC<{ result: SyncCardioResult; onClose: () => void }> = ({
  result,
  onClose,
}) => (
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
            <p className="text-2xl font-black text-primary">{result.synced}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
              Subidas
            </p>
          </div>
        )}
        {result.failed > 0 && (
          <div className="text-center">
            <p className="text-2xl font-black text-red-400">{result.failed}</p>
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
);

export default CardioUploadModal;
