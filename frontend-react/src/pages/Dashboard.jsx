import React, { useState, useEffect } from 'react';
import { workoutApi, exerciseApi } from '../api/gymhubApi';
import { useAuth } from '../hooks/useAuth';
import { Activity, Calendar, Clock, Filter, Search, ChevronRight } from 'lucide-react';
import { format, isToday, isFuture, isPast } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import WorkoutDetailModal from '../components/WorkoutDetailModal';

const WorkoutCard = ({ workout, onClick }) => {
  // Group exercises by muscle
  const getMuscleName = (s) => (s.exercise?.muscle?.name || s.exercise?.muscle_name || '').toLowerCase();
  const legMuscles = ["gluteos", "femoral", "cuadriceps", "gemelos"];
  const rawMuscles = [...new Set(workout.exercise_sets.map(getMuscleName).filter(Boolean))];
  
  let muscles = [];
  let hasLegs = false;
  rawMuscles.forEach(m => {
    if (legMuscles.includes(m)) {
      hasLegs = true;
    } else {
      muscles.push(m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
    }
  });
  if (hasLegs) muscles.push("Pierna");

  return (
    <motion.div 
      layout
      onClick={onClick}
      className="glass-card p-5 hover:border-primary/30 transition-all group cursor-pointer"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors">
            {workout.title || 'Entrenamiento sin título'}
          </h3>
          <div className="flex items-center gap-3 mt-1 text-slate-400 text-sm font-medium">
            <div className="flex items-center gap-1 text-primary/70">
              <Calendar size={14} />
              {format(new Date(workout.start_time), 'dd MMM')}
            </div>
            <div className="flex items-center gap-1">
              <Clock size={14} />
              {format(new Date(workout.start_time), 'HH:mm')}
            </div>
          </div>
        </div>
        <div className="bg-primary/10 p-2 rounded-xl text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronRight size={20} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {muscles.map(m => (
          <span key={m} className="bg-primary/10 text-primary text-[10px] font-black px-2 py-1 rounded-md tracking-wider">
            {m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()}
          </span>
        ))}
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 group/desc bg-white/[0.02] p-2 rounded-xl border border-white/5">
          <Activity size={14} className="text-primary" />
          <p className="text-xs text-slate-300 font-medium line-clamp-1">
            {[...new Set(workout.exercise_sets.map(s => s.exercise?.name || 'Ejercicio'))].join(' • ') || 'Sin ejercicios registrados'}
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1">Volumen Total</span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black text-white">
                {workout.exercise_sets.reduce((total, s) => {
                  if (s.measurement === 'kg') {
                    const parts = String(s.value || "").split('-').map(p => {
                      const val = parseFloat(p.trim());
                      return isNaN(val) ? 0 : val;
                    });
                    const weight = parts[0] || 0;
                    const reps = parts[1] || 1;
                    return total + (weight * reps);
                  }
                  return total;
                }, 0).toLocaleString()}
              </span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">kg</span>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1">Intensidad</span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black text-white">{workout.exercise_sets.length}</span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Series</span>
            </div>
          </div>
        </div>
      </div>

      {workout.fitbit_data && useAuth().isFitbitConnected && (
        <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Calorías</p>
              <p className="text-sm font-black text-accent">{workout.fitbit_data.calories} kcal</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">FC Media</p>
              <p className="text-sm font-black text-danger">{workout.fitbit_data.heart_rate_avg} bpm</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Tiempo</p>
              <p className="text-sm font-black text-primary">{((workout.fitbit_data.duration_ms || 0) / 60000).toFixed(0)}m</p>
            </div>
          </div>
          
          {(workout.fitbit_data.azm_fat_burn > 0 || workout.fitbit_data.azm_cardio > 0 || workout.fitbit_data.azm_peak > 0) && (
            <div className="flex gap-1.5 h-1.5 rounded-full overflow-hidden bg-white/5">
              <div 
                className="bg-yellow-500 h-full transition-all" 
                style={{ width: `${(workout.fitbit_data.azm_fat_burn / ((workout.fitbit_data.azm_fat_burn + workout.fitbit_data.azm_cardio + workout.fitbit_data.azm_peak) || 1)) * 100}%` }}
                title={`Fat Burn: ${workout.fitbit_data.azm_fat_burn}m`}
              />
              <div 
                className="bg-orange-500 h-full transition-all" 
                style={{ width: `${(workout.fitbit_data.azm_cardio / ((workout.fitbit_data.azm_fat_burn + workout.fitbit_data.azm_cardio + workout.fitbit_data.azm_peak) || 1)) * 100}%` }}
                title={`Cardio: ${workout.fitbit_data.azm_cardio}m`}
              />
              <div 
                className="bg-red-500 h-full transition-all" 
                style={{ width: `${(workout.fitbit_data.azm_peak / ((workout.fitbit_data.azm_fat_burn + workout.fitbit_data.azm_cardio + workout.fitbit_data.azm_peak) || 1)) * 100}%` }}
                title={`Peak: ${workout.fitbit_data.azm_peak}m`}
              />
            </div>
          )}
          
          <div className="flex justify-between items-center px-1">
            <div className="flex gap-3">
               {workout.fitbit_data.azm_fat_burn > 0 && <span className="text-[8px] font-black text-yellow-500 uppercase tracking-tighter">{workout.fitbit_data.azm_fat_burn}m Fat</span>}
               {workout.fitbit_data.azm_cardio > 0 && <span className="text-[8px] font-black text-orange-500 uppercase tracking-tighter">{workout.fitbit_data.azm_cardio}m Card</span>}
               {workout.fitbit_data.azm_peak > 0 && <span className="text-[8px] font-black text-red-500 uppercase tracking-tighter">{workout.fitbit_data.azm_peak}m Peak</span>}
            </div>
            <div className="text-[9px] font-black text-accent uppercase tracking-widest bg-accent/10 px-2 py-0.5 rounded-md">AZM Total: {(workout.fitbit_data.azm_fat_burn || 0) + (workout.fitbit_data.azm_cardio || 0) + (workout.fitbit_data.azm_peak || 0)}m</div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

const Dashboard = () => {
  const [workouts, setWorkouts] = useState([]);
  const [muscles, setMuscles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMuscles, setSelectedMuscles] = useState([]);
  const [filterFitbit, setFilterFitbit] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  const fetchData = async (shouldSync = false) => {
    setLoading(true);
    try {
      // 1. Always load local data first for instant feedback
      const [wRes, mRes] = await Promise.all([
        workoutApi.getWorkouts(),
        exerciseApi.getMuscles()
      ]);
      setWorkouts(wRes.data);
      setMuscles(mRes.data);
      setLoading(false);

      // 2. If sync is needed, do it in the background
      if (shouldSync) {
        const tid = 'background-sync';
        toast.loading('Sincronizando calendario...', { id: tid });
        
        try {
          await workoutApi.syncAll();
          sessionStorage.setItem('lastSync', Date.now());
          
          // Refresh data after sync completes
          const refreshRes = await workoutApi.getWorkouts();
          setWorkouts(refreshRes.data);
          toast.success(`${refreshRes.data.length} sesiones actualizadas`, { id: tid });
        } catch (err) {
          console.error("Background sync failed", err);
          toast.error('Error al sincronizar en segundo plano', { id: tid });
        }
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    const lastSync = sessionStorage.getItem('lastSync');
    // If no sync this session, force it
    fetchData(!lastSync);
  }, []);

  const toggleMuscle = (name) => {
    const lowerName = name.toLowerCase();
    setSelectedMuscles(prev => 
      prev.includes(lowerName) ? prev.filter(m => m !== lowerName) : [...prev, lowerName]
    );
  };

  const normalize = (s) => s?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
  const legMuscles = ["gluteos", "femoral", "cuadriceps", "gemelos"];

  const filteredWorkouts = workouts.filter(w => {
    const getMuscleStrings = (s) => normalize(s.exercise?.muscle?.name || s.exercise?.muscle_name);
    const workoutMuscles = new Set((w.exercise_sets || []).map(getMuscleStrings).filter(Boolean));
    const selectedLower = selectedMuscles.map(m => normalize(m));
    
    const muscleMatch = selectedLower.length === 0 || selectedLower.some(m => {
      if (m === 'pierna') {
        return legMuscles.some(lm => workoutMuscles.has(normalize(lm)));
      }
      return workoutMuscles.has(m);
    });
    
    const fitbitMatch = !filterFitbit || !!w.fitbit_data;
    return muscleMatch && fitbitMatch;
  });

  const upcomingWorkouts = filteredWorkouts.filter(w => isFuture(new Date(w.start_time)) || isToday(new Date(w.start_time)));
  const pastWorkouts = filteredWorkouts.filter(w => isPast(new Date(w.start_time)) && !isToday(new Date(w.start_time)));

  // Consolidate muscles for filter list
  const filterMuscles = muscles.reduce((acc, m) => {
    const name = normalize(m.name);
    if (legMuscles.includes(name)) {
      if (!acc.find(item => normalize(item.name) === 'pierna')) {
        acc.push({ id: 'pierna', name: 'Pierna' });
      }
    } else {
      acc.push(m);
    }
    return acc;
  }, []).sort((a, b) => a.name.localeCompare(b.name));

  if (loading) return <div className="flex justify-center py-20"><div className="loading-spinner" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-white">Entrenamientos Recientes</h2>
            <div className="bg-primary/10 text-primary px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider">
              {filteredWorkouts.length} Resultados
            </div>
            <button 
              onClick={() => {
                sessionStorage.removeItem('lastSync');
                window.location.reload();
              }}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 transition-colors"
              title="Sincronizar ahora"
            >
              <Activity size={18} />
            </button>
          </div>
          <p className="text-slate-400 font-medium tracking-tight">Siguiendo tu progreso y métricas en {workouts.length} sesiones totales</p>
        </div>

        <div className="flex flex-col gap-5 w-full">
          <div className="flex items-center gap-4 overflow-x-auto pb-4 no-scrollbar">
            <div className="flex items-center gap-2 text-slate-500 shrink-0">
              <Filter size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Filtrar Objetivo</span>
            </div>
            <div className="flex gap-2">
              {filterMuscles.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleMuscle(m.name)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border whitespace-nowrap ${
                    selectedMuscles.includes(m.name.toLowerCase()) 
                      ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' 
                      : 'bg-surface text-slate-500 border-white/5 hover:border-white/10'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
            {selectedMuscles.length > 0 && (
              <button 
                onClick={() => setSelectedMuscles([])}
                className="text-[10px] font-black text-primary hover:text-white uppercase shrink-0 px-2"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setFilterFitbit(!filterFitbit)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all ${
                filterFitbit ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'bg-surface text-slate-400 border border-white/5'
              }`}
            >
              <Activity size={16} />
              Solo Fitbit
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {/* Sections Wrapper */}
        <div key="workouts-grid" className="lg:col-span-9 space-y-12">
          
          {/* Section: Upcoming & Today */}
          {upcomingWorkouts.length > 0 && (
            <section className="animate-in">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" />
                <h2 className="text-xl font-black text-white uppercase tracking-widest">Próximos / Hoy</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {upcomingWorkouts.map(w => (
                  <WorkoutCard key={w.id} workout={w} onClick={() => setSelectedWorkout(w)} />
                ))}
              </div>
            </section>
          )}

          {/* Section: Recent History */}
          <section className="animate-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 bg-slate-700 rounded-full" />
              <h2 className="text-xl font-black text-white uppercase tracking-widest">Historial Reciente</h2>
            </div>
            
            {pastWorkouts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pastWorkouts.map(w => (
                  <WorkoutCard key={w.id} workout={w} onClick={() => setSelectedWorkout(w)} />
                ))}
              </div>
            ) : (
              <div className="glass-card p-20 text-center">
                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">No hay historial que coincida con los filtros</p>
              </div>
            )}
          </section>

          {filteredWorkouts.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="col-span-full py-20 text-center glass-card border-dashed bg-white/[0.01]"
            >
              <Activity size={48} className="mx-auto text-slate-700 mb-4 opacity-20" />
              <h3 className="text-xl font-black text-white mb-2">No se encontraron entrenamientos</h3>
              <p className="text-slate-500 max-w-xs mx-auto text-sm font-medium">
                {workouts.length === 0 
                  ? "Aún no has registrado sesiones. ¡Ve al Calendario para planificar tu primer entrenamiento!" 
                  : "Ningún entrenamiento coincide con los filtros seleccionados. Prueba a ajustar tus objetivos."}
              </p>
              {selectedMuscles.length > 0 && (
                <button 
                  onClick={() => setSelectedMuscles([])}
                  className="mt-6 text-primary font-black text-[10px] uppercase tracking-widest hover:text-white transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </motion.div>
          )}
        </div>
      </AnimatePresence>

      <WorkoutDetailModal 
        isOpen={!!selectedWorkout} 
        workout={selectedWorkout}
        onClose={() => setSelectedWorkout(null)}
        onUpdate={fetchData}
      />
    </div>
  );
};

export default Dashboard;
