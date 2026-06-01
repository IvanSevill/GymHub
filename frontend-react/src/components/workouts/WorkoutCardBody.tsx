import React from "react";
import { Zap } from "lucide-react";
import { Workout } from "../../services/workout";
import { isCardioWorkout, groupWorkoutSets } from "../calendar/helpers";
import { useExerciseModal } from "../../context/ExerciseModalContext";
import FitbitMetricsCompact from "./FitbitMetricsCompact";
import FitbitMetricsGrid from "./FitbitMetricsGrid";
import FitbitZonesBar from "./FitbitZonesBar";

/* ── Planned exercise chips (upcoming workouts) ── */
const PlannedExerciseList: React.FC<{ workout: Workout }> = ({ workout }) => {
  const nonCardioSets = workout.exercise_sets.filter(
    (s) => s.exercise?.name !== "cardio",
  );
  if (nonCardioSets.length === 0) return null;

  const groups = groupWorkoutSets(nonCardioSets);
  if (groups.length === 0) return null;

  const exercises = groups.flatMap((mg) =>
    mg.exercises.map((eg) => ({ name: eg.name, sets: eg.sets.length })),
  );

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {exercises.map((ex) => (
        <span
          key={ex.name}
          className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/8 text-[10px] text-slate-500 capitalize"
        >
          {ex.name}
          {ex.sets > 1 && (
            <span className="ml-1 text-slate-600">×{ex.sets}</span>
          )}
        </span>
      ))}
    </div>
  );
};

/* ── Completed exercise list (bodyweight-aware) ── */
const ExerciseList: React.FC<{ workout: Workout }> = ({ workout }) => {
  const { openExerciseModal } = useExerciseModal();
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
          const completedSets = eg.sets.filter((s) => s.is_completed);
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
            {mg.exercises.map((eg) => (
              <div key={eg.name} className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() =>
                    openExerciseModal({
                      id: eg.sets[0]?.exercise_id ?? "",
                      name: eg.name,
                      muscleName: mg.name,
                    })
                  }
                  className="text-sm font-semibold text-white capitalize min-w-0 shrink-0 hover:text-primary transition-colors cursor-pointer"
                >
                  {eg.name}
                </button>
                <div className="flex flex-wrap gap-1">
                  {eg.completedSets.map((s, i) => {
                    const hasValue = s.value && s.value !== "0";
                    return (
                      <span
                        key={i}
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums ${
                          hasValue
                            ? "bg-white/5 text-slate-400"
                            : "bg-primary/8 border border-primary/15 text-primary/60"
                        }`}
                      >
                        {hasValue ? `${s.value}${s.measurement}` : "✓"}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ── Cardio info card ── */
const CardioCard: React.FC<{ workout: Workout }> = ({ workout }) => {
  const f = workout.fitbit_data!;
  return (
    <div className="mt-4 rounded-2xl bg-accent/5 border border-accent/15 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={13} className="text-accent fill-accent shrink-0" />
        <span className="text-xs font-black text-accent uppercase tracking-widest">
          {f.activity_name}
        </span>
      </div>
      <div className="space-y-3">
        <FitbitMetricsGrid data={f} />
        <FitbitZonesBar data={f} />
      </div>
    </div>
  );
};

/* ── Fitbit compact strip ── */
const FitbitStrip: React.FC<{ workout: Workout }> = ({ workout }) => {
  if (!workout.fitbit_data) return null;
  return <FitbitMetricsCompact data={workout.fitbit_data} />;
};

interface WorkoutCardBodyProps {
  workout: Workout;
  isUpcoming: boolean;
}

const WorkoutCardBody: React.FC<WorkoutCardBodyProps> = ({
  workout,
  isUpcoming,
}) => {
  const cardio = isCardioWorkout(workout);

  if (isUpcoming) return <PlannedExerciseList workout={workout} />;
  if (cardio) return <CardioCard workout={workout} />;
  return (
    <>
      <ExerciseList workout={workout} />
      <FitbitStrip workout={workout} />
    </>
  );
};

export default WorkoutCardBody;
