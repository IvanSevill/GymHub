import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Calendar,
  Loader2,
  AlertTriangle,
  Star,
  Plus,
  Check,
} from "lucide-react";

interface CalendarItem {
  id: string;
  summary: string;
  primary?: boolean;
}

interface Props {
  fetchCalendars: () => Promise<CalendarItem[]>;
  onSelect: (id: string) => Promise<void>;
  onCreateCalendar: (name: string) => Promise<void>;
}

const CalendarSetup: React.FC<Props> = ({
  fetchCalendars,
  onSelect,
  onCreateCalendar,
}) => {
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [selecting, setSelecting] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newCalName, setNewCalName] = useState("GymHub");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCalendars()
      .then((data) => {
        setCalendars(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    if (showCreate) {
      setTimeout(() => {
        createInputRef.current?.select();
        createInputRef.current?.focus();
      }, 80);
    }
  }, [showCreate]);

  const handleSelect = async (id: string) => {
    if (selecting || isCreating) return;
    setSelecting(id);
    try {
      await onSelect(id);
    } catch {
      setSelecting(null);
    }
  };

  const handleCreate = async () => {
    const name = newCalName.trim();
    if (!name) {
      setCreateError("Escribe un nombre para el calendario");
      return;
    }
    setCreateError("");
    setIsCreating(true);
    try {
      await onCreateCalendar(name);
    } catch {
      setCreateError("No se pudo crear el calendario. Inténtalo de nuevo.");
      setIsCreating(false);
    }
  };

  const isBusy = !!selecting || isCreating;

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
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
                className="space-y-3"
              >
                <div className="flex items-start gap-3 px-5 py-4 rounded-2xl border border-red-500/20 bg-red-500/5">
                  <AlertTriangle
                    size={16}
                    className="text-red-400 shrink-0 mt-0.5"
                  />
                  <div className="space-y-1">
                    <p className="text-sm text-red-400">
                      No se pudieron cargar los calendarios.
                    </p>
                    <p className="text-[11px] text-red-400/70">
                      Tu sesión de Google puede haber caducado.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem("token");
                    window.location.href = "/login";
                  }}
                  className="w-full py-3 rounded-2xl text-sm font-semibold text-slate-300 transition-all"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  Volver a iniciar sesión
                </button>
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
                      disabled={isBusy}
                      className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all duration-200"
                      style={{
                        background: isSelecting
                          ? "rgba(249,115,22,0.08)"
                          : "rgba(255,255,255,0.03)",
                        border: isSelecting
                          ? "1px solid rgba(249,115,22,0.4)"
                          : "1px solid rgba(255,255,255,0.07)",
                        opacity: isBusy && !isSelecting ? 0.4 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isBusy)
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
                          <Calendar size={16} className="text-slate-400" />
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

                {/* Divider */}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    o
                  </span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>

                {/* Create new calendar */}
                <AnimatePresence mode="wait">
                  {showCreate ? (
                    <motion.div
                      key="form"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="space-y-2"
                    >
                      <div
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(249,115,22,0.2)",
                        }}
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(249,115,22,0.1)" }}
                        >
                          {isCreating ? (
                            <Loader2
                              size={16}
                              className="text-primary animate-spin"
                            />
                          ) : (
                            <Calendar size={16} className="text-primary" />
                          )}
                        </div>
                        <input
                          ref={createInputRef}
                          value={newCalName}
                          onChange={(e) => {
                            setNewCalName(e.target.value);
                            setCreateError("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreate();
                            if (e.key === "Escape") {
                              setShowCreate(false);
                              setCreateError("");
                            }
                          }}
                          disabled={isCreating}
                          placeholder="Nombre del calendario"
                          className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none disabled:opacity-50"
                        />
                        <button
                          onClick={handleCreate}
                          disabled={isCreating}
                          className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40"
                          style={{ background: "rgba(249,115,22,0.15)" }}
                        >
                          <Check size={14} className="text-primary" />
                        </button>
                      </div>
                      {createError && (
                        <p className="text-[11px] text-red-400 px-1">
                          {createError}
                        </p>
                      )}
                    </motion.div>
                  ) : (
                    <motion.button
                      key="btn"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowCreate(true)}
                      disabled={isBusy}
                      className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold text-slate-400 transition-all duration-200 disabled:opacity-40"
                      style={{ border: "1px dashed rgba(255,255,255,0.1)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color =
                          "rgba(249,115,22,0.9)";
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.borderColor = "rgba(249,115,22,0.25)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "";
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.borderColor = "rgba(255,255,255,0.1)";
                      }}
                    >
                      <Plus size={15} />
                      Crear nuevo calendario
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-[11px] text-slate-600 text-center mt-8">
          Puedes cambiar el calendario en cualquier momento desde Ajustes.
        </p>
      </motion.div>
    </div>
  );
};

export default CalendarSetup;
