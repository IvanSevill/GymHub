import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, Activity, Dumbbell, Trash2, Save, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { workoutApi, exerciseApi } from '../api/gymhubApi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const WorkoutDetailModal = ({ workout, isOpen, onClose, onUpdate }) => {
  const [editedWorkout, setEditedWorkout] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [muscles, setMuscles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeMuscleTab, setActiveMuscleTab] = useState(null);

  useEffect(() => {
    if (workout) {
      setEditedWorkout({ ...workout });
      fetchData();
    }
  }, [workout]);

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
    const tid = toast.loading('Updating workout...');
    setSaving(true);
    try {
      const { fitbit_data, exercise_sets, ...rest } = editedWorkout;
      // Map sets back to schema (only exercise_id, value, measurement)
      const sanitizedSets = exercise_sets.map(s => ({
        exercise_id: s.exercise_id,
        value: s.value,
        measurement: s.measurement
      }));
      
      await workoutApi.updateWorkout(workout.id, { ...rest, exercise_sets: sanitizedSets });
      toast.success('Workout updated and synced!', { id: tid });
      onUpdate();
      onClose();
    } catch (err) {
      toast.error('Failed to update', { id: tid });
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

  const handleDelete = async () => {
    if (!window.confirm("Delete this workout? This will also remove it from Google Calendar.")) return;
    const tid = toast.loading('Deleting...');
    try {
      await workoutApi.deleteWorkout(workout.id);
      toast.success('Workout deleted', { id: tid });
      onUpdate();
      onClose();
    } catch (err) {
      toast.error('Delete failed', { id: tid });
    }
  };

  if (!isOpen || !editedWorkout) return null;

  // Grouping sets for the UI
  const groupedSets = editedWorkout.exercise_sets.reduce((acc, set, idx) => {
    const mName = set.exercise?.muscle_name || 'Other';
    const eName = set.exercise?.name || 'Unknown';
    if (!acc[mName]) acc[mName] = {};
    if (!acc[mName][eName]) acc[mName][eName] = { id: set.exercise_id, sets: [] };
    acc[mName][eName].sets.push({ ...set, originalIndex: idx });
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
              <input 
                value={editedWorkout.title} 
                onChange={(e) => setEditedWorkout({...editedWorkout, title: e.target.value})}
                className="bg-transparent text-2xl font-black text-white border-none outline-none focus:ring-0 p-0 placeholder:text-white/20"
                placeholder="Workout Title"
              />
              <div className="flex items-center gap-4 text-slate-500 text-xs font-black uppercase tracking-widest mt-1">
                <span className="flex items-center gap-1.5"><Calendar size={12}/> {format(new Date(editedWorkout.start_time), 'MMM dd, yyyy')}</span>
                <span className="flex items-center gap-1.5"><Clock size={12}/> {format(new Date(editedWorkout.start_time), 'HH:mm')}</span>
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
                <h4 className="font-black uppercase text-[10px] tracking-[0.2em]">Fitbit Health Data</h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {[
                  { label: 'Calories', val: workout.fitbit_data.calories, unit: 'kcal', color: 'text-accent' },
                  { label: 'Avg Heart Rate', val: workout.fitbit_data.heart_rate_avg, unit: 'bpm', color: 'text-danger' },
                  { label: 'Active Duration', val: (workout.fitbit_data.duration_ms / 60000).toFixed(0), unit: 'min', color: 'text-primary' },
                  { label: 'Fat Burn', val: workout.fitbit_data.azm_fat_burn || 0, unit: 'min', color: 'text-yellow-500' },
                  { label: 'Cardio', val: workout.fitbit_data.azm_cardio || 0, unit: 'min', color: 'text-orange-500' },
                  { label: 'Peak', val: workout.fitbit_data.azm_peak || 0, unit: 'min', color: 'text-red-500' }
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
              <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">No Fitbit metrics for this session</p>
            </div>
          )}

          {/* Exercises */}
          <section className="space-y-8">
            <div className="flex justify-between items-end">
              <div>
                <h4 className="font-black uppercase text-xs tracking-[0.2em] text-slate-500">Exercise Registry</h4>
                <p className="text-slate-600 text-[10px] font-bold mt-1">Grouped by target muscle</p>
              </div>
            </div>

            <div className="space-y-6">
              {Object.entries(groupedSets).sort().map(([muscle, exObj]) => (
                <div key={muscle} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="bg-primary text-white text-[9px] font-black uppercase px-2.5 py-1 rounded-lg tracking-[0.1em] shadow-lg shadow-primary/20">
                      {muscle}
                    </span>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    {Object.entries(exObj).sort().map(([exName, info]) => (
                      <div key={exName} className="glass-card bg-white/[0.02] p-5 rounded-2xl border-white/5">
                        <div className="flex justify-between items-center mb-4">
                          <h5 className="font-black text-white text-sm tracking-tight">{exName}</h5>
                          <button 
                            onClick={() => addSet(info.id)}
                            className="flex items-center gap-1.5 text-primary hover:text-white transition-colors text-[10px] font-black uppercase tracking-wider"
                          >
                            <Plus size={14} strokeWidth={3} />
                            Add Set
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {info.sets.map((set, sIdx) => (
                            <div key={sIdx} className="bg-black/30 rounded-xl p-3 flex items-center justify-between group/set">
                              <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-600 uppercase mb-1">Set {sIdx + 1}</span>
                                <div className="flex items-baseline gap-1">
                                  <input 
                                    value={set.value} 
                                    onChange={(e) => updateSet(set.originalIndex, 'value', e.target.value)}
                                    className="bg-transparent text-white font-black text-sm w-12 border-none p-0 focus:ring-0"
                                  />
                                  <select 
                                    value={set.measurement}
                                    onChange={(e) => updateSet(set.originalIndex, 'measurement', e.target.value)}
                                    className="bg-transparent text-primary font-black text-[9px] uppercase border-none p-0 focus:ring-0 cursor-pointer"
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
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Exercise Selector */}
            <div className="pt-6 border-t border-white/5">
               <div className="flex flex-col gap-2">
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Quick Add Exercise</label>
                 <select 
                   onChange={(e) => {
                     if (e.target.value) addSet(e.target.value);
                     e.target.value = "";
                   }}
                   className="input-field w-full text-sm font-bold appearance-none bg-surface"
                 >
                   <option value="">Choose an exercise to add a set...</option>
                   {muscles.map(m => (
                     <optgroup key={m.id} label={m.name.toUpperCase()}>
                        {exercises.filter(e => e.muscle_id === m.id).map(ex => (
                          <option key={ex.id} value={ex.id}>{ex.name}</option>
                        ))}
                     </optgroup>
                   ))}
                 </select>
               </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 md:p-8 border-t border-white/5 bg-white/[0.02] flex items-center gap-4">
          <button 
            onClick={handleDelete} 
            className="w-14 h-14 bg-danger/10 text-danger rounded-2xl flex items-center justify-center hover:bg-danger text-danger hover:text-white transition-all active:scale-95 shadow-lg shadow-danger/5"
            title="Delete Workout"
          >
            <Trash2 size={24} />
          </button>
          <div className="flex-1 flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1 py-4 uppercase text-xs tracking-widest">Discard</button>
            <button 
              onClick={handleSave} 
              disabled={saving} 
              className="btn-primary flex-1 py-4 flex items-center justify-center gap-3 shadow-xl shadow-primary/20 uppercase text-xs tracking-widest"
            >
              <Save size={18} />
              {saving ? 'Syncing...' : 'Update & Sync'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default WorkoutDetailModal;
