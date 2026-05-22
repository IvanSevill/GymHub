import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Calendar, Loader2, AlertTriangle, Star } from "lucide-react";

interface CalendarItem {
  id: string;
  summary: string;
  primary?: boolean;
}

interface Props {
  fetchCalendars: () => Promise<CalendarItem[]>;
  onSelect: (id: string) => Promise<void>;
}

const CalendarSetup: React.FC<Props> = ({ fetchCalendars, onSelect }) => {
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    fetchCalendars()
      .then((data) => {
        setCalendars(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const handleSelect = async (id: string) => {
    if (selecting) return;
    setSelecting(id);
    try {
      await onSelect(id);
    } catch {
      setSelecting(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
      {/* Subtle background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(249,115,22,0.06) 0%, transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-12">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Activity size={18} className="text-primary" />
          </div>
          <span className="text-white font-black text-xl tracking-tight uppercase">
            GymHub
          </span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-black text-white tracking-tight leading-tight mb-2">
            Selecciona tu calendario
            <br />
            <span className="text-primary">de entrenamiento</span>
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            GymHub leerá tus sesiones desde este calendario. Solo necesitas
            configurarlo una vez.
          </p>
        </div>

        {/* Calendar list */}
        <div className="space-y-2">
          <AnimatePresence mode="wait">
            {status === "loading" && (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 rounded-2xl animate-pulse"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      animationDelay: `${i * 100}ms`,
                    }}
                  />
                ))}
              </motion.div>
            )}

            {status === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-red-500/20 bg-red-500/5"
              >
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <p className="text-sm text-red-400">
                  No se pudieron cargar los calendarios. Comprueba tu conexión
                  con Google Calendar.
                </p>
              </motion.div>
            )}

            {status === "ready" && (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-2"
              >
                {calendars.map((cal, i) => {
                  const isSelecting = selecting === cal.id;
                  return (
                    <motion.button
                      key={cal.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      onClick={() => handleSelect(cal.id)}
                      disabled={!!selecting}
                      className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all duration-200 group"
                      style={{
                        background: isSelecting
                          ? "rgba(249,115,22,0.08)"
                          : "rgba(255,255,255,0.03)",
                        border: isSelecting
                          ? "1px solid rgba(249,115,22,0.4)"
                          : "1px solid rgba(255,255,255,0.07)",
                        opacity: selecting && !isSelecting ? 0.4 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!selecting)
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.borderColor = "rgba(249,115,22,0.25)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelecting)
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.borderColor = "rgba(255,255,255,0.07)";
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                        style={{
                          background: isSelecting
                            ? "rgba(249,115,22,0.15)"
                            : "rgba(255,255,255,0.05)",
                        }}
                      >
                        {isSelecting ? (
                          <Loader2
                            size={16}
                            className="text-primary animate-spin"
                          />
                        ) : (
                          <Calendar
                            size={16}
                            className={
                              isSelecting ? "text-primary" : "text-slate-400"
                            }
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {cal.summary}
                        </p>
                      </div>

                      {cal.primary && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-amber-400/80 border border-amber-400/20 bg-amber-400/5 shrink-0">
                          <Star size={9} />
                          Principal
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer note */}
        <p className="text-[11px] text-slate-600 text-center mt-8">
          Puedes cambiar el calendario en cualquier momento desde Ajustes.
        </p>
      </motion.div>
    </div>
  );
};

export default CalendarSetup;
