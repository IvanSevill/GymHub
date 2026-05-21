import React, { useState } from "react";
import { format, addHours } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Loader2 } from "lucide-react";

const toLocalDatetimeValue = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

const makeTomorrow = (): Date => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, start: string, end: string) => Promise<void>;
}

const CreateEventModal: React.FC<Props> = ({ isOpen, onClose, onSubmit }) => {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(() =>
    toLocalDatetimeValue(makeTomorrow()),
  );
  const [end, setEnd] = useState(() =>
    toLocalDatetimeValue(addHours(makeTomorrow(), 1)),
  );
  const [titleError, setTitleError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    const d = makeTomorrow();
    setTitle("");
    setStart(toLocalDatetimeValue(d));
    setEnd(toLocalDatetimeValue(addHours(d, 1)));
    setTitleError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setTitleError("El título es obligatorio");
      return;
    }
    if (end <= start) {
      setTitleError("La hora de fin debe ser posterior al inicio");
      return;
    }
    setTitleError("");
    setIsSubmitting(true);
    try {
      await onSubmit(title.trim(), start, end);
      reset();
    } finally {
      setIsSubmitting(false);
    }
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
            className="bg-surface rounded-t-[2.5rem] sm:rounded-[2rem] border border-white/10 shadow-2xl w-full sm:max-w-md z-10"
          >
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
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
                className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                  Título
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleError("");
                  }}
                  placeholder="Ej: Piernas + Glúteos"
                  className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-primary/50 transition-colors"
                  autoFocus
                />
                {titleError && (
                  <p className="text-[10px] text-danger mt-1.5 font-semibold">
                    {titleError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                    Inicio
                  </label>
                  <input
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-2xl px-3 py-3 text-xs text-white outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                    Fin
                  </label>
                  <input
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-2xl px-3 py-3 text-xs text-white outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
            </div>

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
                Crear Evento
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CreateEventModal;
