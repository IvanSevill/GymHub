import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Dumbbell,
  Pencil,
  Plus,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { useToast } from "../../context/ToastContext";
import {
  exerciseService,
  type Exercise,
  type Muscle,
} from "../../services/exercise";
import {
  exerciseRequestService,
  type ExerciseRequest,
} from "../../services/exerciseRequests";
import {
  ExerciseRequestModal,
  MuscleRequestModal,
} from "../exercises/ExerciseRequestModals";

// ─── Inline Edit Form ─────────────────────────────────────────────────────────

interface InlineEditProps {
  req: ExerciseRequest;
  onCancel: () => void;
  onSaved: () => void;
}

const InlineEditForm: React.FC<InlineEditProps> = ({
  req,
  onCancel,
  onSaved,
}) => {
  const { addToast } = useToast();
  const [exerciseName, setExerciseName] = useState(req.exercise_name);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!exerciseName.trim()) return;
    setSaving(true);
    try {
      await exerciseRequestService.updateRequest(req.id, {
        exercise_name: exerciseName.trim(),
      });
      addToast("Solicitud actualizada", "success");
      onSaved();
    } catch (err: any) {
      addToast(
        err.response?.data?.detail || "Error al actualizar la solicitud",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-1">
      <input
        type="text"
        value={exerciseName}
        onChange={(e) => setExerciseName(e.target.value)}
        placeholder="Nombre del ejercicio"
        className="w-full px-2.5 py-1.5 bg-white/[0.03] border border-white/10 rounded-lg text-white text-[10px] placeholder-slate-600 focus:outline-none focus:border-primary/40 transition-colors"
      />
      <div className="flex gap-1.5">
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 rounded-lg bg-white/5 text-slate-400 font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all"
        >
          Cancelar
        </button>
        <button
          disabled={saving || !exerciseName.trim()}
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 font-black text-[9px] uppercase tracking-widest hover:bg-primary hover:text-white transition-all disabled:opacity-30"
        >
          <Save size={9} />
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
};

// ─── Main Section ─────────────────────────────────────────────────────────────

const ExerciseRequestSection: React.FC = () => {
  const { addToast } = useToast();
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [requests, setRequests] = useState<ExerciseRequest[]>([]);
  const [musclesError, setMusclesError] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [showMuscleModal, setShowMuscleModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [approvedOpen, setApprovedOpen] = useState(false);
  const [rejectedOpen, setRejectedOpen] = useState(false);

  const loadMuscles = async () => {
    try {
      const m = await exerciseService.getMuscles();
      setMuscles(m);
      setMusclesError(false);
    } catch {
      setMusclesError(true);
    }
  };

  const loadData = async () => {
    await Promise.all([
      loadMuscles(),
      exerciseRequestService
        .getMyRequests()
        .then(setRequests)
        .catch(() => {}),
      exerciseService
        .getExercises()
        .then(setExercises)
        .catch(() => {}),
    ]);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Check if the created exercise still exists in the catalog.
  // The FK is SET NULL on delete, so if exercise_id is still set the exercise
  // definitely exists in the DB — no need to verify against the client list.
  // For old requests without exercise_id, fall back to name match.
  const exerciseStillExists = (req: ExerciseRequest) => {
    if (req.exercise_id != null) return true;
    return exercises.some(
      (e) => e.name.toLowerCase() === req.exercise_name.toLowerCase(),
    );
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Eliminar esta solicitud pendiente?")) return;
    try {
      await exerciseRequestService.deleteRequest(id);
      addToast("Solicitud eliminada", "success");
      loadData();
    } catch (err: any) {
      addToast(
        err.response?.data?.detail || "Error al eliminar la solicitud",
        "error",
      );
    }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const rejected = requests.filter((r) => r.status === "rejected");
  const approved = requests
    .filter((r) => r.status === "approved")
    .filter((r) => exerciseStillExists(r));

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

        {musclesError && (
          <div className="flex items-center justify-between px-3 py-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-[10px] font-bold text-amber-400">
            <span>Error cargando músculos — el servidor está arrancando</span>
            <button
              onClick={loadMuscles}
              className="ml-2 underline hover:text-amber-300 transition-colors shrink-0"
            >
              Reintentar
            </button>
          </div>
        )}

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

        {/* Pendientes */}
        {pending.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
              Pendientes
            </p>
            <div className="flex flex-col gap-1.5">
              {pending.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col px-3 py-2 bg-white/[0.02] rounded-xl border border-white/[0.04]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[10px] font-black text-white truncate">
                        {req.exercise_name}
                      </span>
                      <span className="text-[9px] text-slate-500 truncate">
                        {req.type === "exercise"
                          ? (req.muscle?.name ?? "—")
                          : `Nuevo grupo: ${req.muscle_name}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="flex items-center gap-1 text-[9px] font-black text-amber-400 uppercase tracking-widest">
                        <Clock size={10} />
                        Pendiente
                      </span>
                      <button
                        onClick={() =>
                          setEditingId(editingId === req.id ? null : req.id)
                        }
                        className="p-1 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-all"
                        title="Editar nombre"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleDelete(req.id)}
                        className="p-1 rounded-lg text-slate-500 hover:text-danger hover:bg-danger/10 transition-all"
                        title="Eliminar"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  {editingId === req.id && (
                    <InlineEditForm
                      req={req}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        loadData();
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Denegadas — collapsible */}
        {rejected.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setRejectedOpen((v) => !v)}
              className="flex items-center gap-2 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] hover:text-slate-400 transition-colors"
            >
              <motion.span
                animate={{ rotate: rejectedOpen ? 90 : 0 }}
                transition={{ duration: 0.15 }}
                className="inline-flex"
              >
                <ChevronRight size={11} />
              </motion.span>
              Denegadas ({rejected.length})
            </button>
            <AnimatePresence initial={false}>
              {rejectedOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1.5">
                    {rejected.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between px-3 py-2 bg-danger/[0.03] rounded-xl border border-danger/[0.08]"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] font-black text-white truncate">
                            {req.exercise_name}
                          </span>
                          <span className="text-[9px] text-slate-500 truncate">
                            {req.type === "exercise"
                              ? (req.muscle?.name ?? "—")
                              : `Nuevo grupo: ${req.muscle_name}`}
                          </span>
                          {req.rejection_reason && (
                            <span className="text-[9px] text-danger/70 truncate">
                              {req.rejection_reason}
                            </span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-[9px] font-black text-danger uppercase tracking-widest shrink-0">
                          <XCircle size={10} />
                          Denegada
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Aprobadas — collapsible, only shows if exercise still in catalog */}
        {approved.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setApprovedOpen((v) => !v)}
              className="flex items-center gap-2 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] hover:text-slate-400 transition-colors"
            >
              <motion.span
                animate={{ rotate: approvedOpen ? 90 : 0 }}
                transition={{ duration: 0.15 }}
                className="inline-flex"
              >
                <ChevronRight size={11} />
              </motion.span>
              Aprobadas ({approved.length})
            </button>
            <AnimatePresence initial={false}>
              {approvedOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1.5">
                    {approved.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between px-3 py-2 bg-accent/[0.03] rounded-xl border border-accent/[0.08]"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] font-black text-white truncate">
                            {req.exercise_name}
                          </span>
                          <span className="text-[9px] text-slate-500 truncate">
                            {req.type === "exercise"
                              ? (req.muscle?.name ?? "—")
                              : `Músculo: ${req.muscle_name}`}
                          </span>
                          {req.reviewed_at && (
                            <span className="text-[9px] text-slate-600 truncate">
                              {new Date(req.reviewed_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-[9px] font-black text-accent uppercase tracking-widest shrink-0">
                          <CheckCircle2 size={10} />
                          Aprobada
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
