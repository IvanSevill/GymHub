import React, { useEffect, useState } from "react";
import { Trophy, Dumbbell, Calendar } from "lucide-react";
import { analyticsService, MaxLift } from "../services/analytics";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { motion } from "framer-motion";
import { useToast } from "../context/ToastContext";
import { SkeletonBlock } from "../components/ui/Skeleton";

const MEASUREMENT_LABELS: Record<string, string> = {
  kg: "kg",
  reps: "reps",
  s: "seg",
  min: "min",
};

const Records: React.FC = () => {
  const { addToast } = useToast();
  const [lifts, setLifts] = useState<MaxLift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyticsService
      .getMaxLifts()
      .then(setLifts)
      .catch(() => addToast("Error al cargar los récords", "error"))
      .finally(() => setLoading(false));
  }, []);

  const grouped = lifts.reduce<Record<string, MaxLift[]>>((acc, lift) => {
    const key = lift.muscle_name || "Sin grupo";
    if (!acc[key]) acc[key] = [];
    acc[key].push(lift);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight">
          Récords Personales
        </h1>
        <p className="text-slate-500 text-xs font-medium mt-2">
          Máximos por ejercicio agrupados por grupo muscular
        </p>
      </div>

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <SkeletonBlock className="h-7 w-40 rounded-xl" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <SkeletonBlock key={j} className="h-20 rounded-2xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : sortedGroups.length === 0 ? (
        <div className="glass-card py-20 text-center">
          <div className="w-16 h-16 bg-white/[0.03] rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-600">
            <Trophy size={32} />
          </div>
          <h3 className="text-xl font-black text-white tracking-tight mb-2">
            Sin récords aún
          </h3>
          <p className="text-slate-500 text-sm max-w-xs mx-auto">
            Registra series en el calendario para empezar a acumular récords
            personales.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedGroups.map(([muscle, exercises], groupIdx) => (
            <motion.div
              key={muscle}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: groupIdx * 0.06 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary border border-secondary/20">
                  <Dumbbell size={15} />
                </div>
                <h2 className="text-sm font-black text-white uppercase tracking-widest">
                  {muscle}
                </h2>
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                  {exercises.length} ejercicio
                  {exercises.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {exercises
                  .sort((a, b) =>
                    a.exercise_name.localeCompare(b.exercise_name),
                  )
                  .map((lift, liftIdx) => (
                    <motion.div
                      key={lift.exercise_id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: groupIdx * 0.06 + liftIdx * 0.03 }}
                      className="glass-card p-5 flex items-center gap-4 group hover:border-primary/20 transition-all relative overflow-hidden"
                    >
                      <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/15 shrink-0 group-hover:bg-primary/15 transition-all">
                        <Trophy size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white capitalize leading-tight truncate">
                          {lift.exercise_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar
                            size={10}
                            className="text-slate-600 shrink-0"
                          />
                          <p className="text-[10px] text-slate-500">
                            {format(new Date(lift.date), "d MMM yyyy", {
                              locale: es,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-black text-white tabular-nums leading-none">
                          {lift.max_value}
                        </p>
                        <p className="text-[10px] text-slate-500 font-semibold mt-0.5 uppercase tracking-wider">
                          {MEASUREMENT_LABELS[lift.measurement] ??
                            lift.measurement}
                        </p>
                      </div>
                      <div className="absolute top-0 right-0 w-20 h-20 bg-primary/[0.04] blur-2xl -z-10 group-hover:bg-primary/[0.08] transition-all" />
                    </motion.div>
                  ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Records;
