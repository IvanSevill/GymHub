import React, { useEffect, useState, useMemo } from "react";
import { workoutService, Workout, ExerciseSet } from "../services/workout";
import { exerciseService, Exercise } from "../services/exercise";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  startOfWeek,
  endOfWeek,
  isFuture,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Zap,
  X,
  Calendar as CalIcon,
  Clock,
  Flame,
  Heart,
  Timer,
  Pencil,
  Plus,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── types ────────────────────────────────────────────────────────────────────

interface DraftSet {
  exercise_id: string;
  exercise_name: string;
  muscle_name: string;
  muscle_id: string;
  value: string;
  measurement: string;
  is_completed: boolean;
}

interface ExerciseGroup {
  name: string;
  sets: ExerciseSet[];
}

interface MuscleGroup {
  name: string;
  exercises: ExerciseGroup[];
}

type FitbitData = NonNullable<Workout["fitbit_data"]>;

// ─── constants ────────────────────────────────────────────────────────────────

const MEASUREMENTS = ["kg", "reps", "s", "min"];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ─── pure helpers ─────────────────────────────────────────────────────────────

const isCardioWorkout = (w: Workout) => {
  const name = (w.fitbit_data?.activity_name ?? "").toLowerCase();
  return (
    !!w.fitbit_data && name !== "" && name !== "weights" && name !== "walk"
  );
};

