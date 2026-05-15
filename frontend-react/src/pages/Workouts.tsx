import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Clock,
  Dumbbell,
  Save,
  X,
  Activity,
  Search,
} from "lucide-react";
import { workoutService, Workout, WorkoutCreate } from "../services/workout";
import { exerciseService, Exercise, Muscle } from "../services/exercise";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

const Workouts: React.FC = () => {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [newWorkout, setNewWorkout] = useState<WorkoutCreate>({
    title: "",
    start_time: new Date().toISOString().slice(0, 16),
    end_time: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    exercise_sets: [],
  });

  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedMuscle, setSelectedMuscle] = useState<string>("");

  useEffect(() => {
    fetchWorkouts();
    fetchInitialData();
  }, []);

  const fetchWorkouts = async () => {
    try {
      const data = await workoutService.getWorkouts();
      setWorkouts(data);
    } catch (error) {
      console.error("Failed to fetch workouts:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInitialData = async () => {
    try {
      const muscleData = await exerciseService.getMuscles();
      setMuscles(muscleData);
    } catch (error) {
      console.error("Failed to fetch muscles:", error);
    }
  };

  const handleMuscleChange = async (muscleId: string) => {
    setSelectedMuscle(muscleId);
    if (muscleId) {
      const exerciseData = await exerciseService.getExercises(muscleId);
      setExercises(exerciseData);
    } else {
      setExercises([]);
    }
  };

  const addExerciseSet = (exercise: Exercise) => {
    setNewWorkout({
      ...newWorkout,
      exercise_sets: [
        ...newWorkout.exercise_sets,
        {
          exercise_id: exercise.id,
          value: "0",
          measurement: "kg",
          is_completed: true,
        },
      ],
    });
  };

  const removeExerciseSet = (index: number) => {
    const updatedSets = [...newWorkout.exercise_sets];
    updatedSets.splice(index, 1);
    setNewWorkout({ ...newWorkout, exercise_sets: updatedSets });
  };

  const updateSetField = (index: number, field: string, value: any) => {
    const updatedSets = [...newWorkout.exercise_sets];
    (updatedSets[index] as any)[field] = value;
    setNewWorkout({ ...newWorkout, exercise_sets: updatedSets });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await workoutService.createWorkout(newWorkout);
      setIsModalOpen(false);
      fetchWorkouts();
      setNewWorkout({
        title: "",
        start_time: new Date().toISOString().slice(0, 16),
        end_time: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
        exercise_sets: [],
      });
    } catch (error) {
      console.error("Failed to create workout:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      window.confirm("¿Estás seguro de que deseas eliminar este entrenamiento?")
    ) {
      try {
        await workoutService.deleteWorkout(id);
        fetchWorkouts();
      } catch (error) {
        console.error("Failed to delete workout:", error);
      }
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Entrenamientos
          </h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">
            Historial y registro de sesiones
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center gap-3 py-3 px-6 shadow-xl shadow-primary/20"
        >
          <Plus size={20} />
          <span className="uppercase tracking-widest text-xs font-black">
            Registrar Sesión
          </span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : workouts.length === 0 ? (
        <div className="glass-card py-20 text-center border-dashed border-white/5">
          <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-500">
            <Dumbbell size={32} />
          </div>
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">
            No hay entrenamientos
          </h3>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto font-bold text-sm">
            Comienza registrando tu primera sesión o sincroniza desde Google
            Calendar en Ajustes.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          <AnimatePresence>
            {workouts.map((workout, index) => (
              <motion.div
                key={workout.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass-card p-6 md:p-8 hover:border-primary/20 transition-all group relative overflow-hidden"
              >
                <div className="flex flex-col md:flex-row justify-between gap-6 relative z-10">
                  <div className="flex gap-6">
                    <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20 shrink-0">
                      <CalendarIcon size={28} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-xl font-black text-white tracking-tight">
                          {workout.title || "Entrenamiento"}
                        </h3>
                        {workout.google_event_id && (
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase tracking-widest rounded border border-blue-500/20">
                            Synced
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                        <span className="flex items-center gap-2">
                          <Clock size={14} className="text-primary" />
                          {format(
                            parseISO(workout.start_time),
                            "PPP '-' HH:mm",
                            { locale: es },
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          <Activity size={14} className="text-secondary" />
                          {workout.exercise_sets.length} Ejercicios realizados
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 ml-auto md:ml-0">
                    {workout.fitbit_data && (
                      <div className="hidden sm:flex gap-3">
                        <div className="text-center px-4 py-2 rounded-2xl bg-black/20 border border-white/5">
                          <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                            Calorías
                          </p>
                          <p className="text-sm font-black text-accent">
                            {workout.fitbit_data.calories}
                          </p>
                        </div>
                        <div className="text-center px-4 py-2 rounded-2xl bg-black/20 border border-white/5">
                          <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                            FC Media
                          </p>
                          <p className="text-sm font-black text-danger">
                            {workout.fitbit_data.heart_rate_avg}
                          </p>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => handleDelete(workout.id)}
                      className="p-3 text-slate-500 hover:text-danger hover:bg-danger/10 rounded-2xl transition-all border border-white/5 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                  {Array.from(
                    new Set(
                      workout.exercise_sets
                        .map((s) => s.exercise?.muscle?.name)
                        .filter(Boolean),
                    ),
                  ).map((muscle) => (
                    <span
                      key={muscle}
                      className="px-3 py-1.5 bg-white/5 text-slate-400 text-[9px] font-black uppercase tracking-widest rounded-xl border border-white/5"
                    >
                      {muscle}
                    </span>
                  ))}
                </div>

                {/* Decoration */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -z-10 group-hover:bg-primary/10 transition-all" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Log Workout Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-surface rounded-[2.5rem] border border-white/10 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">
                  Nueva Sesión
                </h2>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest mt-1">
                  Manual Input Interface
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-3 hover:bg-white/5 rounded-2xl transition-colors text-slate-500 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar"
            >
              <div className="grid gap-8">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
                    Título del Entrenamiento
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Empuje, Sesión de Mañana..."
                    className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-primary/50 transition-all font-bold"
                    value={newWorkout.title}
                    onChange={(e) =>
                      setNewWorkout({ ...newWorkout, title: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
                      Inicio
                    </label>
                    <input
                      type="datetime-local"
                      required
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-primary/50 transition-all font-bold text-sm"
                      value={newWorkout.start_time}
                      onChange={(e) =>
                        setNewWorkout({
                          ...newWorkout,
                          start_time: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
                      Fin
                    </label>
                    <input
                      type="datetime-local"
                      required
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-primary/50 transition-all font-bold text-sm"
                      value={newWorkout.end_time}
                      onChange={(e) =>
                        setNewWorkout({
                          ...newWorkout,
                          end_time: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter">
                    Ejercicios
                  </h3>
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                    {newWorkout.exercise_sets.length} seleccionados
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  <div className="relative">
                    <select
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-primary/50 transition-all font-bold text-sm capitalize appearance-none cursor-pointer"
                      value={selectedMuscle}
                      onChange={(e) => handleMuscleChange(e.target.value)}
                    >
                      <option value="">Grupo Muscular</option>
                      {muscles.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <Search size={16} />
                    </div>
                  </div>

                  <div className="relative">
                    <select
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-primary/50 transition-all font-bold text-sm capitalize appearance-none cursor-pointer disabled:opacity-30"
                      disabled={!selectedMuscle}
                      onChange={(e) => {
                        const ex = exercises.find(
                          (ex) => ex.id === e.target.value,
                        );
                        if (ex) addExerciseSet(ex);
                        e.target.value = "";
                      }}
                    >
                      <option value="">Añadir Ejercicio</option>
                      {exercises.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  {newWorkout.exercise_sets.map((set, index) => {
                    const exercise =
                      exercises.find((ex) => ex.id === set.exercise_id) ||
                      workouts
                        .flatMap((w) => w.exercise_sets)
                        .find((s) => s.exercise_id === set.exercise_id)
                        ?.exercise;

                    return (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={index}
                        className="flex items-center gap-4 bg-white/[0.02] border border-white/5 p-5 rounded-[1.5rem] group"
                      >
                        <div className="flex-1">
                          <p className="font-black text-white text-sm capitalize tracking-tight">
                            {exercise?.name || "Ejercicio"}
                          </p>
                          <p className="text-[9px] font-black text-primary uppercase tracking-[0.1em] mt-0.5">
                            {exercise?.muscle?.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            className="w-16 bg-black/40 border border-white/10 rounded-xl py-2 px-1 text-center font-black text-white outline-none focus:border-primary/50 transition-all"
                            value={set.value}
                            onChange={(e) =>
                              updateSetField(index, "value", e.target.value)
                            }
                          />
                          <select
                            className="bg-black/40 border border-white/10 rounded-xl py-2 px-2 text-[10px] font-black text-slate-400 outline-none uppercase tracking-widest"
                            value={set.measurement}
                            onChange={(e) =>
                              updateSetField(
                                index,
                                "measurement",
                                e.target.value,
                              )
                            }
                          >
                            <option value="kg">kg</option>
                            <option value="rep">rep</option>
                            <option value="s">s</option>
                            <option value="min">min</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeExerciseSet(index)}
                          className="p-2 text-slate-600 hover:text-danger transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </motion.div>
                    );
                  })}
                  {newWorkout.exercise_sets.length === 0 && (
                    <div className="text-center py-10 border border-dashed border-white/5 rounded-3xl">
                      <p className="text-slate-600 text-xs font-bold uppercase tracking-widest italic">
                        Selecciona un músculo para empezar
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </form>

            <div className="p-8 border-t border-white/5 bg-black/20 flex gap-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-slate-500 hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || newWorkout.exercise_sets.length === 0}
                className="flex-1 flex items-center justify-center gap-3 btn-primary py-4 disabled:opacity-20"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Save size={18} />
                    <span className="uppercase tracking-[0.2em] text-[10px] font-black">
                      Guardar Sesión
                    </span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Workouts;
