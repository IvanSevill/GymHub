import React from "react";
import { Clock } from "lucide-react";
import {
  format,
  parseISO,
  formatDistanceToNow,
  isToday,
  isTomorrow,
} from "date-fns";
import { es } from "date-fns/locale";
import { Workout } from "../../services/workout";
import { isCardioWorkout } from "../calendar/helpers";
import WorkoutCardIcon from "./WorkoutCardIcon";

const relativeDate = (dateStr: string): string => {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Hoy";
  if (isTomorrow(d)) return "Mañana";
  return formatDistanceToNow(d, { locale: es, addSuffix: true });
};

interface WorkoutCardHeaderProps {
  workout: Workout;
  isUpcoming: boolean;
}

const WorkoutCardHeader: React.FC<WorkoutCardHeaderProps> = ({
  workout,
  isUpcoming,
}) => {
  const cardio = isCardioWorkout(workout);

  return (
    <div className="flex items-start gap-4 relative z-10">
      <div
        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
          isUpcoming
            ? "bg-primary/5 border-primary/20 text-primary/50"
            : cardio
              ? "bg-accent/10 border-accent/20 text-accent"
              : "bg-primary/10 border-primary/20 text-primary"
        }`}
      >
        <WorkoutCardIcon isUpcoming={isUpcoming} isCardio={cardio} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h3 className="text-base font-black text-white tracking-tight">
            {workout.title || "Entrenamiento"}
          </h3>
          {isUpcoming && (
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest rounded-lg border border-primary/20">
              {relativeDate(workout.start_time)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-medium text-slate-500">
          <span className="flex items-center gap-1.5">
            <Clock size={11} className="text-primary" />
            {format(parseISO(workout.start_time), "PPP · HH:mm", {
              locale: es,
            })}
          </span>
          {!cardio && workout.exercise_sets.length > 0 && (
            <span className="text-slate-600">
              {
                new Set(
                  (isUpcoming
                    ? workout.exercise_sets
                    : workout.exercise_sets.filter((s) => s.is_completed)
                  )
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
  );
};

export default WorkoutCardHeader;