const fmtDuration = (ms: number) => {
  const total = Math.round(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const groupWorkoutSets = (sets: ExerciseSet[]): MuscleGroup[] => {
  const map: Record<string, MuscleGroup> = {};
  for (const s of sets) {
    const mName = s.exercise?.muscle?.name ?? "otro";
    const eName = s.exercise?.name ?? "desconocido";
    if (!map[mName]) map[mName] = { name: mName, exercises: [] };
    const mg = map[mName];
    let eg = mg.exercises.find((e) => e.name === eName);
    if (!eg) {
      eg = { name: eName, sets: [] };
      mg.exercises.push(eg);
    }
    eg.sets.push(s);
  }
  return Object.values(map)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((mg) => ({
      ...mg,
      exercises: mg.exercises.sort((a, b) => a.name.localeCompare(b.name)),
    }));
};

const groupDraftSets = (sets: DraftSet[]) => {
  const muscles: Record<
    string,
    { muscle_id: string; exercises: Record<string, DraftSet[]> }
  > = {};
  for (const s of sets) {
    if (!muscles[s.muscle_name])
      muscles[s.muscle_name] = { muscle_id: s.muscle_id, exercises: {} };
    if (!muscles[s.muscle_name].exercises[s.exercise_id])
      muscles[s.muscle_name].exercises[s.exercise_id] = [];
    muscles[s.muscle_name].exercises[s.exercise_id].push(s);
  }
  return muscles;
};

// ─── shared UI atoms ──────────────────────────────────────────────────────────

const MuscleLabel: React.FC<{ name: string }> = ({ name }) => (
  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1 capitalize">
    {name}
  </p>
);

const FitbitStats: React.FC<{ data: FitbitData; small?: boolean }> = ({
  data,
  small,
}) => {
  const p = small ? "p-2.5 rounded-xl" : "p-3 rounded-2xl";
  const num = small ? "text-base" : "text-lg";
  const sz = small ? 12 : 14;
  const lbl = "text-[8px] font-black uppercase tracking-widest";
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className={`bg-accent/10 border border-accent/20 ${p} text-center`}>
        <Flame size={sz} className="text-accent mx-auto mb-1" />
        <p className={`${num} font-black text-white`}>{data.calories}</p>
        <p className={`${lbl} text-accent`}>kcal</p>
      </div>
      <div
        className={`bg-red-500/10 border border-red-500/20 ${p} text-center`}
      >
        <Heart size={sz} className="text-red-400 mx-auto mb-1" />
        <p className={`${num} font-black text-white`}>{data.heart_rate_avg}</p>
        <p className={`${lbl} text-red-400`}>bpm</p>
      </div>
      <div className={`bg-white/5 border border-white/10 ${p} text-center`}>
        <Timer size={sz} className="text-slate-400 mx-auto mb-1" />
        <p className={`${num} font-black text-white`}>
          {fmtDuration(data.duration_ms)}
        </p>
        <p className={`${lbl} text-slate-500`}>dur.</p>
      </div>
    </div>
  );
};

const AZMBar: React.FC<{ fatBurn: number; cardio: number; peak: number }> = ({
  fatBurn,
  cardio,
  peak,
}) => {
  const total = fatBurn + cardio + peak;
  if (total === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
        Zonas activas · {total} min
      </p>
      <div className="flex rounded-full overflow-hidden h-2 gap-px">
        {fatBurn > 0 && (
          <div
            style={{ width: `${(fatBurn / total) * 100}%` }}
            className="bg-yellow-400"
          />
        )}
        {cardio > 0 && (
          <div
            style={{ width: `${(cardio / total) * 100}%` }}
            className="bg-orange-500"
          />
        )}
        {peak > 0 && (
          <div
            style={{ width: `${(peak / total) * 100}%` }}
            className="bg-red-500"
          />
        )}
      </div>
      <div className="flex gap-4 text-[9px] font-bold">
        {fatBurn > 0 && (
          <span className="text-yellow-400">Quema fat · {fatBurn}m</span>
        )}
        {cardio > 0 && (
          <span className="text-orange-400">Cardio · {cardio}m</span>
        )}
        {peak > 0 && <span className="text-red-400">Pico · {peak}m</span>}
      </div>
    </div>
  );
};

// ─── modal body: view modes ───────────────────────────────────────────────────

const SetChip: React.FC<{ set: ExerciseSet; completed: boolean }> = ({
  set,
  completed,
}) => {
  if (!set.value || set.value === "0") return null;
  return (
    <span
      className={`text-[10px] font-black tabular-nums rounded-lg px-1.5 py-0.5 ${
        completed
          ? "text-white bg-primary/20 border border-primary/30"
          : "text-slate-500 bg-white/5 border border-white/[0.06]"
      }`}
    >
      {set.value}
      <span className="font-bold opacity-60 ml-0.5">{set.measurement}</span>
    </span>
  );
};

const ExerciseRow: React.FC<{ group: ExerciseGroup }> = ({ group }) => {
  const completed = group.sets.filter((s) => s.is_completed);
  const planned = group.sets.filter((s) => !s.is_completed);
  const hasCompleted = completed.length > 0;

  return (
    <div
      className={`flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl border transition-all ${
        hasCompleted
          ? "bg-white/[0.02] border-primary/15"
          : "border-white/[0.04] opacity-50"
      }`}
    >
      <p className="text-xs font-black text-white capitalize shrink-0">
        {group.name}
      </p>
      <div className="flex flex-wrap gap-1 justify-end">
        {completed.map((s, i) => (
          <SetChip key={i} set={s} completed />
        ))}
        {planned.map((s, i) => (
          <SetChip key={i} set={s} completed={false} />
        ))}
      </div>
    </div>
  );
};

const PlannedExerciseRow: React.FC<{ group: ExerciseGroup }> = ({ group }) => {
  const ref = group.sets.find((s) => s.value && s.value !== "0");
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-white/[0.04] bg-white/[0.01]">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full border border-primary/40 shrink-0" />
        <p className="text-xs font-bold text-slate-300 capitalize">
          {group.name}
        </p>
      </div>
      {ref && (
        <span className="text-[10px] font-bold text-slate-500 tabular-nums">
          {ref.value}
          <span className="ml-0.5">{ref.measurement}</span>
        </span>
      )}
    </div>
  );
};

const CardioBody: React.FC<{ workout: Workout }> = ({ workout }) => {
  const f = workout.fitbit_data!;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center">
          <Zap size={18} className="text-accent" />
        </div>
        <div>
          <p className="text-lg font-black text-white capitalize">
            {f.activity_name}
          </p>
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            {format(parseISO(workout.start_time), "HH:mm")} ·{" "}
            {fmtDuration(f.duration_ms)}
          </p>
        </div>
      </div>
      <FitbitStats data={f} />
      <AZMBar
        fatBurn={f.azm_fat_burn}
        cardio={f.azm_cardio}
        peak={f.azm_peak}
      />
    </div>
  );
};

