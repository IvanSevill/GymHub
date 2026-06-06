import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  Layers,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
  XCircle,
  Clock,
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

// ─── Muscle Dropdown ──────────────────────────────────────────────────────────

interface MuscleDropdownProps {
  muscles: Muscle[];
  value: string;
  onChange: (id: string) => void;
}

const MuscleDropdown: React.FC<MuscleDropdownProps> = ({
  muscles,
  value,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const selected = muscles.find((m) => m.id === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${
          selected
            ? "bg-primary/10 border-primary/40 text-primary"
            : "bg-white/[0.02] border-white/5 hover:border-white/10 text-slate-400"
        }`}
      >
        <span>{selected ? selected.name : "Seleccionar"}</span>
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
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors ${
                    value === m.id ? "text-primary" : "text-slate-400"
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {m.name}
                  </span>
                  {value === m.id && <CheckCircle2 size={11} />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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
          <MuscleDropdown
            muscles={muscles}
            value={muscleId}
            onChange={setMuscleId}
          />
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

const StatusBadge: React.FC<{
  status: ExerciseRequest["status"];
  deleted?: boolean;
}> = ({ status, deleted }) => {
  if (status === "approved" && deleted)
    return (
      <span className="flex items-center gap-1 text-[9px] font-black text-slate-500 uppercase tracking-widest">
        <XCircle size={10} />
        Eliminado
      </span>
    );
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

// ─── Inline Edit Form ─────────────────────────────────────────────────────────

interface InlineEditProps {
  req: ExerciseRequest;
  muscles: Muscle[];
  onCancel: () => void;
  onSaved: () => void;
}

const InlineEditForm: React.FC<InlineEditProps> = ({
  req,
  muscles,
  onCancel,
  onSaved,
}) => {
  const { addToast } = useToast();
  const [exerciseName, setExerciseName] = useState(req.exercise_name);
  const [muscleId, setMuscleId] = useState(req.muscle_id ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!exerciseName.trim()) return;
    setSaving(true);
    try {
      await exerciseRequestService.updateRequest(req.id, {
        exercise_name: exerciseName.trim(),
        ...(req.type === "exercise" && muscleId ? { muscle_id: muscleId } : {}),
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
        className="w-full px-2.5 py-1.5 bg-white/[0.03] border border-white/10 rounded-lg text-white text-[10px] placeholder-slate-600 focus:outline-none focus:border-primary/40 transition-colors"
      />
      {req.type === "exercise" && muscles.length > 0 && (
        <MuscleDropdown
          muscles={muscles}
          value={muscleId}
          onChange={setMuscleId}
        />
      )}
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
  const [acceptedOpen, setAcceptedOpen] = useState(false);

  const loadMuscles = async () => {
    try {
      const m = await exerciseService.getMuscles();
      setMuscles(m);
      setMusclesError(false);
    } catch {
      setMusclesError(true);
    }
  };

  const exerciseExists = (name: string) =>
    exercises.some((e) => e.name.toLowerCase() === name.toLowerCase());

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

  const pendingOrRejected = requests.filter((r) => r.status !== "approved");
  const approved = requests.filter((r) => r.status === "approved");
  const approvedActive = approved.filter((r) =>
    exerciseExists(r.exercise_name),
  );
  const approvedDeleted = approved.filter(
    (r) => !exerciseExists(r.exercise_name),
  );

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

        {/* Pending / rejected requests */}
        {pendingOrRejected.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
              Mis solicitudes
            </p>
            <div className="flex flex-col gap-1.5">
              {pendingOrRejected.map((req) => (
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
                          : `Nuevo: ${req.muscle_name}`}
                      </span>
                      {req.status === "rejected" && req.rejection_reason && (
                        <span className="text-[9px] text-danger/80 truncate">
                          {req.rejection_reason}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={req.status} />
                      {req.status === "pending" && (
                        <>
                          <button
                            onClick={() =>
                              setEditingId(editingId === req.id ? null : req.id)
                            }
                            className="p-1 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-all"
                            title="Editar"
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
                        </>
                      )}
                    </div>
                  </div>
                  {editingId === req.id && (
                    <InlineEditForm
                      req={req}
                      muscles={muscles}
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

        {/* Approved requests — collapsible */}
        {approved.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setAcceptedOpen((v) => !v)}
              className="flex items-center gap-2 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] hover:text-slate-400 transition-colors"
            >
              <motion.span
                animate={{ rotate: acceptedOpen ? 90 : 0 }}
                transition={{ duration: 0.15 }}
                className="inline-flex"
              >
                <ChevronRight size={11} />
              </motion.span>
              Solicitudes aceptadas ({approvedActive.length}
              {approvedDeleted.length > 0
                ? ` · ${approvedDeleted.length} eliminado${approvedDeleted.length > 1 ? "s" : ""}`
                : ""}
              )
            </button>
            <AnimatePresence initial={false}>
              {acceptedOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1.5">
                    {approvedActive.map((req) => (
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
                        <StatusBadge status="approved" />
                      </div>
                    ))}
                    {approvedDeleted.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between px-3 py-2 bg-white/[0.01] rounded-xl border border-white/[0.04] opacity-50"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] font-black text-slate-400 truncate line-through">
                            {req.exercise_name}
                          </span>
                          <span className="text-[9px] text-slate-600 truncate">
                            {req.type === "exercise"
                              ? (req.muscle?.name ?? "—")
                              : `Músculo: ${req.muscle_name}`}
                          </span>
                        </div>
                        <StatusBadge status="approved" deleted />
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
