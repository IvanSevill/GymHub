import React, { useEffect, useState } from "react";
import {
  Dumbbell,
  Award,
  ArrowUpRight,
  ChevronRight,
  Clock,
  CalendarDays,
  Hash,
  Trophy,
  Calendar as CalendarIcon,
} from "lucide-react";
import { analyticsService, MaxLift } from "../services/analytics";
import { workoutService, Workout } from "../services/workout";
import { exerciseService, Exercise } from "../services/exercise";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { SkeletonCard, SkeletonBlock } from "../components/ui/Skeleton";
import WeightProgressCard from "../components/analytics/WeightProgressCard";
import FrequencyAnalysisCard from "../components/analytics/FrequencyAnalysisCard";
import FitbitSection from "../components/analytics/FitbitSection";

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const [maxLifts, setMaxLifts] = useState<MaxLift[]>([]);
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [lifts, workouts, exRes] = await Promise.all([
          analyticsService.getMaxLifts(),
          workoutService.getWorkouts(),
          exerciseService.getExercises(),
        ]);
        setMaxLifts(lifts);
        setRecentWorkouts(workouts.slice(0, 3));
        setAllWorkouts(workouts);
        setExercises(exRes);
      } catch {
        // silently degrade — dashboard is best-effort
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const distinctExercises = new Set(
    allWorkouts.flatMap((w) =>
      w.exercise_sets.map((s) => s.exercise_id).filter(Boolean),
    ),
  ).size;

  const lastSessionDate = allWorkouts[0]?.start_time
    ? format(parseISO(allWorkouts[0].start_time), "dd MMM", { locale: es })
    : "—";

  const fitbitWorkouts = [...allWorkouts]
    .reverse()
    .filter((w) => w.fitbit_data);

  const caloriesData = fitbitWorkouts
    .filter((w) => (w.fitbit_data?.calories ?? 0) > 0)
    .map((w) => ({
      date: format(parseISO(w.start_time), "dd MMM", { locale: es }),
      calories: w.fitbit_data!.calories,
    }));

  const heartRateData = fitbitWorkouts
    .filter((w) => (w.fitbit_data?.heart_rate_avg ?? 0) > 0)
    .map((w) => ({
      date: format(parseISO(w.start_time), "dd MMM", { locale: es }),
      fc: w.fitbit_data!.heart_rate_avg,
    }));

  const azmData = fitbitWorkouts
    .filter(
      (w) =>
        (w.fitbit_data?.azm_fat_burn ?? 0) +
          (w.fitbit_data?.azm_cardio ?? 0) +
          (w.fitbit_data?.azm_peak ?? 0) >
        0,
    )
    .map((w) => ({
      date: format(parseISO(w.start_time), "dd MMM", { locale: es }),
      "Quema grasa": w.fitbit_data!.azm_fat_burn ?? 0,
      Cardio: w.fitbit_data!.azm_cardio ?? 0,
      Pico: w.fitbit_data!.azm_peak ?? 0,
    }));

  const stats = [
    {
      label: "Entrenamientos",
      value: loading ? "—" : String(allWorkouts.length),
      icon: <CalendarDays size={22} />,
      color: "text-primary",
      bg: "bg-primary/10",
      borderHex: "#f97316",
    },
    {
      label: "Mejores Marcas",
      value: loading ? "—" : String(maxLifts.length),
      icon: <Trophy size={22} />,
      color: "text-secondary",
      bg: "bg-secondary/10",
      borderHex: "#a855f7",
    },
    {
      label: "Ejercicios Distintos",
      value: loading ? "—" : String(distinctExercises),
      icon: <Hash size={22} />,
      color: "text-accent",
      bg: "bg-accent/10",
      borderHex: "#3b82f6",
    },
    {
      label: "Última Sesión",
      value: loading ? "—" : lastSessionDate,
      icon: <Clock size={22} />,
      color: "text-primary",
      bg: "bg-primary/10",
      borderHex: "#f97316",
    },
  ];

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Análisis
          </h1>
          <p className="text-slate-500 text-xs font-medium mt-2">
            Inteligencia de entrenamiento basada en datos
          </p>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-2xl"
          style={{
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.15)",
          }}
        >
          <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          <span className="text-xs font-semibold text-accent">
            Datos en tiempo real
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="glass-card p-6 flex items-center gap-4 group overflow-hidden relative"
                style={{ borderLeft: `2px solid ${stat.borderHex}` }}
              >
                <div
                  className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110`}
                >
                  {stat.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase text-slate-500 tracking-widest truncate">
                    {stat.label}
                  </p>
                  <p className="text-3xl font-black text-white tabular-nums leading-none mt-1">
                    {stat.value}
                  </p>
                </div>
              </motion.div>
            ))}
      </div>

      <WeightProgressCard exercises={exercises} loading={loading} />

      <FrequencyAnalysisCard />

      {/* Recent Workouts + Max Lifts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 glass-card p-6 md:p-10">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent border border-accent/20">
                <CalendarIcon size={22} />
              </div>
              <div>
                <h3 className="font-black text-white text-lg tracking-tight">
                  Sesiones Recientes
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tus últimos entrenamientos
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/workouts")}
              className="text-primary font-semibold text-xs hover:opacity-80 transition-opacity flex items-center gap-1"
            >
              Ver Historial
              <ChevronRight size={13} />
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-40 rounded-3xl" />
              ))}
            </div>
          ) : recentWorkouts.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-white/[0.07] rounded-3xl">
              <div className="w-14 h-14 bg-white/[0.03] rounded-3xl flex items-center justify-center mx-auto mb-4 text-slate-600">
                <Dumbbell size={28} />
              </div>
              <p className="text-slate-500 text-sm mb-5">
                No hay entrenamientos recientes.
              </p>
              <button
                onClick={() => navigate("/workouts")}
                className="btn-primary px-6 py-2.5 text-xs"
              >
                Registrar Primer Entrenamiento
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {recentWorkouts.map((workout, i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -4 }}
                  className="p-6 rounded-3xl cursor-pointer group relative overflow-hidden transition-all"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      "rgba(249,115,22,0.2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      "rgba(255,255,255,0.05)";
                  }}
                >
                  <div className="absolute top-0 right-0 p-5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowUpRight size={18} className="text-primary" />
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500 mb-3">
                    <Clock size={11} />
                    {format(new Date(workout.start_time), "EEEE, MMM d")}
                  </div>
                  <h4 className="text-lg font-black text-white mb-4 group-hover:text-primary transition-colors leading-tight">
                    {workout.title || "Entrenamiento"}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(
                      new Set(
                        workout.exercise_sets.map(
                          (s) => s.exercise?.muscle?.name,
                        ),
                      ),
                    )
                      .slice(0, 3)
                      .map((m) => (
                        <span
                          key={m}
                          className="px-2.5 py-1 text-[9px] font-semibold text-slate-400 rounded-lg uppercase tracking-wider"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {m}
                        </span>
                      ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 glass-card p-6 md:p-10 flex flex-col">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary border border-secondary/20">
              <Award size={22} />
            </div>
            <div>
              <h3 className="font-black text-white text-lg tracking-tight">
                Mejores Marcas
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Récords personales
              </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 flex-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 flex-1">
              {maxLifts.slice(0, 5).map((lift, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 group cursor-default"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white/[0.03] rounded-xl flex items-center justify-center text-slate-600 group-hover:bg-primary/10 group-hover:text-primary transition-all border border-white/5">
                      <Dumbbell size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm capitalize leading-none">
                        {lift.exercise_name}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 capitalize">
                        {lift.muscle_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-white tabular-nums text-sm">
                      {lift.max_value}
                      <span className="text-[10px] text-slate-500 ml-0.5 font-medium">
                        {lift.measurement}
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {format(new Date(lift.date), "MMM d")}
                    </p>
                  </div>
                </div>
              ))}
              {maxLifts.length === 0 && (
                <div className="flex-1 flex items-center justify-center py-12">
                  <p className="text-slate-500 text-sm">
                    No hay registros aún.
                  </p>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => navigate("/records")}
            className="w-full mt-8 py-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.07] transition-all flex items-center justify-center gap-2"
          >
            Ver Todos los Registros
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {fitbitWorkouts.length > 0 && (
        <FitbitSection
          caloriesData={caloriesData}
          heartRateData={heartRateData}
          azmData={azmData}
        />
      )}
    </div>
  );
};

export default Dashboard;