const WeightsBody: React.FC<{ workout: Workout }> = ({ workout }) => {
  const f = workout.fitbit_data;
  const muscleGroups = useMemo(
    () => groupWorkoutSets(workout.exercise_sets),
    [workout.exercise_sets],
  );

  return (
    <div className="space-y-5">
      {/* Fitbit at the top when available */}
      {f && (
        <div className="pb-1 border-b border-white/5">
          <FitbitStats data={f} small />
        </div>
      )}

      {muscleGroups.length === 0 ? (
        <p className="text-center text-slate-600 text-xs py-4 font-bold uppercase tracking-widest">
          Sin ejercicios registrados
        </p>
      ) : (
        muscleGroups.map((mg) => (
          <div key={mg.name} className="space-y-1.5">
            <MuscleLabel name={mg.name} />
            {mg.exercises.map((eg) => (
              <ExerciseRow key={eg.name} group={eg} />
            ))}
          </div>
        ))
      )}
    </div>
  );
};

const FutureBody: React.FC<{ workout: Workout }> = ({ workout }) => {
  const muscleGroups = useMemo(
    () => groupWorkoutSets(workout.exercise_sets),
    [workout.exercise_sets],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
        <Clock size={16} className="text-primary shrink-0" />
        <div>
          <p className="text-xs font-black text-white uppercase tracking-widest">
            Sesión planeada
          </p>
          <p className="text-[9px] text-slate-400 font-bold mt-0.5">
            {format(parseISO(workout.start_time), "HH:mm")} ·{" "}
            {format(parseISO(workout.end_time), "HH:mm")}
          </p>
        </div>
      </div>
      {muscleGroups.length === 0 ? (
        <p className="text-center text-slate-600 text-xs py-4 font-bold uppercase tracking-widest">
          Sin ejercicios planeados
        </p>
      ) : (
        muscleGroups.map((mg) => (
          <div key={mg.name} className="space-y-1.5">
            <MuscleLabel name={mg.name} />
            {mg.exercises.map((eg) => (
              <PlannedExerciseRow key={eg.name} group={eg} />
            ))}
          </div>
        ))
      )}
    </div>
  );
};

// ─── modal body: edit mode ────────────────────────────────────────────────────

