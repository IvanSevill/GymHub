import React, { useState, useEffect } from "react";
import { workoutService } from "../services/workout";
import { exerciseService, Exercise } from "../services/exercise";
import { CalendarDays, Hash, Flame, Heart, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "../context/ToastContext";
import { SkeletonCard } from "../components/ui/Skeleton";
import WeightProgressCard from "../components/analytics/WeightProgressCard";
import FrequencyAnalysisCard from "../components/analytics/FrequencyAnalysisCard";

const Analytics: React.FC = () => {
  const { addToast } = useToast();

  const [workoutCount, setWorkoutCount] = useState(0);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [distinctExercises, setDistinctExercises] = useState(0);
  const [totalCalories, setTotalCalories] = useState(0);
  const [avgHeartRate, setAvgHeartRate] = useState(0);
  const [totalAzm, setTotalAzm] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        const [exRes, wRes] = await Promise.all([
          exerciseService.getExercises(),
          workoutService.getWorkouts(),
        ]);
        setExercises(exRes);
        setWorkoutCount(wRes.length);
        setDistinctExercises(
          new Set(
            wRes.flatMap((w) =>
              w.exercise_sets.map((s) => s.exercise_id).filter(Boolean),
            ),
          ).size,
        );

        const withFitbit = wRes.filter((w) => w.fitbit_data);
        setTotalCalories(
          withFitbit.reduce((s, w) => s + (w.fitbit_data?.calories ?? 0), 0),
        );
        const hrSessions = withFitbit.filter(
          (w) => (w.fitbit_data?.heart_rate_avg ?? 0) > 0,
        );
        setAvgHeartRate(
          hrSessions.length > 0
            ? Math.round(
                hrSessions.reduce(
                  (s, w) => s + (w.fitbit_data?.heart_rate_avg ?? 0),
                  0,
                ) / hrSessions.length,
              )
            : 0,
        );
        setTotalAzm(
          withFitbit.reduce((s, w) => {
            const f = w.fitbit_data;
            return (
              s +
              (f?.azm_fat_burn ?? 0) +
              (f?.azm_cardio ?? 0) +
              (f?.azm_peak ?? 0)
            );
          }, 0),
        );
      } catch {
        addToast("Error al cargar los datos de análisis", "error");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const realStats = [
    {
      label: "Entrenamientos",
      value: String(workoutCount),
      icon: CalendarDays,
      color: "text-accent",
      bg: "bg-accent/10",
      borderHex: "#3b82f6",
    },
    {
      label: "Ejercicios Distintos",
      value: String(distinctExercises),
      icon: Hash,
      color: "text-primary",
      bg: "bg-primary/10",
      borderHex: "#f97316",
    },
  ];

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight">
            Análisis de Rendimiento
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">
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

      <div className="space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {loading
            ? Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)
            : realStats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="glass-card p-6 flex items-center gap-4 group overflow-hidden"
                  style={{ borderLeft: `2px solid ${stat.borderHex}` }}
                >
                  <div
                    className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110`}
                  >
                    <stat.icon size={22} />
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

        {/* Fitbit metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="glass-card p-6 flex items-center gap-4 group overflow-hidden"
                style={{ borderLeft: "2px solid #f97316" }}
              >
                <div className="w-12 h-12 bg-orange-500/10 text-orange-400 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <Flame size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase text-slate-500 tracking-widest truncate">
                    Calorías Totales
                  </p>
                  <p className="text-3xl font-black text-white tabular-nums leading-none mt-1">
                    {totalCalories.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-slate-600 mt-0.5">
                    kcal acumuladas
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-6 flex items-center gap-4 group overflow-hidden"
                style={{ borderLeft: "2px solid #ef4444" }}
              >
                <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <Heart size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase text-slate-500 tracking-widest truncate">
                    FC Media
                  </p>
                  <p className="text-3xl font-black text-white tabular-nums leading-none mt-1">
                    {avgHeartRate > 0 ? avgHeartRate : "—"}
                  </p>
                  <p className="text-[9px] text-slate-600 mt-0.5">
                    bpm promedio
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card p-6 flex items-center gap-4 group overflow-hidden"
                style={{ borderLeft: "2px solid #a855f7" }}
              >
                <div className="w-12 h-12 bg-purple-500/10 text-purple-400 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <Zap size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase text-slate-500 tracking-widest truncate">
                    Minutos AZM
                  </p>
                  <p className="text-3xl font-black text-white tabular-nums leading-none mt-1">
                    {totalAzm.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-slate-600 mt-0.5">
                    zona activa acumulada
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </div>

        <WeightProgressCard exercises={exercises} loading={loading} />
        <FrequencyAnalysisCard />
      </div>
    </div>
  );
};

export default Analytics;
