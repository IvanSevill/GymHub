import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  DatabaseZap,
  Dumbbell,
  GitMerge,
  Inbox,
  MessageSquare,
  Pencil,
  Save,
  Shield,
  X,
  XCircle,
} from "lucide-react";
import ExerciseLibrary from "./ExerciseLibrary";
import DataResetPanel from "./DataResetPanel";
import FeedbackPanel from "./FeedbackPanel";
import { StandardizeExercisesContent } from "../../pages/StandardizeExercises";
import { useToast } from "../../context/ToastContext";
import { exerciseService, type Muscle } from "../../services/exercise";
import {
  exerciseRequestService,
  type ExerciseRequest,
} from "../../services/exerciseRequests";

// ─── Muscle Dropdown (shared within this file) ────────────────────────────────

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
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
          selected
            ? "bg-primary/10 border-primary/40 text-primary"
            : "bg-white/[0.02] border-white/10 hover:border-white/20 text-slate-400"
        }`}
      >
        <span>{selected ? selected.name : "Seleccionar músculo"}</span>
        <ChevronDown size={11} className="text-slate-500" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full left-0 right-0 mt-1 bg-surface border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="max-h-[160px] overflow-y-auto py-1">
              {muscles.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors ${
                    value === m.id ? "text-primary" : "text-slate-400"
                  }`}
                >
                  <span className="text-[9px] font-black uppercase tracking-widest">
                    {m.name}
                  </span>
                  {value === m.id && <CheckCircle2 size={10} />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Admin Inline Edit Form ───────────────────────────────────────────────────

interface AdminEditFormProps {
  req: ExerciseRequest;
  muscles: Muscle[];
  onCancel: () => void;
  onSaved: () => void;
}

const AdminEditForm: React.FC<AdminEditFormProps> = ({
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
      await exerciseRequestService.adminEditRequest(req.id, {
        exercise_name: exerciseName.trim(),
        ...(req.type === "exercise" && muscleId ? { muscle_id: muscleId } : {}),
      });
      addToast("Solicitud actualizada", "success");
      onSaved();
    } catch (err: any) {
      addToast(
        err.response?.data?.detail || "Error al editar la solicitud",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.05]">
      <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">
        Editar antes de aprobar
      </p>
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
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/5 text-slate-400 font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all"
        >
          <X size={9} />
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

// ─── Requests tab ─────────────────────────────────────────────────────────────

type FilterStatus = "pending" | "approved" | "rejected";

const FILTER_LABELS: { id: FilterStatus; label: string }[] = [
  { id: "pending", label: "Pendientes" },
  { id: "approved", label: "Aprobadas" },
  { id: "rejected", label: "Rechazadas" },
];

const RequestsPanel: React.FC = () => {
  const { addToast } = useToast();
  const [filter, setFilter] = useState<FilterStatus>("pending");
  const [requests, setRequests] = useState<ExerciseRequest[]>([]);
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadRequests = async (status: FilterStatus) => {
    setLoading(true);
    try {
      const data = await exerciseRequestService.getAllRequests(status);
      setRequests(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    exerciseService
      .getMuscles()
      .then(setMuscles)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadRequests(filter);
  }, [filter]);

  const handleApprove = async (id: string) => {
    setActioning(id);
    try {
      await exerciseRequestService.approveRequest(id);
      addToast("Solicitud aprobada", "success");
      loadRequests(filter);
    } catch (err: any) {
      addToast(err.response?.data?.detail || "Error al aprobar", "error");
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (id: string) => {
    setActioning(id);
    try {
      await exerciseRequestService.rejectRequest(id, rejectReason || undefined);
      addToast("Solicitud rechazada", "success");
      setRejectingId(null);
      setRejectReason("");
      loadRequests(filter);
    } catch (err: any) {
      addToast(err.response?.data?.detail || "Error al rechazar", "error");
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Filter tabs */}
      <div className="flex gap-1 p-0.5 bg-black/20 rounded-xl border border-white/[0.04]">
        {FILTER_LABELS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
              filter === id
                ? "bg-white/10 text-white"
                : "text-slate-600 hover:text-slate-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-1.5">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <p className="text-center text-[10px] font-black text-slate-600 uppercase tracking-widest py-6">
          Sin solicitudes
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((req) => (
            <div
              key={req.id}
              className="flex flex-col gap-2 p-3 bg-white/[0.02] rounded-xl border border-white/[0.05]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] font-black text-white truncate">
                    {req.exercise_name}
                  </span>
                  <span className="text-[9px] text-slate-500 truncate">
                    {req.type === "exercise"
                      ? `Músculo: ${req.muscle?.name ?? req.muscle_id ?? "—"}`
                      : `Nuevo músculo: ${req.muscle_name}`}
                  </span>
                  <span className="text-[9px] text-slate-600 truncate">
                    {req.requested_by.name} · {req.requested_by.email}
                  </span>
                  {req.status === "rejected" && req.rejection_reason && (
                    <span className="text-[9px] text-danger/70 truncate">
                      Razón: {req.rejection_reason}
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-slate-600 shrink-0 mt-0.5">
                  {new Date(req.created_at).toLocaleDateString()}
                </span>
              </div>

              {req.status === "pending" && (
                <>
                  {editingId === req.id ? (
                    <AdminEditForm
                      req={req}
                      muscles={muscles}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        loadRequests(filter);
                      }}
                    />
                  ) : rejectingId === req.id ? (
                    <div className="flex flex-col gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Razón (opcional)"
                        className="w-full px-2.5 py-1.5 bg-white/[0.03] border border-white/10 rounded-lg text-white text-[10px] placeholder-slate-600 focus:outline-none focus:border-danger/40 transition-colors"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            setRejectingId(null);
                            setRejectReason("");
                          }}
                          className="flex-1 py-1.5 rounded-lg bg-white/5 text-slate-400 font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all"
                        >
                          Cancelar
                        </button>
                        <button
                          disabled={!!actioning}
                          onClick={() => handleReject(req.id)}
                          className="flex-1 py-1.5 rounded-lg bg-danger/10 text-danger border border-danger/20 font-black text-[9px] uppercase tracking-widest hover:bg-danger hover:text-white transition-all disabled:opacity-30"
                        >
                          Confirmar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button
                        disabled={!!actioning}
                        onClick={() => handleApprove(req.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-accent/10 text-accent border border-accent/20 font-black text-[9px] uppercase tracking-widest hover:bg-accent hover:text-white transition-all disabled:opacity-30"
                      >
                        <CheckCircle2 size={10} />
                        Aprobar
                      </button>
                      <button
                        disabled={!!actioning}
                        onClick={() => setRejectingId(req.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-danger/10 text-danger border border-danger/20 font-black text-[9px] uppercase tracking-widest hover:bg-danger hover:text-white transition-all disabled:opacity-30"
                      >
                        <XCircle size={10} />
                        Rechazar
                      </button>
                      <button
                        disabled={!!actioning}
                        onClick={() => setEditingId(req.id)}
                        className="flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-400 border border-white/[0.06] font-black text-[9px] uppercase tracking-widest hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-all disabled:opacity-30"
                        title="Editar antes de aprobar"
                      >
                        <Pencil size={10} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Admin Panel ──────────────────────────────────────────────────────────────

type AdminTab =
  | "biblioteca"
  | "estandarizar"
  | "solicitudes"
  | "datos"
  | "feedback";

const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>("biblioteca");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    exerciseRequestService
      .getAllRequests("pending")
      .then((r) => setPendingCount(r.length))
      .catch(() => {});
  }, []);

  const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: "biblioteca", label: "Biblioteca", icon: <Dumbbell size={11} /> },
    { id: "estandarizar", label: "Estandarizar", icon: <GitMerge size={11} /> },
    {
      id: "solicitudes",
      label: "Solicitudes",
      icon: (
        <span className="relative flex items-center">
          <Inbox size={11} />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-2 w-3 h-3 bg-danger text-white rounded-full text-[7px] font-black flex items-center justify-center leading-none">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </span>
      ),
    },
    { id: "datos", label: "Base de datos", icon: <DatabaseZap size={11} /> },
    {
      id: "feedback",
      label: "Feedback",
      icon: <MessageSquare size={11} />,
    },
  ];

  return (
    <section className="glass-card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-danger/10 text-danger rounded-xl flex items-center justify-center border border-danger/20 shrink-0">
          <Shield size={18} />
        </div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-tighter">
            Panel de administración
          </h3>
          <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
            Gestión de biblioteca, estandarización y datos
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-black/30 rounded-2xl border border-white/[0.05]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? "bg-primary text-white shadow-lg shadow-primary/20"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === "biblioteca" && <ExerciseLibrary />}
          {activeTab === "estandarizar" && <StandardizeExercisesContent />}
          {activeTab === "solicitudes" && <RequestsPanel />}
          {activeTab === "datos" && <DataResetPanel />}
          {activeTab === "feedback" && <FeedbackPanel />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
};

export default AdminPanel;