const DraftSetRow: React.FC<{
  set: DraftSet;
  onUpdate: (patch: Partial<DraftSet>) => void;
  onRemove: () => void;
}> = ({ set, onUpdate, onRemove }) => (
  <div className="flex items-center gap-1.5 bg-black/20 rounded-lg px-2 py-1.5">
    <button
      onClick={() => onUpdate({ is_completed: !set.is_completed })}
      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
        set.is_completed
          ? "bg-primary border-primary"
          : "border-slate-700 hover:border-slate-500"
      }`}
    >
      {set.is_completed && <Check size={10} className="text-white" />}
    </button>
    <input
      type="text"
      value={set.value}
      onChange={(e) => onUpdate({ value: e.target.value })}
      placeholder="0"
      className="w-16 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs font-black text-white placeholder:text-slate-700 focus:outline-none focus:border-primary/50 text-center tabular-nums"
    />
    <select
      value={set.measurement}
      onChange={(e) => onUpdate({ measurement: e.target.value })}
      className="bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-xs font-black text-slate-400 focus:outline-none focus:border-primary/50"
    >
      {MEASUREMENTS.map((m) => (
        <option key={m} value={m} className="bg-surface text-white">
          {m}
        </option>
      ))}
    </select>
    <button
      onClick={onRemove}
      className="ml-auto text-slate-700 hover:text-red-400 transition-colors"
    >
      <X size={13} />
    </button>
  </div>
);

// EditBody receives draftSets pre-populated with the full muscle catalog.
// Each exercise has at least one row; the user fills in the ones they did.
const EditBody: React.FC<{
  draftSets: DraftSet[];
  onChange: (sets: DraftSet[]) => void;
}> = ({ draftSets, onChange }) => {
  const groups = useMemo(() => groupDraftSets(draftSets), [draftSets]);
  const sortedMuscles = useMemo(() => Object.keys(groups).sort(), [groups]);

  const updateSet = (idx: number, patch: Partial<DraftSet>) => {
    const next = [...draftSets];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeSet = (idx: number) =>
    onChange(draftSets.filter((_, i) => i !== idx));

  const addSet = (
    exercise_id: string,
    exercise_name: string,
    muscle_name: string,
    muscle_id: string,
  ) => {
    const existing = draftSets.filter((s) => s.exercise_id === exercise_id);
    const meas =
      existing.length > 0 ? existing[existing.length - 1].measurement : "kg";
    onChange([
      ...draftSets,
      {
        exercise_id,
        exercise_name,
        muscle_name,
        muscle_id,
        value: "",
        measurement: meas,
        is_completed: false,
      },
    ]);
  };

  return (
    <div className="space-y-5">
      {sortedMuscles.map((muscleName) => {
        const { muscle_id, exercises } = groups[muscleName];
        const sortedExIds = Object.keys(exercises).sort();

        return (
          <div key={muscleName} className="space-y-2">
            <MuscleLabel name={muscleName} />

            {sortedExIds.map((exId) => {
              const sets = exercises[exId];
              const exName = sets[0].exercise_name;
              const globalIndices = sets.map((s) => draftSets.indexOf(s));

              return (
                <div
                  key={exId}
                  className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden"
                >
                  <p className="text-xs font-black text-white capitalize px-3 pt-2.5 pb-1">
                    {exName}
                  </p>
                  <div className="px-2 pb-2 space-y-1">
                    {globalIndices.map((gIdx) => (
                      <DraftSetRow
                        key={gIdx}
                        set={draftSets[gIdx]}
                        onUpdate={(patch) => updateSet(gIdx, patch)}
                        onRemove={() => removeSet(gIdx)}
                      />
                    ))}
                    <button
                      onClick={() =>
                        addSet(exId, exName, muscleName, muscle_id)
                      }
                      className="flex items-center gap-1 text-[10px] font-black text-slate-600 hover:text-primary transition-colors px-1 pt-0.5"
                    >
                      <Plus size={11} />
                      set
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

// ─── calendar grid ────────────────────────────────────────────────────────────

const WorkoutIndicator: React.FC<{ workout: Workout }> = ({ workout }) => {
  const future = isFuture(parseISO(workout.start_time));
  const cardio = isCardioWorkout(workout);
  const hasFitbit = !!workout.fitbit_data;
  const hasSets = workout.exercise_sets.length > 0;

  if (future)
    return (
      <div className="w-2.5 h-2.5 rounded-full border-2 border-primary/60" />
    );
  if (cardio) return <Zap size={11} className="text-accent fill-accent" />;
  if (hasFitbit)
    return (
      <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
    );
  if (hasSets)
    return (
      <div className="w-2.5 h-2.5 rounded-full bg-primary/40 border border-primary/40" />
    );
  return <div className="w-2 h-2 rounded-full bg-slate-600" />;
};

// ─── main Calendar page ───────────────────────────────────────────────────────

const Calendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [selectedDayWorkouts, setSelectedDayWorkouts] = useState<{
    date: Date;
    workouts: Workout[];
  } | null>(null);

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [draftSets, setDraftSets] = useState<DraftSet[]>([]);
  // muscle_id → Exercise[] catalog; used in enterEditMode but not passed to EditBody
  const [muscleExercises, setMuscleExercises] = useState<
    Record<string, Exercise[]>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingFitbit, setIsSyncingFitbit] = useState(false);

  const daysInGrid = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const result = [...days];
    while (result.length < 42) {
      const last = result[result.length - 1];
      result.push(new Date(last.getTime() + 86400000));
    }
    return result;
  }, [currentDate]);

  useEffect(() => {
    fetchWorkouts();
  }, [currentDate]);

  const fetchWorkouts = async () => {
    try {
      setWorkouts(await workoutService.getWorkouts());
    } catch (err) {
      console.error("Failed to fetch workouts:", err);
    }
  };

  // Pre-populate draftSets with the FULL muscle catalog so every exercise is
  // visible and editable — exercises without existing sets get an empty row.
  const enterEditMode = async (workout: Workout) => {
    const existingByExId: Record<string, DraftSet[]> = {};
    const draft: DraftSet[] = workout.exercise_sets.map((s) => {
      const d: DraftSet = {
        exercise_id: s.exercise_id,
        exercise_name: s.exercise?.name ?? "",
        muscle_name: s.exercise?.muscle?.name ?? "",
        muscle_id: s.exercise?.muscle?.id ?? "",
        value: s.value,
        measurement: s.measurement,
        is_completed: s.is_completed,
      };
      if (!existingByExId[d.exercise_id]) existingByExId[d.exercise_id] = [];
      existingByExId[d.exercise_id].push(d);
      return d;
    });

    // Fetch catalog for every muscle that appears in the workout
    const muscleIds = [
      ...new Set(draft.map((s) => s.muscle_id).filter(Boolean)),
    ];
    const cache: Record<string, Exercise[]> = { ...muscleExercises };
    await Promise.all(
      muscleIds.map(async (mid) => {
        if (!cache[mid]) cache[mid] = await exerciseService.getExercises(mid);
      }),
    );
    setMuscleExercises(cache);

    // Build muscle_id → muscle_name map from the existing sets
    const muscleIdToName: Record<string, string> = {};
    for (const d of draft) {
      if (d.muscle_id && d.muscle_name)
        muscleIdToName[d.muscle_id] = d.muscle_name;
    }

    // Add empty placeholder rows for catalog exercises not yet in draft
    for (const mid of muscleIds) {
      const muscleName = muscleIdToName[mid];
      if (!muscleName) continue;
      for (const ex of cache[mid] ?? []) {
        if (!existingByExId[ex.id]) {
          draft.push({
            exercise_id: ex.id,
            exercise_name: ex.name,
            muscle_name: muscleName,
            muscle_id: mid,
            value: "",
            measurement: "kg",
            is_completed: false,
          });
        }
      }
    }

    setDraftSets(draft);
    setEditingWorkoutId(workout.id);
  };

  const cancelEdit = () => {
    setEditingWorkoutId(null);
    setDraftSets([]);
  };

  // Only persist sets that have a value or are marked completed
  const saveEdit = async (workout: Workout) => {
    setIsSaving(true);
    try {
      const setsToSave = draftSets.filter(
        (s) => s.is_completed || (s.value !== "" && s.value !== "0"),
      );
      await workoutService.updateWorkout(workout.id, {
        start_time: workout.start_time,
        end_time: workout.end_time,
        title: workout.title,
        exercise_sets: setsToSave.map((s) => ({
          exercise_id: s.exercise_id,
          value: s.value || "0",
          measurement: s.measurement,
          is_completed: s.is_completed,
        })),
      });
      await fetchWorkouts();
      setEditingWorkoutId(null);
      setDraftSets([]);
    } catch (err) {
      console.error("Failed to save workout:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const syncFitbitBulk = async () => {
    setIsSyncingFitbit(true);
    try {
      await workoutService.syncFitbitBulk();
      await fetchWorkouts();
    } catch (err) {
      console.error("Fitbit bulk sync failed:", err);
    } finally {
      setIsSyncingFitbit(false);
    }
  };

  const closeModal = () => {
    setSelectedDayWorkouts(null);
    setEditingWorkoutId(null);
    setDraftSets([]);
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToday = () => setCurrentDate(new Date());

  return (
    <div className="space-y-4 max-w-5xl mx-auto flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 px-4 py-2 rounded-3xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
            <CalIcon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-tighter">
              Calendario
            </h1>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">
              {format(currentDate, "MMMM yyyy", { locale: es })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Fitbit bulk sync */}
          <button
            onClick={syncFitbitBulk}
            disabled={isSyncingFitbit}
            title="Sincronizar Fitbit"
            className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-500 hover:text-white disabled:opacity-40"
          >
            {isSyncingFitbit ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
          </button>

          <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 items-center gap-0.5">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1.5 text-[10px] font-black text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all uppercase tracking-widest"
            >
              Hoy
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="glass-card p-4 md:p-6 flex-1 flex flex-col min-h-[500px]">
        <div className="grid grid-cols-7 mb-1 border-b border-white/5">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-center text-[7px] font-black text-slate-600 uppercase tracking-[0.1em] py-2"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2 flex-1 py-2">
          {daysInGrid.map((day, i) => {
            const dayWorkouts = workouts.filter((w) =>
              isSameDay(parseISO(w.start_time), day),
            );
            const outside = day.getMonth() !== currentDate.getMonth();
            return (
              <motion.div
                key={i}
                whileHover={{ scale: outside ? 1 : 1.05 }}
                onClick={() =>
                  dayWorkouts.length > 0 &&
                  setSelectedDayWorkouts({ date: day, workouts: dayWorkouts })
                }
                className={`relative rounded-2xl border transition-all flex flex-col p-2 min-h-[30px] group ${
                  isToday(day)
                    ? "bg-primary/20 border-primary/60 ring-2 ring-primary/30 z-10 shadow-lg shadow-primary/10"
                    : outside
                      ? "opacity-10 pointer-events-none border-transparent"
                      : "bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.06] cursor-pointer"
                }`}
              >
                <span
                  className={`text-[10px] md:text-xs font-black self-start mb-1 ${isToday(day) ? "text-primary" : "text-slate-400 group-hover:text-white"}`}
                >
                  {format(day, "d")}
                </span>
                <div className="flex flex-wrap gap-1 md:gap-1.5 mt-auto">
                  {dayWorkouts.map((w, idx) => (
                    <WorkoutIndicator key={idx} workout={w} />
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-5 py-3 px-4 glass-card shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_5px_rgba(99,102,241,0.6)]" />
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            Con Fitbit
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary/40 border border-primary/40" />
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            Sin Fitbit
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full border border-primary/60" />
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            Planeado
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Zap size={11} className="text-accent fill-accent" />
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            Cardio
          </span>
        </div>
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedDayWorkouts && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-black/95 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-[2.5rem] border border-white/10 shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col z-10"
            >
              {/* Modal header */}
              <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02] rounded-t-[2.5rem]">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                    {format(selectedDayWorkouts.date, "PPP", { locale: es })}
                  </p>
                  <h3 className="text-lg font-black text-white tracking-tight uppercase leading-none">
                    {selectedDayWorkouts.workouts[0]?.title || "Sesión"}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {selectedDayWorkouts.workouts.map((w) =>
                    !isCardioWorkout(w) && editingWorkoutId !== w.id ? (
                      <button
                        key={w.id}
                        onClick={() => enterEditMode(w)}
                        className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-500 hover:text-primary"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                    ) : null,
                  )}
                  <button
                    onClick={closeModal}
                    className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-500 hover:text-white"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8">
                {selectedDayWorkouts.workouts.map((workout, wIdx) => {
                  const future = isFuture(parseISO(workout.start_time));
                  const cardio = isCardioWorkout(workout);
                  const isEditing = editingWorkoutId === workout.id;

                  return (
                    <div key={wIdx}>
                      {selectedDayWorkouts.workouts.length > 1 && (
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3">
                          {workout.title} ·{" "}
                          {format(parseISO(workout.start_time), "HH:mm")}
                        </p>
                      )}
                      {isEditing ? (
                        <EditBody
                          draftSets={draftSets}
                          onChange={setDraftSets}
                        />
                      ) : future ? (
                        <FutureBody workout={workout} />
                      ) : cardio ? (
                        <CardioBody workout={workout} />
                      ) : (
                        <WeightsBody workout={workout} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-white/5 bg-black/20 rounded-b-[2.5rem]">
                {editingWorkoutId ? (
                  <div className="flex gap-2">
                    <button
                      onClick={cancelEdit}
                      disabled={isSaving}
                      className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        const w = selectedDayWorkouts.workouts.find(
                          (w) => w.id === editingWorkoutId,
                        );
                        if (w) saveEdit(w);
                      }}
                      disabled={isSaving}
                      className="flex-1 py-3 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {isSaving ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      Guardar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={closeModal}
                    className="w-full py-3 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all"
                  >
                    Cerrar
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Calendar;
