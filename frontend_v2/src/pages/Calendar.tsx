import React, { useEffect, useState } from "react";
import { workoutService, Workout } from "../services/workout";
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const Calendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [selectedDayWorkouts, setSelectedDayWorkouts] = useState<{
    date: Date;
    workouts: Workout[];
  } | null>(null);

  // Calendar Grid Logic (42 days to keep it stable and compact)
  const daysInGrid = React.useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const result = [...days];
    while (result.length < 42) {
      const lastDay = result[result.length - 1];
      result.push(new Date(lastDay.getTime() + 86400000));
    }
    return result;
  }, [currentDate]);

  useEffect(() => {
    fetchWorkouts();
  }, [currentDate]);

  const fetchWorkouts = async () => {
    try {
      const data = await workoutService.getWorkouts();
      setWorkouts(data);
    } catch (error) {
      console.error("Failed to fetch workouts:", error);
    }
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  return (
    <div className="space-y-4 max-w-5xl mx-auto flex flex-col">
      <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-4 rounded-3xl shrink-0">
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

        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="glass-card p-4 md:p-6 flex-1 flex flex-col min-h-[500px]">
        <div className="grid grid-cols-7 mb-1 border-b border-white/5">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
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
            const isOutsideMonth = day.getMonth() !== currentDate.getMonth();

            return (
              <motion.div
                key={i}
                whileHover={{ scale: isOutsideMonth ? 1 : 1.05 }}
                onClick={() =>
                  dayWorkouts.length > 0 &&
                  setSelectedDayWorkouts({ date: day, workouts: dayWorkouts })
                }
                className={`relative rounded-2xl border transition-all flex flex-col p-2 min-h-[60px] md:min-h-[80px] group ${
                  isToday(day)
                    ? "bg-primary/20 border-primary/60 ring-2 ring-primary/30 z-10 shadow-lg shadow-primary/10"
                    : isOutsideMonth
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
                  {dayWorkouts.map((w, idx) => {
                    const isFutureEvent = isFuture(parseISO(w.start_time));
                    const hasSets = w.exercise_sets.length > 0;
                    const hasFitbit = !!w.fitbit_data;

                    if (hasFitbit) {
                      return (
                        <Zap
                          key={idx}
                          size={12}
                          className="text-accent fill-accent"
                        />
                      );
                    }
                    if (isFutureEvent) {
                      return (
                        <div
                          key={idx}
                          className="w-2.5 h-2.5 rounded-full border-2 border-primary/60"
                        />
                      );
                    }
                    if (hasSets) {
                      return (
                        <div
                          key={idx}
                          className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                        />
                      );
                    }
                    return (
                      <div
                        key={idx}
                        className="w-2 h-2 rounded-full bg-slate-600"
                      />
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-center gap-6 py-3 px-4 glass-card shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_5px_rgba(99,102,241,0.6)]" />
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            Realizado
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full border border-primary/60" />
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            Planeado
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-accent fill-accent" />
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            Fitbit
          </span>
        </div>
      </div>

      {/* Historial Reciente */}
      <div className="glass-card p-6 mt-4">
        <h3 className="text-sm font-black text-white uppercase tracking-tighter mb-4 flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          Historial Reciente
        </h3>
        {workouts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {workouts.slice(0, 3).map((workout, idx) => (
              <div
                key={idx}
                onClick={() =>
                  setSelectedDayWorkouts({
                    date: parseISO(workout.start_time),
                    workouts: [workout],
                  })
                }
                className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl cursor-pointer hover:bg-white/[0.05] hover:border-primary/30 transition-all group flex flex-col justify-between"
              >
                <div>
                  <h4 className="text-xs font-black text-white capitalize group-hover:text-primary transition-colors">
                    {workout.title || "Sesión"}
                  </h4>
                  <p className="text-[9px] font-black text-slate-500 uppercase mt-1">
                    {format(parseISO(workout.start_time), "PPP", {
                      locale: es,
                    })}
                  </p>
                </div>
                <div className="flex gap-3 mt-4 items-center">
                  <span className="text-[10px] font-black text-primary px-2 py-1 bg-primary/10 rounded-lg">
                    {workout.exercise_sets.length} Ejercicios
                  </span>
                  {workout.fitbit_data && (
                    <Zap size={12} className="text-accent fill-accent" />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-slate-500 text-xs font-bold">
            No hay entrenamientos recientes
          </div>
        )}
      </div>

      {/* Workout Detail Modal */}
      <AnimatePresence>
        {selectedDayWorkouts && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDayWorkouts(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-[2.5rem] border border-white/10 shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col z-10"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                    <CalIcon size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white tracking-tight uppercase">
                      Entrenamientos
                    </h3>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                      {format(selectedDayWorkouts.date, "PPP", { locale: es })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDayWorkouts(null)}
                  className="p-3 hover:bg-white/5 rounded-2xl transition-colors text-slate-500"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 p-6 space-y-6 overflow-y-auto no-scrollbar">
                {selectedDayWorkouts.workouts.map((workout, wIdx) => (
                  <div key={wIdx} className="space-y-4">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">
                      {workout.title || "Sesión"}
                      <span className="text-[10px] font-bold ml-2 lowercase tracking-normal">
                        ({format(parseISO(workout.start_time), "HH:mm")})
                      </span>
                    </h4>

                    <div className="space-y-2">
                      {workout.exercise_sets.length > 0 ? (
                        workout.exercise_sets.map((set, i) => (
                          <div
                            key={i}
                            className={`flex justify-between items-center bg-white/[0.02] border p-4 rounded-2xl transition-all shadow-lg shadow-black/20 ${set.is_completed ? 'border-primary/30 hover:border-primary/50' : 'border-white/5 opacity-50 hover:border-white/20'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${set.is_completed ? 'bg-primary shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'bg-slate-600'}`} />
                              <div>
                                <p className="text-xs font-black text-white capitalize">
                                  {set.exercise?.name || "Desconocido"}
                                </p>
                                <p className="text-[9px] font-black text-primary uppercase tracking-widest mt-0.5">
                                  {set.exercise?.muscle?.name || "Sin grupo"}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-base font-black text-white">
                                {set.value}
                              </span>
                              <span className="text-[9px] font-black text-slate-500 uppercase ml-1.5">
                                {set.measurement}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center p-4 border border-dashed border-white/5 rounded-2xl text-[10px] text-slate-500 uppercase tracking-widest font-black">
                          No hay ejercicios en esta sesión
                        </div>
                      )}
                    </div>

                    {workout.fitbit_data && (
                      <div className="pt-2 grid grid-cols-2 gap-3">
                        <div className="bg-accent/10 border border-accent/20 p-4 rounded-2xl text-center shadow-lg shadow-accent/5">
                          <p className="text-[8px] font-black text-accent uppercase tracking-[0.2em] mb-1">
                            Calorías
                          </p>
                          <p className="text-xl font-black text-white">
                            {workout.fitbit_data.calories}
                          </p>
                        </div>
                        <div className="bg-danger/10 border border-danger/20 p-4 rounded-2xl text-center shadow-lg shadow-danger/5">
                          <p className="text-[8px] font-black text-danger uppercase tracking-[0.2em] mb-1">
                            BPM
                          </p>
                          <p className="text-xl font-black text-white">
                            {workout.fitbit_data.heart_rate_avg}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-white/5 bg-black/20">
                <button
                  onClick={() => setSelectedDayWorkouts(null)}
                  className="w-full py-4 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all"
                >
                  Cerrar Detalles
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Calendar;
