import React, { useEffect, useMemo, useState } from "react";
import { Dumbbell, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { exerciseService } from "../services/exercise";
import type { Exercise } from "../services/exercise";
import { analyticsService, MaxLift } from "../services/analytics";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";
import { useExerciseModal } from "../context/ExerciseModalContext";

const MEASUREMENT_LABELS: Record<string, string> = {
  kg: "kg",
  reps: "reps",
  s: "seg",
  min: "min",
};

const Exercises: React.FC = () => {
  const { addToast } = useToast();
  const { openExerciseModal } = useExerciseModal();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [prsMap, setPrsMap] = useState<Record<string, MaxLift>>({});
  const [selectedMuscleId, setSelectedMuscleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      exerciseService.getExercises(),
      analyticsService.getMaxLifts(),
    ])
      .then(([exs, lifts]) => {
        setExercises(exs.sort((a, b) => a.name.localeCompare(b.name)));
        const map: Record<string, MaxLift> = {};
        lifts.forEach((l) => {
          map[l.exercise_id] = l;
        });
        setPrsMap(map);
      })
      .catch(() => addToast("Error al cargar los ejercicios", "error"))
      .finally(() => setLoading(false));
  }, []);

  const derivedMuscles = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    exercises.forEach((ex) => {
      if (ex.muscle && !seen.has(ex.muscle.id)) {
        seen.set(ex.muscle.id, ex.muscle);
      }
    });
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [exercises]);

  const filtered = useMemo(
    () =>
      selectedMuscleId
        ? exercises.filter((ex) => ex.muscle?.id === selectedMuscleId)
        : exercises,
    [exercises, selectedMuscleId],
  );

  const grouped = useMemo(() => {
    const g: Record<
      string,
      { muscle: { id: string; name: string }; exercises: Exercise[] }
    > = {};
    filtered.forEach((ex) => {
      const key = ex.muscle?.id ?? "other";
      if (!g[key]) {
        g[key] = {
          muscle: ex.muscle ?? { id: "other", name: "Otros" },
          exercises: [],
        };
      }
      g[key].exercises.push(ex);
    });
    return Object.values(g).sort((a, b) =>
      a.muscle.name.localeCompare(b.muscle.name),
    );
  }, [filtered]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight">
          Ejercicios
        </h1>
        <p className="text-slate-500 text-xs font-medium mt-2">
          Biblioteca de ejercicios con récords personales y recursos multimedia
        </p>
      </div>

      {!loading && derivedMuscles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedMuscleId(null)}
            className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all ${
              selectedMuscleId === null
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300"
            }`}
          >
            Todos
          </button>
          {derivedMuscles.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMuscleId(m.id)}
              className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all capitalize ${
                selectedMuscleId === m.id
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <SkeletonBlock className="h-6 w-32 rounded-xl" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <SkeletonBlock key={j} className="h-16 rounded-2xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="glass-card py-20 text-center">
          <div className="w-16 h-16 bg-white/[0.03] rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-600">
            <Dumbbell size={32} />
          </div>
          <h3 className="text-xl font-black text-white tracking-tight mb-2">
            Sin ejercicios
          </h3>
          <p className="text-slate-500 text-sm max-w-xs mx-auto">
            Sincroniza tus entrenamientos desde Google Calendar para ver tu
            biblioteca de ejercicios.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ muscle, exercises: groupExs }, groupIdx) => (
            <motion.div
              key={muscle.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: groupIdx * 0.05 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary border border-secondary/20">
                  <Dumbbell size={15} />
                </div>
                <h2 className="text-sm font-black text-white uppercase tracking-widest capitalize">
                  {muscle.name}
                </h2>
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                  {groupExs.length} ejercicio
                  {groupExs.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {groupExs.map((ex, exIdx) => {
                  const pr = prsMap[ex.id];
                  return (
                    <motion.div
                      key={ex.id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: groupIdx * 0.05 + exIdx * 0.02 }}
                    >
                      <div
                        onClick={() =>
                          openExerciseModal({
                            id: ex.id,
                            name: ex.name,
                            muscleName: ex.muscle?.name,
                            pr,
                          })
                        }
                        className="glass-card p-4 flex items-center gap-4 cursor-pointer hover:border-white/15 transition-all group"
                      >
                        <div className="w-9 h-9 bg-white/[0.04] rounded-xl flex items-center justify-center text-slate-500 border border-white/8 shrink-0 group-hover:border-white/15 transition-all">
                          <Dumbbell size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white capitalize leading-tight truncate">
                            {ex.name}
                          </p>
                          {pr ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Trophy
                                size={9}
                                className="text-primary shrink-0"
                              />
                              <p className="text-[10px] text-slate-500">
                                {pr.max_value}{" "}
                                {MEASUREMENT_LABELS[pr.measurement] ??
                                  pr.measurement}
                              </p>
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-600 mt-0.5">
                              Sin récord
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Exercises;
