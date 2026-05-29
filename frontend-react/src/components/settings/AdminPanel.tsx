import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  DatabaseZap,
  Dumbbell,
  GitMerge,
  Inbox,
  Shield,
  XCircle,
} from "lucide-react";
import ExerciseLibrary from "./ExerciseLibrary";
import DataResetPanel from "./DataResetPanel";
import { StandardizeExercisesContent } from "../../pages/StandardizeExercises";
import { useToast } from "../../context/ToastContext";
import {
  exerciseRequestService,
  type ExerciseRequest,
} from "../../services/exerciseRequests";

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
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);

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
                  {rejectingId === req.id ? (
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

type AdminTab = "biblioteca" | "estandarizar" | "solicitudes" | "datos";

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
        </motion.div>
      </AnimatePresence>
    </section>
  );
};

export default AdminPanel;
