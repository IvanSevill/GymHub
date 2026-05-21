import React from "react";
import { Zap } from "lucide-react";
import { isFuture, parseISO } from "date-fns";
import type { Workout } from "../../services/workout";
import { isCardioWorkout } from "./helpers";

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
      <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
    );
  if (hasSets)
    return (
      <div className="w-2.5 h-2.5 rounded-full bg-primary/40 border border-primary/40" />
    );
  return <div className="w-2 h-2 rounded-full bg-slate-600" />;
};

export default WorkoutIndicator;
