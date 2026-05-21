import React, { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Dumbbell,
  ChevronLeft,
  ChevronRight,
  Zap,
  Heart,
  Flame,
  Timer,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { workoutService, Workout } from "../services/workout";
import { format, parseISO, isFuture } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "../context/ToastContext";
import { SkeletonWorkoutRow } from "../components/ui/Skeleton";
import { useNavigate } from "react-router-dom";
import {
  isCardioWorkout,
  fmtDuration,
  groupWorkoutSets,
} from "../components/calendar/helpers";

const ITEMS_PER_PAGE = 10;

/* ── Cardio info card ─────────────────────────────────────────── */
const CardioCard: React.FC<{ workout: Workout }> = ({ workout }) => {
  const f = workout.fitbit_data!;
  const totalAzm = f.azm_fat_burn + f.azm_cardio + f.azm_peak;

  return (
    <div className="mt-4 rounded-2xl bg-accent/5 border border-accent/15 p-4 space-y-3">
      {/* Activity header */}
      <div className="flex items-center gap-2">
        <Zap size={13} className="text-accent fill-accent shrink-0" />
        <span className="text-xs font-black text-accent uppercase tracking-widest">
          {f.activity_name}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {f.duration_ms > 0 && (
          <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
            <Timer size={13} className="text-slate-400 shrink-0" />
            <div>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                Duración
              </p>
              <p className="text-sm font-black text-white tabular-nums">
                {fmtDuration(f.duration_ms)}
              </p>
            </div>
          </div>
        )}
        {f.calories > 0 && (
          <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
            <Flame size={13} className="text-orange-400 shrink-0" />
            <div>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                Calorías
              </p>
              <p className="text-sm font-black text-orange-400 tabular-nums">
                {f.calories}
              </p>
            </div>
          </div>
        )}
        {f.heart_rate_avg > 0 && (
          <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
            <Heart size={13} className="text-red-400 shrink-0" />
            <div>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                FC Media
              </p>
              <p className="text-sm font-black text-red-400 tabular-nums">
                {f.heart_rate_avg} bpm
              </p>
            </div>
          </div>
        )}
        {f.distance_km > 0 && (
          <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
            <MapPin size={13} className="text-blue-400 shrink-0" />
            <div>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                Distancia
              </p>
              <p className="text-sm font-black text-blue-400 tabular-nums">
                {f.distance_km.toFixed(1)} km
              </p>
            </div>
          </div>
        )}
      </div>

      {/* AZM zones bar */}
      {totalAzm > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={11} className="text-slate-500" />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Zonas activas ({totalAzm} min)
            </span>
          </div>
          <div className="flex rounded-full overflow-hidden h-2 gap-0.5">
            {f.azm_fat_burn > 0 && (
              <div
                className="bg-yellow-400/70 rounded-full"
                style={{ flex: f.azm_fat_burn }}
                title={`Quema de grasa: ${f.azm_fat_burn} min`}
              />
            )}
            {f.azm_cardio > 0 && (
              <div
                className="bg-orange-400/80 rounded-full"
                style={{ flex: f.azm_cardio }}
                title={`Cardio: ${f.azm_cardio} min`}
              />
            )}
            {f.azm_peak > 0 && (
              <div
                className="bg-red-500 rounded-full"
                style={{ flex: f.azm_peak }}
                title={`Pico: ${f.azm_peak} min`}
              />
            )}
          </div>
          <div className="flex gap-3">
            {f.azm_fat_burn > 0 && (
              <span className="text-[9px] text-yellow-400/70 font-bold">
                Grasa {f.azm_fat_burn}m
              </span>
            )}
            {f.azm_cardio > 0 && (
              <span className="text-[9px] text-orange-400/80 font-bold">
                Cardio {f.azm_cardio}m
              </span>
            )}
            {f.azm_peak > 0 && (
              <span className="text-[9px] text-red-400 font-bold">
                Pico {f.azm_peak}m
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Weights exercise list ────────────────────────────────────── */
const ExerciseList: React.FC<{ workout: Workout }> = ({ workout }) => {
  const nonCardioSets = workout.exercise_sets.filter(
    (s) => s.exercise?.name !== "cardio",
  );
  if (nonCardioSets.length === 0) return null;

  const groups = groupWorkoutSets(nonCardioSets);
  if (groups.length === 0) return null;

  const visibleGroups = groups
    .map((mg) => ({
      ...mg,
      exercises: mg.exercises
        .map((eg) => {
          const completedSets = eg.sets.filter(
            (s) => s.is_completed && s.value && s.value !== "0",
          );
          return { ...eg, completedSets };
        })
        .filter((eg) => eg.completedSets.length > 0),
    }))
    .filter((mg) => mg.exercises.length > 0);

  if (visibleGroups.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      {visibleGroups.map((mg, gi) => (
        <div
          key={mg.name}
          className={gi > 0 ? "pt-3 border-t border-white/5" : ""}
        >
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-2">
            {mg.name}
          </p>
          <div className="space-y-1.5">
            {mg.exercises.map((eg) => {
              const values = eg.completedSets.map(
                (s) => `${s.value}${s.measurement}`,
              );
              return (
                <div
                  key={eg.name}
                  className="flex items-center gap-3 flex-wrap"
                >
                  <span className="text-sm font-semibold text-white capitalize min-w-0 shrink-0">
                    {eg.name}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {values.map((v, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] font-mono text-slate-400 tabular-nums"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ── Fitbit summary strip (for weights workouts with Fitbit) ──── */
const FitbitStrip: React.FC<{ workout: Workout }> = ({ workout }) => {
  const f = workout.fitbit_data;
  if (!f) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {f.calories > 0 && (
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/15 text-[10px] font-black text-orange-400 tabular-nums">
          <Flame size={10} />
          {f.calories} kcal
        </span>
      )}
      {f.heart_rate_avg > 0 && (
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/15 text-[10px] font-black text-red-400 tabular-nums">
          <Heart size={10} />
          {f.heart_rate_avg} bpm
        </span>
      )}
      {f.duration_ms > 0 && (
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-[10px] font-black text-slate-400 tabular-nums">
          <Timer size={10} />
          {fmtDuration(f.duration_ms)}
        </span>
      )}
    </div>
  );
};

/* ── Main page ────────────────────────────────────────────────── */
const Workouts: React.FC = () => {
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchWorkouts();
  }, []);

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

  const totalPages = Math.ceil(workouts.length / ITEMS_PER_PAGE);
  const paginatedWorkouts = workouts.slice(
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

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
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
          <div className="grid gap-4">
            <AnimatePresence>
              {paginatedWorkouts.map((workout, index) => {
                const future = isFuture(parseISO(workout.start_time));
                const cardio = isCardioWorkout(workout);

                return (
                  <motion.div
                    key={workout.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="glass-card p-5 hover:border-primary/20 transition-all group relative overflow-hidden"
                  >
                    {/* ── Header ── */}
                    <div className="flex items-start gap-4 relative z-10">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                          future
                            ? "bg-primary/5 border-primary/20 text-primary/50"
                            : cardio
                              ? "bg-accent/10 border-accent/20 text-accent"
                              : "bg-primary/10 border-primary/20 text-primary"
                        }`}
                      >
                        {future ? (
                          <CalendarIcon size={20} />
                        ) : cardio ? (
                          <Zap size={20} className="fill-accent" />
                        ) : (
                          <Dumbbell size={20} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="text-base font-black text-white tracking-tight">
                            {workout.title || "Entrenamiento"}
                          </h3>
                          {future && (
                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest rounded-lg border border-primary/20">
                              Planeado
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-medium text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <Clock size={11} className="text-primary" />
                            {format(
                              parseISO(workout.start_time),
                              "PPP · HH:mm",
                              { locale: es },
                            )}
                          </span>
                          {!cardio && workout.exercise_sets.length > 0 && (
                            <span className="text-slate-600">
                              {
                                new Set(
                                  workout.exercise_sets
                                    .map((s) => s.exercise?.name)
                                    .filter(Boolean),
                                ).size
                              }{" "}
                              ejercicios
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Cardio: full card ── */}
                    {cardio && <CardioCard workout={workout} />}

                    {/* ── Weights: exercise list + Fitbit strip ── */}
                    {!cardio && !future && (
                      <>
                        <ExerciseList workout={workout} />
                        <FitbitStrip workout={workout} />
                      </>
                    )}

                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.04] blur-3xl -z-10 group-hover:bg-primary/[0.08] transition-all" />
                  </motion.div>
                );
              })}
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
        </>
      )}
    </div>
  );
};

export default Workouts;
