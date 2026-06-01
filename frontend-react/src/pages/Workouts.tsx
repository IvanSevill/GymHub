import React, { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Filter,
  History,
  X,
} from "lucide-react";
import { workoutService, Workout } from "../services/workout";
import { exerciseService, Muscle } from "../services/exercise";
import { isFuture, parseISO } from "date-fns";
import { AnimatePresence } from "framer-motion";
import { useToast } from "../context/ToastContext";
import { SkeletonWorkoutRow } from "../components/ui/Skeleton";
import { useNavigate } from "react-router-dom";
import WorkoutCard from "../components/workouts/WorkoutCard";
import { filterByMuscle, filterByFitbit } from "../utils/workoutFilters";

const ITEMS_PER_PAGE = 10;
const SKELETON_COUNT = 5;

/* ── Section header ───────────────────────────────────────────── */
const SectionHeader: React.FC<{
  icon: React.ReactNode;
  label: string;
  count: number;
  accent?: boolean;
}> = ({ icon, label, count, accent = false }) => (
  <div className="flex items-center gap-3">
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border shrink-0 ${
        accent
          ? "bg-primary/8 border-primary/20"
          : "bg-white/[0.03] border-white/8"
      }`}
    >
      {icon}
      <span
        className={`text-[9px] font-black uppercase tracking-[0.2em] ${
          accent ? "text-primary/70" : "text-slate-500"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-md ${
          accent ? "bg-primary/15 text-primary" : "bg-white/5 text-slate-500"
        }`}
      >
        {count}
      </span>
    </div>
    <div className={`h-px flex-1 ${accent ? "bg-primary/10" : "bg-white/5"}`} />
  </div>
);

/* ── Main page ────────────────────────────────────────────────── */
const Workouts: React.FC = () => {
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [fitbitOnly, setFitbitOnly] = useState(false);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [muscleFilterMode, setMuscleFilterMode] = useState<"and" | "or">("or");

  useEffect(() => {
    fetchWorkouts();
    exerciseService
      .getMuscles()
      .then(setMuscles)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [fitbitOnly, selectedMuscles, muscleFilterMode]);

  const fetchWorkouts = async () => {
    try {
      const data = await workoutService.getWorkouts();
      setWorkouts(data);
    } catch {
      addToast("Error al cargar los entrenamientos", "error");
    } finally {
      setLoading(false);
    }
  };

  const upcoming = filterByMuscle(
    workouts.filter((w) => isFuture(parseISO(w.start_time))),
    selectedMuscles,
    muscleFilterMode,
  );

  const history = filterByFitbit(
    filterByMuscle(
      workouts.filter((w) => !isFuture(parseISO(w.start_time))),
      selectedMuscles,
      muscleFilterMode,
    ),
    fitbitOnly,
  );

  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const paginatedHistory = history.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight">
          Entrenamientos
        </h1>
        <p className="text-slate-500 text-xs font-medium mt-2">
          Historial de sesiones — sincronizado desde Google Calendar
        </p>
      </div>

      {!loading && workouts.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-[0.2em] transition-all ${
              showFilters || fitbitOnly || selectedMuscles.length > 0
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-white/[0.03] border-white/8 text-slate-500 hover:text-white"
            }`}
          >
            <Filter size={11} />
            Filtros
            {(fitbitOnly || selectedMuscles.length > 0) && (
              <span className="px-1.5 py-0.5 rounded-md bg-primary/20 text-primary tabular-nums text-[10px] font-black">
                {(fitbitOnly ? 1 : 0) + selectedMuscles.length}
              </span>
            )}
          </button>
          {!showFilters && (fitbitOnly || selectedMuscles.length > 0) && (
            <button
              onClick={() => {
                setFitbitOnly(false);
                setSelectedMuscles([]);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/8 text-[9px] text-slate-500 hover:text-white"
            >
              <X size={9} /> Limpiar
            </button>
          )}
        </div>
      )}

      {showFilters && !loading && workouts.length > 0 && (
        <div className="glass-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              Con datos Fitbit
            </span>
            <button
              onClick={() => setFitbitOnly((v) => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                fitbitOnly ? "bg-primary" : "bg-white/10"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                  fitbitOnly ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {muscles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Por músculo
                </span>
                {selectedMuscles.length > 1 && (
                  <div className="flex bg-black/20 p-0.5 rounded-lg border border-white/5">
                    {(["or", "and"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setMuscleFilterMode(mode)}
                        className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${
                          muscleFilterMode === mode
                            ? "bg-primary text-white"
                            : "text-slate-500 hover:text-white"
                        }`}
                      >
                        {mode === "or" ? "O" : "Y"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {muscles.map((m) => {
                  const active = selectedMuscles.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() =>
                        setSelectedMuscles((prev) =>
                          active
                            ? prev.filter((id) => id !== m.id)
                            : [...prev, m.id],
                        )
                      }
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold capitalize border transition-all ${
                        active
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-white/[0.03] border-white/8 text-slate-500 hover:text-white hover:border-white/20"
                      }`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <SkeletonWorkoutRow key={i} />
          ))}
        </div>
      ) : workouts.length === 0 ? (
        <div className="glass-card py-20 text-center">
          <div className="w-16 h-16 bg-white/[0.03] rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-600">
            <Dumbbell size={32} />
          </div>
          <h3 className="text-xl font-black text-white tracking-tight mb-2">
            Sin entrenamientos
          </h3>
          <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6">
            Sincroniza tus sesiones desde Google Calendar en Ajustes.
          </p>
          <button
            onClick={() => navigate("/settings")}
            className="btn-primary px-6 py-2.5 text-xs"
          >
            Ir a Ajustes
          </button>
        </div>
      ) : (
        <>
          {/* ── Filter empty state ── */}
          {upcoming.length === 0 && history.length === 0 && (
            <div className="glass-card py-16 text-center">
              <div className="w-12 h-12 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-600">
                <Filter size={22} />
              </div>
              <h3 className="text-base font-black text-white tracking-tight mb-1">
                Sin resultados
              </h3>
              <p className="text-slate-500 text-xs mb-5">
                Ningún entrenamiento coincide con los filtros activos.
              </p>
              <button
                onClick={() => {
                  setFitbitOnly(false);
                  setSelectedMuscles([]);
                }}
                className="btn-secondary text-xs px-5 py-2 rounded-xl"
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {/* ── Upcoming section ── */}
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <SectionHeader
                icon={<CalendarIcon size={11} className="text-primary" />}
                label="Próximos"
                count={upcoming.length}
                accent
              />
              <AnimatePresence>
                {upcoming.map((w, i) => (
                  <WorkoutCard key={w.id} workout={w} index={i} isUpcoming />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* ── History section ── */}
          {history.length > 0 && (
            <div className="space-y-3">
              <SectionHeader
                icon={<History size={11} className="text-slate-500" />}
                label="Historial"
                count={history.length}
              />
              <div className="grid gap-4">
                <AnimatePresence>
                  {paginatedHistory.map((w, i) => (
                    <WorkoutCard
                      key={w.id}
                      workout={w}
                      index={i}
                      isUpcoming={false}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 btn-secondary rounded-xl disabled:opacity-30"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-xs font-medium text-slate-500">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="p-2 btn-secondary rounded-xl disabled:opacity-30"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Workouts;
