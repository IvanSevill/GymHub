import React, { useEffect, useState } from "react";
import { Clock, CalendarDays, Hash, Trophy } from "lucide-react";
import { analyticsService, MaxLift } from "../services/analytics";
import { workoutService, Workout } from "../services/workout";
import { exerciseService, Exercise } from "../services/exercise";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { motion } from "framer-motion";
import { SkeletonCard } from "../components/ui/Skeleton";
import WeightProgressCard from "../components/analytics/WeightProgressCard";
import FrequencyAnalysisCard from "../components/analytics/FrequencyAnalysisCard";
import FitbitSection from "../components/analytics/FitbitSection";

const Dashboard: React.FC = () => {
  const [maxLifts, setMaxLifts] = useState<MaxLift[]>([]);
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
