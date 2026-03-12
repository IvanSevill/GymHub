import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, Activity, Dumbbell, Trash2, Save, Plus, Check, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { workoutApi, exerciseApi } from '../api/gymhubApi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const WorkoutDetailModal = ({ workout, isOpen, onClose, onUpdate }) => {
  const [editedWorkout, setEditedWorkout] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [muscles, setMuscles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeMuscleTab, setActiveMuscleTab] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedMuscles, setExpandedMuscles] = useState({});
  const [showFullCatalog, setShowFullCatalog] = useState(false);

  // 1. Initialize local state immediately when workout changes
  useEffect(() => {
    if (workout) {
      setEditedWorkout({ ...workout });
      fetchData();
    } else {
      setEditedWorkout(null);
    }
  }, [workout?.id]);

  // 2. Handle expansion logic once both workout and catalog are ready
  useEffect(() => {
    if (editedWorkout && exercises.length > 0) {
      // Find muscles by looking up exercise IDs in the full catalog
      const activeMuscleNames = [...new Set(editedWorkout.exercise_sets.map(s => {
        const exInfo = exercises.find(e => e.id === s.exercise_id);
        return exInfo?.muscle_name;
      }).filter(Boolean))];
      
      const initialExpanded = {};
      activeMuscleNames.forEach(name => {
        initialExpanded[name] = true;
      });
      setExpandedMuscles(initialExpanded);
    }
  }, [editedWorkout?.id, exercises.length]);

  const fetchData = async () => {
    try {
      const [exRes, mRes] = await Promise.all([
        exerciseApi.getExercises(),
        exerciseApi.getMuscles()
      ]);
      setExercises(exRes.data);
      setMuscles(mRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    const tid = toast.loading('Actualizando entrenamiento...');
    setSaving(true);
    try {
      const { fitbit_data, exercise_sets, ...rest } = editedWorkout;

      // Auto-generate title from current muscles with grouping
      const legMuscles = ["gluteos", "femoral", "cuadriceps", "gemelos"];
      const activeMuscles = [...new Set(exercise_sets.map(s => s.exercise?.muscle?.name || s.exercise?.muscle_name).filter(Boolean))];
      let titleParts = [];
      let hasLegs = false;
      activeMuscles.forEach(m => {
        if (legMuscles.includes(m.toLowerCase())) hasLegs = true;
        else titleParts.push(m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
      });
      if (hasLegs) titleParts.push("Pierna");
      const generatedTitle = titleParts.sort().join(' - ') || rest.title;

      // Map sets back to schema
      const sanitizedSets = exercise_sets.map(s => ({
        exercise_id: s.exercise_id,
        value: s.value,
        measurement: s.measurement,
        is_completed: !!s.is_completed
      }));
      
      await workoutApi.updateWorkout(workout.id, { ...rest, title: generatedTitle, exercise_sets: sanitizedSets });
      toast.success('¡Entrenamiento actualizado!', { id: tid });
      onUpdate();
      onClose();
    } catch (err) {
      toast.error('Error al actualizar', { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const addSet = (exerciseId) => {
    const ex = exercises.find(e => e.id === exerciseId);
    const newSet = {
      exercise_id: exerciseId,
      value: "0",
      measurement: "kg",
      is_completed: true,
      exercise: ex // For immediate UI feedback
    };
    setEditedWorkout({
      ...editedWorkout,
      exercise_sets: [...editedWorkout.exercise_sets, newSet]
    });
  };

  const updateSet = (index, field, val) => {
    const newSets = [...editedWorkout.exercise_sets];
    newSets[index] = { ...newSets[index], [field]: val };
    setEditedWorkout({ ...editedWorkout, exercise_sets: newSets });
  };

  const removeSet = (index) => {
    const newSets = editedWorkout.exercise_sets.filter((_, i) => i !== index);
    setEditedWorkout({ ...editedWorkout, exercise_sets: newSets });
  };

  const toggleExerciseCompletion = (exerciseId, currentStatus) => {
    let newSets = [...editedWorkout.exercise_sets];
    const exerciseHasSets = newSets.some(s => s.exercise_id === exerciseId);

    if (!exerciseHasSets && !currentStatus) {
      // If checking an exercise with no sets, add a default one
      const ex = exercises.find(e => e.id === exerciseId);
      newSets.push({
        exercise_id: exerciseId,
        value: "0",
        measurement: "kg",
        is_completed: true,
        exercise: ex
      });
    } else {
      newSets = newSets.map(s => 
        s.exercise_id === exerciseId ? { ...s, is_completed: !currentStatus } : s
      );
    }
    setEditedWorkout({ ...editedWorkout, exercise_sets: newSets });
  };

  const toggleMuscleExpansion = (muscleName) => {
    setExpandedMuscles(prev => ({ ...prev, [muscleName]: !prev[muscleName] }));
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Eliminar este entrenamiento? También se eliminará de Google Calendar.")) return;
    const tid = toast.loading('Eliminando...');
    try {
      await workoutApi.deleteWorkout(workout.id);
      toast.success('Entrenamiento eliminado', { id: tid });
      onUpdate();
      onClose();
    } catch (err) {
      toast.error('Error al eliminar', { id: tid });
    }
  };

  if (!isOpen || !editedWorkout) return null;

  // Grouping the catalog - showing ALL muscle labels that are in the workout
  const catalogByMuscle = muscles.reduce((acc, m) => {
    const muscleName = m.name;
    
    // Check if this muscle has AT LEAST one exercise in the session
    // We check against the exercises catalog to find muscle associations
    const isInWorkout = editedWorkout.exercise_sets.some(s => {
      const exInfo = exercises.find(e => e.id === s.exercise_id);
      return exInfo?.muscle_id === m.id;
    });

    // We show the group if it's in the workout OR if searching
    // If not searching, we show ALL exercises of muscles that are in the workout
    const muscleExs = exercises.filter(ex => {
      const matchSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
      return ex.muscle_id === m.id && (isInWorkout || searchQuery ? matchSearch : false);
    });

    if (muscleExs.length > 0 && (isInWorkout || searchQuery)) {
      acc[muscleName] = muscleExs.map(ex => {
        const sessionSets = editedWorkout.exercise_sets
          .map((s, idx) => ({ ...s, originalIndex: idx }))
          .filter(s => s.exercise_id === ex.id);
        
        // Exercise is considered "completed" (green) if it's in the session AND marked as such
        const inSession = sessionSets.length > 0;
        const isCompleted = inSession && sessionSets.every(s => !!s.is_completed);

        return {
          ...ex,
          inSession,
          sets: sessionSets,
          isCompleted
        };
      }).sort((a, b) => {
        if (a.inSession === b.inSession) return a.name.localeCompare(b.name);
        return b.inSession - a.inSession;
      });
    }
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="glass-card w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col z-10"
      >
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20 shadow-lg shadow-primary/5">
              <Dumbbell size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-white tracking-tight">
                  {(() => {
                    const legMuscles = ["gluteos", "femoral", "cuadriceps", "gemelos"];
                    const currentMuscles = [...new Set(editedWorkout.exercise_sets.map(s => s.exercise?.muscle?.name || s.exercise?.muscle_name).filter(Boolean))];
                    
                    let parts = [];
                    let hasLegs = false;
                    currentMuscles.forEach(m => {
                      if (legMuscles.includes(m.toLowerCase())) hasLegs = true;
                      else parts.push(m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
                    });
                    if (hasLegs) parts.push("Pierna");
                    return parts.sort().join(' - ') || editedWorkout.title || 'Entrenamiento';
                  })()}
                </h2>
                {editedWorkout.fitbit_data && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-accent/20 text-accent rounded-lg">
                    <Check size={12} strokeWidth={3} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Sincronizado con Fitbit</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-2">
                <span className="flex items-center gap-1.5"><Calendar size={12} className="text-primary/50"/> {format(new Date(editedWorkout.start_time), 'MMM dd, yyyy')}</span>
                <span className="flex items-center gap-1.5"><Clock size={12} className="text-primary/50"/> {format(new Date(editedWorkout.start_time), 'HH:mm')}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-500"><X size={24}/></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-10">
          {/* Fitbit Alert/Metrics */}
          {workout.fitbit_data ? (
            <section className="bg-accent/5 border border-accent/20 rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Activity size={80} />
              </div>
              <div className="flex items-center gap-3 mb-6 text-accent">
                <Activity size={20} />
                <h4 className="font-black uppercase text-[10px] tracking-[0.2em]">Métricas de Fitbit</h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {[
                  { label: 'Calorías', val: workout.fitbit_data.calories, unit: 'kcal', color: 'text-accent' },
                  { label: 'FC Media', val: workout.fitbit_data.heart_rate_avg, unit: 'bpm', color: 'text-danger' },
                  { label: 'Duración', val: (workout.fitbit_data.duration_ms / 60000).toFixed(0), unit: 'min', color: 'text-primary' },
                  { label: 'Quema Grasa', val: workout.fitbit_data.azm_fat_burn || 0, unit: 'min', color: 'text-yellow-500' },
                  { label: 'Cardio', val: workout.fitbit_data.azm_cardio || 0, unit: 'min', color: 'text-orange-500' },
                  { label: 'Pico', val: workout.fitbit_data.azm_peak || 0, unit: 'min', color: 'text-red-500' }
                ].map(m => (
                  <div key={m.label}>
                    <p className="text-[10px] text-slate-500 font-black uppercase mb-1 tracking-wider">{m.label}</p>
                    <p className={`text-xl font-black ${m.color}`}>{m.val} <span className="text-[10px] opacity-40 uppercase tracking-tighter">{m.unit}</span></p>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="text-center py-4 border border-dashed border-white/5 rounded-3xl">
              <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">Sin métricas de Fitbit para esta sesión</p>
            </div>
          )}

          {/* Exercises Catalog & Search */}
          <section className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <h4 className="font-black uppercase text-xs tracking-[0.2em] text-slate-500">Catálogo General</h4>
                  <p className="text-slate-600 text-[10px] font-bold mt-1">Marca los ejercicios realizados en esta sesión</p>
                </div>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                <input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar ejercicio..."
                  className="w-full bg-white/5 border border-white/5 rounded-2xl py-2.5 pl-11 pr-4 text-xs font-bold text-white outline-none focus:border-primary/30 transition-all placeholder:text-slate-700"
                />
              </div>
            </div>

            <div className="space-y-4">
              {Object.entries(catalogByMuscle).sort().map(([muscle, groupExs]) => {
                const isExpanded = expandedMuscles[muscle];
                const activeInMuscle = groupExs.filter(ex => ex.inSession).length;

                return (
                  <div key={muscle} className={`glass-card rounded-3xl border transition-all duration-300 ${isExpanded ? 'bg-white/[0.04] border-white/10 p-6' : 'bg-white/[0.01] border-white/5 p-4 hover:border-white/10'}`}>
                    <button 
                      onClick={() => toggleMuscleExpansion(muscle)}
                      className="w-full flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${activeInMuscle > 0 ? 'bg-primary text-white shadow-lg shadow-primary/30 ring-4 ring-primary/10' : 'bg-white/5 text-slate-500'}`}>
                          {muscle}
                        </span>
                        {activeInMuscle > 0 && (
                          <span className="text-[10px] font-black text-primary/80 flex items-center gap-1">
                            <Check size={10} strokeWidth={4} />
                            {activeInMuscle} Seleccionados
                          </span>
                        )}
                      </div>
                      <div className="text-slate-600">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </button>
                    
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-6 space-y-4"
                        >
                          {groupExs.map((ex) => (
                            <div 
                              key={ex.id} 
                              className={`rounded-2xl border transition-all duration-300 ${
                                ex.isCompleted 
                                ? 'bg-accent/20 border-accent/50 shadow-[0_0_30px_rgba(var(--accent-rgb),0.15)] p-6 ring-1 ring-accent/20' 
                                : 'bg-transparent border-white/5 p-3 hover:bg-white/[0.02] hover:border-white/10'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                  <button 
                                    onClick={() => toggleExerciseCompletion(ex.id, ex.isCompleted)}
                                    className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${
                                      ex.isCompleted 
                                      ? 'bg-accent border-accent text-white shadow-lg shadow-accent/30 scale-110' 
                                      : 'bg-transparent border-white/10 text-transparent hover:border-accent/40'
                                    }`}
                                  >
                                    <Check size={16} strokeWidth={4} />
                                  </button>
                                  
                                  <div className="flex flex-col">
                                    <h5 className={`font-black tracking-tight transition-all ${
                                      ex.isCompleted ? 'text-accent text-base' : ex.inSession ? 'text-white text-sm' : 'text-slate-500 text-xs'
                                    }`}>
                                      {ex.name}
                                    </h5>
                                    {ex.isCompleted && (
                                      <span className="text-[9px] font-black text-accent uppercase tracking-widest mt-0.5 animate-in">Realizado en esta sesión</span>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                  {ex.inSession && (
                                    <button 
                                      onClick={() => addSet(ex.id)}
                                      className="flex items-center gap-1.5 text-primary hover:text-white transition-colors text-[9px] font-black uppercase tracking-wider bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20"
                                    >
                                      <Plus size={14} strokeWidth={3} />
                                      Serie
                                    </button>
                                  )}
                                  {!ex.inSession && (
                                    <button 
                                      onClick={() => addSet(ex.id)}
                                      className="p-1.5 rounded-lg border border-white/5 text-slate-600 hover:text-primary hover:border-primary/20 transition-all"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              
                              {ex.inSession && (
                                <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4 transition-opacity`}>
                                  {ex.sets.map((set, sIdx) => {
                                    const setCompleted = set.is_completed;
                                    return (
                                      <div 
                                        key={sIdx} 
                                        className={`rounded-xl p-3 flex items-center justify-between group/set border transition-all ${
                                          setCompleted 
                                          ? 'bg-accent/10 border-accent/40 shadow-[0_0_10px_rgba(var(--accent-rgb),0.1)]' 
                                          : 'bg-black/30 border-white/5'
                                        }`}
                                      >
                                        <div className="flex flex-col">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[8px] font-black uppercase ${setCompleted ? 'text-accent' : 'text-slate-600'}`}>
                                              Serie {sIdx + 1}
                                            </span>
                                            <button 
                                              onClick={() => updateSet(set.originalIndex, 'is_completed', !setCompleted)}
                                              className={`w-3 h-3 rounded-[3px] border flex items-center justify-center transition-all ${
                                                setCompleted ? 'bg-accent border-accent text-white' : 'border-white/20 text-transparent'
                                              }`}
                                            >
                                              <Check size={8} strokeWidth={5} />
                                            </button>
                                          </div>
                                          <div className="flex items-baseline gap-1">
                                            <input 
                                              value={set.value} 
                                              onChange={(e) => updateSet(set.originalIndex, 'value', e.target.value)}
                                              className={`bg-transparent font-black text-sm w-12 border-none p-0 focus:ring-0 ${setCompleted ? 'text-accent' : 'text-white'}`}
                                            />
                                            <select 
                                              value={set.measurement}
                                              onChange={(e) => updateSet(set.originalIndex, 'measurement', e.target.value)}
                                              className={`bg-transparent font-black text-[9px] uppercase border-none p-0 focus:ring-0 cursor-pointer ${setCompleted ? 'text-accent/70' : 'text-primary'}`}
                                            >
                                              <option value="kg">kg</option>
                                              <option value="rep">rep</option>
                                              <option value="s">s</option>
                                            </select>
                                          </div>
                                        </div>
                                        <button 
                                          onClick={() => removeSet(set.originalIndex)}
                                          className="text-slate-600 hover:text-danger opacity-0 group-hover/set:opacity-100 transition-all"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 md:p-8 border-t border-white/5 bg-white/[0.02] flex items-center gap-4">
          <button 
            onClick={handleDelete} 
            className="w-14 h-14 bg-danger/10 text-danger rounded-2xl flex items-center justify-center hover:bg-danger text-danger hover:text-white transition-all active:scale-95 shadow-lg shadow-danger/5"
            title="Eliminar entrenamiento"
          >
            <Trash2 size={24} />
          </button>
          <div className="flex-1 flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1 py-4 uppercase text-xs tracking-widest">Descartar</button>
            <button 
              onClick={handleSave} 
              disabled={saving} 
              className="btn-primary flex-1 py-4 flex items-center justify-center gap-3 shadow-xl shadow-primary/20 uppercase text-xs tracking-widest"
            >
              <Save size={18} />
              {saving ? 'Sincronizando...' : 'Actualizar y Sincronizar'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default WorkoutDetailModal;
