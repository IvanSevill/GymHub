import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Zap,
  Flame,
  Heart,
  Timer,
  Clock,
  MapPin,
  MoveUpRight,
} from "lucide-react";
import type { Workout, ExerciseSet } from "../../services/workout";
import { fmtDuration, groupWorkoutSets } from "./helpers";
import type { ExerciseGroup, FitbitData } from "./types";
import RouteMap from "./RouteMap";

export const MuscleLabel: React.FC<{ name: string }> = ({ name }) => (
  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1 capitalize">
    {name}
  </p>
);

export const FitbitStats: React.FC<{ data: FitbitData; small?: boolean }> = ({
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

export const AZMBar: React.FC<{
  fatBurn: number;
  cardio: number;
  peak: number;
}> = ({ fatBurn, cardio, peak }) => {
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

const ExerciseRow: React.FC<{ group: ExerciseGroup }> = ({ group }) => (
  <div className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl border bg-white/[0.02] border-primary/15 transition-all">
    <p className="text-xs font-black text-white capitalize shrink-0">
      {group.name}
    </p>
    <div className="flex flex-wrap gap-1 justify-end">
      {group.sets.map((s, i) => (
        <SetChip key={i} set={s} completed />
      ))}
    </div>
  </div>
);

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

export const CardioBody: React.FC<{ workout: Workout }> = ({ workout }) => {
  const f = workout.fitbit_data!;
  const hasDistance = f.distance_km > 0;
  const hasElevation = f.elevation_gain_m > 0;
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
      {(hasDistance || hasElevation) && (
        <div className="grid grid-cols-2 gap-2">
          {hasDistance && (
            <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-2xl text-center">
              <MapPin size={14} className="text-blue-400 mx-auto mb-1" />
              <p className="text-lg font-black text-white">
                {f.distance_km.toFixed(2)}
              </p>
              <p className="text-[8px] font-black uppercase tracking-widest text-blue-400">
                km
              </p>
            </div>
          )}
          {hasElevation && (
            <div className="bg-green-500/10 border border-green-500/20 p-3 rounded-2xl text-center">
              <MoveUpRight size={14} className="text-green-400 mx-auto mb-1" />
              <p className="text-lg font-black text-white">
                {Math.round(f.elevation_gain_m)}
              </p>
              <p className="text-[8px] font-black uppercase tracking-widest text-green-400">
                m desnivel
              </p>
            </div>
          )}
        </div>
      )}
      <AZMBar
        fatBurn={f.azm_fat_burn}
        cardio={f.azm_cardio}
        peak={f.azm_peak}
      />
      {(f.has_gps || workout.title.toLowerCase() === "run") && (
        <RouteMap workoutId={workout.id} />
      )}
    </div>
  );
};

export const WeightsBody: React.FC<{ workout: Workout }> = ({ workout }) => {
  const f = workout.fitbit_data;
  const muscleGroups = useMemo(
    () => groupWorkoutSets(workout.exercise_sets.filter((s) => s.is_completed)),
    [workout.exercise_sets],
  );
  return (
    <div className="space-y-5">
      {f && (
        <div className="pb-1 border-b border-white/5">
          <FitbitStats data={f} small />
        </div>
      )}
      {muscleGroups.length === 0 ? (
        <p className="text-center text-slate-600 text-xs py-4 font-bold uppercase tracking-widest">
          Sin ejercicios completados
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

export const FutureBody: React.FC<{ workout: Workout }> = ({ workout }) => {
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
