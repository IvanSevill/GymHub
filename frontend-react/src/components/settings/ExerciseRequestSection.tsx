import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  Dumbbell,
  Layers,
  Plus,
  X,
  XCircle,
  Clock,
} from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { exerciseService, type Muscle } from "../../services/exercise";
import {
  exerciseRequestService,
  type ExerciseRequest,
} from "../../services/exerciseRequests";

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, icon, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    />
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 12 }}
      transition={{ duration: 0.18 }}
      className="relative z-10 w-full max-w-sm glass-card p-6 flex flex-col gap-5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 text-primary rounded-xl flex items-center justify-center border border-primary/20 shrink-0">
            {icon}
          </div>
          <h3 className="text-sm font-black text-white uppercase tracking-tighter">
            {title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      {children}
    </motion.div>
  </div>
);

// ─── Exercise Request Modal ───────────────────────────────────────────────────

interface ExerciseModalProps {
  muscles: Muscle[];
  onClose: () => void;
  onSuccess: () => void;
}

const ExerciseRequestModal: React.FC<ExerciseModalProps> = ({
  muscles,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [muscleId, setMuscleId] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const selectedMuscle = muscles.find((m) => m.id === muscleId);

  const handleSubmit = async () => {
    if (!muscleId || !exerciseName.trim()) return;
    setLoading(true);
    try {
      await exerciseRequestService.createRequest({
        type: "exercise",
        exercise_name: exerciseName.trim(),
        muscle_id: muscleId,
      });
      addToast("Solicitud enviada correctamente", "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(
        err.response?.data?.detail || "Error al enviar la solicitud",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Solicitar ejercicio"
      icon={<Dumbbell size={15} />}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1.5">
            Grupo muscular
          </p>
          <div className="relative">
            <button
              onClick={() => setOpen(!open)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${
                selectedMuscle
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-white/[0.02] border-white/5 hover:border-white/10 text-slate-400"
              }`}
            >
              <span>
                {selectedMuscle ? selectedMuscle.name : "Seleccionar"}
              </span>
              <ChevronDown size={13} className="text-slate-500" />
            </button>
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="max-h-[180px] overflow-y-auto py-1">
                    {muscles.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setMuscleId(m.id);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors ${
                          muscleId === m.id ? "text-primary" : "text-slate-400"
                        }`}
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          {m.name}
                        </span>
                        {muscleId === m.id && <CheckCircle2 size={11} />}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div>
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1.5">
            Nombre del ejercicio
          </p>
          <input
            type="text"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            placeholder="ej. Press de banca"
            className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-xl text-white text-xs placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!muscleId || !exerciseName.trim() || loading}
          className="w-full py-2.5 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] hover:bg-primary/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {loading ? "Enviando..." : "Enviar solicitud"}
        </button>
      </div>
    </Modal>
  );
};

// ─── Muscle Request Modal ─────────────────────────────────────────────────────

interface MuscleModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const MuscleRequestModal: React.FC<MuscleModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [muscleName, setMuscleName] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!muscleName.trim() || !exerciseName.trim()) return;
    setLoading(true);
    try {
      await exerciseRequestService.createRequest({
        type: "muscle_with_exercise",
        muscle_name: muscleName.trim(),
        exercise_name: exerciseName.trim(),
      });
      addToast("Solicitud enviada correctamente", "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(
        err.response?.data?.detail || "Error al enviar la solicitud",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Solicitar músculo con ejercicio"
      icon={<Layers size={15} />}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1.5">
            Nombre del grupo muscular
          </p>
          <input
            type="text"
            value={muscleName}
            onChange={(e) => setMuscleName(e.target.value)}
            placeholder="ej. Antebrazos"
            className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-xl text-white text-xs placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <div>
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1.5">
            Primer ejercicio
          </p>
          <input
            type="text"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            placeholder="ej. Curl de muñeca"
            className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-xl text-white text-xs placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!muscleName.trim() || !exerciseName.trim() || loading}
          className="w-full py-2.5 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] hover:bg-primary/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {loading ? "Enviando..." : "Enviar solicitud"}
        </button>
      </div>
    </Modal>
  );
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: ExerciseRequest["status"] }> = ({
  status,
}) => {
  if (status === "approved")
    return (
      <span className="flex items-center gap-1 text-[9px] font-black text-accent uppercase tracking-widest">
        <CheckCircle2 size={10} />
        Aprobado
      </span>
    );
  if (status === "rejected")
    return (
      <span className="flex items-center gap-1 text-[9px] font-black text-danger uppercase tracking-widest">
        <XCircle size={10} />
        Rechazado
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[9px] font-black text-amber-400 uppercase tracking-widest">
      <Clock size={10} />
      Pendiente
    </span>
  );
};

// ─── Main Section ─────────────────────────────────────────────────────────────

const ExerciseRequestSection: React.FC = () => {
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [requests, setRequests] = useState<ExerciseRequest[]>([]);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [showMuscleModal, setShowMuscleModal] = useState(false);

  const loadData = async () => {
    const [m, r] = await Promise.all([
      exerciseService.getMuscles(),
      exerciseRequestService.getMyRequests(),
    ]);
    setMuscles(m);
    setRequests(r);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <>
      <section className="glass-card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center border border-primary/20 shrink-0">
            <Dumbbell size={18} />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-tighter">
              Solicitudes de ejercicio
            </h3>
            <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
              Propón nuevos ejercicios o grupos musculares al administrador
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowExerciseModal(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-primary/10 hover:border-primary/30 text-slate-400 hover:text-primary font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Plus size={12} />
            Solicitar ejercicio
          </button>
          <button
            onClick={() => setShowMuscleModal(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-primary/10 hover:border-primary/30 text-slate-400 hover:text-primary font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Plus size={12} />
            Solicitar músculo
          </button>
        </div>

        {requests.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
              Mis solicitudes
            </p>
            <div className="flex flex-col gap-1.5">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between px-3 py-2 bg-white/[0.02] rounded-xl border border-white/[0.04]"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[10px] font-black text-white truncate">
                      {req.exercise_name}
                    </span>
                    <span className="text-[9px] text-slate-500 truncate">
                      {req.type === "exercise"
                        ? (req.muscle?.name ?? "—")
                        : `Nuevo: ${req.muscle_name}`}
                    </span>
                    {req.status === "rejected" && req.rejection_reason && (
                      <span className="text-[9px] text-danger/80 truncate">
                        {req.rejection_reason}
                      </span>
                    )}
                  </div>
                  <StatusBadge status={req.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <AnimatePresence>
        {showExerciseModal && (
          <ExerciseRequestModal
            muscles={muscles}
            onClose={() => setShowExerciseModal(false)}
            onSuccess={loadData}
          />
        )}
        {showMuscleModal && (
          <MuscleRequestModal
            onClose={() => setShowMuscleModal(false)}
            onSuccess={loadData}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default ExerciseRequestSection;
