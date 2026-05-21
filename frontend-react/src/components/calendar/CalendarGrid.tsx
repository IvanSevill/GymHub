import React from "react";
import { format, isToday, isSameDay, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { SkeletonBlock } from "../ui/Skeleton";
import type { Workout } from "../../services/workout";
import WorkoutIndicator from "./WorkoutIndicator";
import { WEEKDAYS } from "./types";

interface Props {
  daysInGrid: Date[];
  currentDate: Date;
  workouts: Workout[];
  loading: boolean;
  onDayClick: (day: Date, workouts: Workout[]) => void;
}

const CalendarGrid: React.FC<Props> = ({
  daysInGrid,
  currentDate,
  workouts,
  loading,
  onDayClick,
}) => (
  <div className="glass-card p-4 md:p-6 flex-1 flex flex-col min-h-[350px] md:min-h-[500px]">
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
    <div className="grid grid-cols-7 gap-1 md:gap-2 flex-1 py-2">
      {loading
        ? Array.from({ length: 42 }).map((_, i) => (
            <SkeletonBlock key={i} className="min-h-[30px] rounded-xl" />
          ))
        : daysInGrid.map((day, i) => {
            const dayWorkouts = workouts.filter((w) =>
              isSameDay(parseISO(w.start_time), day),
            );
            const outside = day.getMonth() !== currentDate.getMonth();
            return (
              <motion.div
                key={i}
                whileHover={{ scale: outside ? 1 : 1.05 }}
                onClick={() => {
                  if (outside || dayWorkouts.length === 0) return;
                  onDayClick(day, dayWorkouts);
                }}
                className={`relative rounded-xl md:rounded-2xl border transition-all flex flex-col p-1 md:p-2 min-h-[30px] group ${
                  isToday(day)
                    ? "bg-primary/15 border-primary/50 ring-2 ring-primary/20 z-10 shadow-lg shadow-primary/10"
                    : outside
                      ? "opacity-10 pointer-events-none border-transparent"
                      : dayWorkouts.length > 0
                        ? "bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.06] cursor-pointer"
                        : "bg-white/[0.01] border-white/[0.04] cursor-default"
                }`}
              >
                <span
                  className={`text-[10px] md:text-xs font-black self-start mb-1 ${isToday(day) ? "text-primary" : "text-slate-400 group-hover:text-white"}`}
                >
                  {format(day, "d")}
                </span>
                <div className="flex flex-wrap gap-0.5 md:gap-1.5 mt-auto">
                  {dayWorkouts.map((w, idx) => (
                    <WorkoutIndicator key={idx} workout={w} />
                  ))}
                </div>
              </motion.div>
            );
          })}
    </div>
  </div>
);

export default CalendarGrid;
