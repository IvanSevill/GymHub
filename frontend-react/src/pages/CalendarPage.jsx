import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import { workoutApi, exerciseApi } from '../api/gymhubApi';
import { Plus, X, ChevronRight, ChevronLeft, Check, Calendar as CalendarIcon, Clock, Dumbbell, Activity } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import WorkoutDetailModal from '../components/WorkoutDetailModal';

const AddWorkoutModal = ({ isOpen, onClose, onSave }) => {
  const [step, setStep] = useState(1);
  const [selectionMode, setSelectionMode] = useState('split'); // 'split' or 'manual'
  const [muscles, setMuscles] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedMuscleIds, setSelectedMuscleIds] = useState([]);
  const [selectedSplit, setSelectedSplit] = useState(null);
  const [splitDaysConfig, setSplitDaysConfig] = useState([]); // Array of { label, items, date, startTime, endTime, enabled }
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [mRes, eRes] = await Promise.all([
          exerciseApi.getMuscles(),
          exerciseApi.getExercises()
        ]);
        setMuscles(mRes.data);
        setExercises(eRes.data);
      } catch (err) {
        console.error("Error fetching data", err);
      }
    };
    if (isOpen) {
      fetchData();
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    setStep(1);
    setSelectionMode('split');
    setSelectedMuscleIds([]);
    setSelectedSplit(null);
    setSplitDaysConfig([]);
    setDate(format(new Date(), "yyyy-MM-dd"));
    setStartTime("09:00");
    setEndTime("10:30");
    setError(null);
  };

  const legMuscles = ["gluteos", "femoral", "cuadriceps", "gemelos"];
  const legMuscleIds = muscles.filter(m => legMuscles.includes(m.name.toLowerCase())).map(m => m.id);

  const splitPresets = [
    { 
      id: 'split1', 
      name: "Split 1: 3 Días", 
      days: [
        { label: "Día 1: Pecho + Hombro + Triceps", items: ["pecho", "hombro", "triceps"] },
        { label: "Día 2: Pierna + Abdominales", items: ["cuadriceps", "femoral", "gluteos", "gemelos", "abdominales"] },
        { label: "Día 3: Espalda + Biceps", items: ["espalda", "biceps"] }
      ]
    },
    { 
      id: 'split2', 
      name: "Split 2: 4 Días", 
      days: [
        { label: "Día 1: Pecho + Abdominales", items: ["pecho", "abdominales"] },
        { label: "Día 2: Hombro + Triceps", items: ["hombro", "triceps"] },
        { label: "Día 3: Pierna", items: ["cuadriceps", "femoral", "gluteos", "gemelos"] },
        { label: "Día 4: Espalda + Biceps", items: ["espalda", "biceps"] }
      ]
    }
  ];

  const toggleManualMuscle = (id) => {
    const isPierna = id === 'pierna';
    const muscle = isPierna ? { name: 'pierna' } : muscles.find(m => m.id === id);
    if (!muscle) return;
    
    if (muscle.name.toLowerCase() === 'pierna' || legMuscles.includes(muscle.name.toLowerCase())) {
      const allLegIds = muscles.filter(m => legMuscles.includes(m.name.toLowerCase())).map(m => m.id);
      const alreadyHasAll = allLegIds.every(lid => selectedMuscleIds.includes(lid));
      
      if (alreadyHasAll) {
        setSelectedMuscleIds(prev => prev.filter(lid => !allLegIds.includes(lid)));
      } else {
        setSelectedMuscleIds(prev => [...new Set([...prev, ...allLegIds])]);
      }
    } else {
      setSelectedMuscleIds(prev => prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]);
    }
  };

  const handleSelectSplit = (split) => {
    setSelectedSplit(split);
    const today = new Date();
    const config = split.days.map((day, idx) => {
      const d = new Date();
      d.setDate(today.getDate() + idx);
      return {
        ...day,
        date: format(d, "yyyy-MM-dd"),
        startTime: "09:00",
        endTime: "10:30",
        enabled: true
      };
    });
    setSplitDaysConfig(config);
    setStep(2); // Proceed to Configuration
  };

  const updateDayConfig = (idx, field, val) => {
    const newConfig = [...splitDaysConfig];
    newConfig[idx][field] = val;
    setSplitDaysConfig(newConfig);
  };

  const handleNext = () => {
    if (step === 2) {
      if (selectionMode === 'manual') {
        if (endTime <= startTime) {
          setError("La hora de fin debe ser posterior a la de inicio.");
          return;
        }
      } else {
        const hasEnabled = splitDaysConfig.some(d => d.enabled);
        if (!hasEnabled) {
          setError("Debes seleccionar al menos un día para planificar.");
          return;
        }
        const hasTimeError = splitDaysConfig.some(d => d.enabled && d.endTime <= d.startTime);
        if (hasTimeError) {
          setError("Revisa las horas de inicio y fin en los días seleccionados.");
          return;
        }
      }
    }
    setError(null);
    setStep(step + 1);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const saveToast = toast.loading('Planificando entrenamientos...');
    try {
      if (selectionMode === 'manual') {
        const selectedMuscles = muscles.filter(m => selectedMuscleIds.includes(m.id));
        let titleParts = [];
        let hasLegs = false;
        selectedMuscles.forEach(m => {
          if (legMuscles.includes(m.name.toLowerCase())) hasLegs = true;
          else titleParts.push(m.name.charAt(0).toUpperCase() + m.name.slice(1).toLowerCase());
        });
        if (hasLegs) titleParts.push("Pierna");
        const generatedTitle = titleParts.sort().join(' - ') || 'Entrenamiento';

        const setsToCreate = exercises
          .filter(ex => selectedMuscleIds.includes(ex.muscle_id))
          .map(ex => ({ exercise_id: ex.id, value: "0", measurement: "kg", is_completed: true }));

        await workoutApi.createWorkout({
          title: generatedTitle,
          start_time: `${date}T${startTime}`,
          end_time: `${date}T${endTime}`,
          exercise_sets: setsToCreate
        });
      } else {
        const activeDays = splitDaysConfig.filter(d => d.enabled);
        const creations = activeDays.map(async (day) => {
          const daySelectedMuscleIds = muscles
            .filter(m => day.items.some(item => m.name.toLowerCase().includes(item.toLowerCase())))
            .map(m => m.id);
          
          let titleParts = [];
          let hasLegs = false;
          muscles.filter(m => daySelectedMuscleIds.includes(m.id)).forEach(m => {
            if (legMuscles.includes(m.name.toLowerCase())) hasLegs = true;
            else titleParts.push(m.name.charAt(0).toUpperCase() + m.name.slice(1).toLowerCase());
          });
          if (hasLegs) titleParts.push("Pierna");
          const dayTitle = titleParts.sort().join(' - ') || 'Entrenamiento';

          const setsToCreate = exercises
            .filter(ex => daySelectedMuscleIds.includes(ex.muscle_id))
            .map(ex => ({ exercise_id: ex.id, value: "0", measurement: "kg", is_completed: true }));

          return workoutApi.createWorkout({
            title: dayTitle,
            start_time: `${day.date}T${day.startTime}`,
            end_time: `${day.date}T${day.endTime}`,
            exercise_sets: setsToCreate
          });
        });
        await Promise.all(creations);
      }
      toast.success('¡Planificación completada!', { id: saveToast });
      onSave();
      onClose();
    } catch (err) {
      setError("Error al guardar la planificación. Revisa tu conexión.");
      toast.error('Error al guardar', { id: saveToast });
    } finally {
      setSaving(false);
    }
  };

  const renderPreview = () => {
    if (selectionMode === 'manual') {
      const selectedMuscles = muscles.filter(m => selectedMuscleIds.includes(m.id)).sort((a, b) => a.name.localeCompare(b.name));
      let previewLines = ["[GymHub] - Sesión Manual"];
      selectedMuscles.forEach(m => {
        const muscleExs = exercises.filter(ex => ex.muscle_id === m.id).sort((a, b) => a.name.localeCompare(b.name));
        if (muscleExs.length > 0) {
          previewLines.push(`\n[${m.name.toUpperCase()}]`);
          muscleExs.forEach(ex => previewLines.push(`- ${ex.name}`));
        }
      });
      return previewLines.join('\n');
    } else {
      let previewLines = [`[GymHub] - Planificación: ${selectedSplit.name}`];
      splitDaysConfig.filter(d => d.enabled).forEach(day => {
        previewLines.push(`\n📅 ${format(new Date(day.date), "dd MMM")} (${day.startTime} - ${day.endTime})`);
        previewLines.push(`${day.label}`);
      });
      return previewLines.join('\n');
    }
  };

  const isPiernaSelected = legMuscleIds.length > 0 && legMuscleIds.every(id => selectedMuscleIds.includes(id));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        className="glass-card w-full max-w-2xl overflow-hidden flex flex-col z-10"
      >
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20"><Dumbbell size={24}/></div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Añadir Entrenamiento</h3>
              <div className="flex items-center gap-2 mt-1">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`h-1.5 w-8 rounded-full transition-all ${step >= i ? 'bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]' : 'bg-white/10'}`} />
                ))}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-500"><X size={24}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 min-h-[450px]">
          {error && (
            <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-xs font-bold animate-in">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="animate-in space-y-10">
              <div className="flex p-1 bg-white/5 rounded-2xl w-fit mx-auto border border-white/5 shadow-xl">
                <button 
                  onClick={() => setSelectionMode('split')} 
                  className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    selectionMode === 'split' ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Planes Semanales
                </button>
                <button 
                  onClick={() => setSelectionMode('manual')} 
                  className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    selectionMode === 'manual' ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Manual
                </button>
              </div>

              {selectionMode === 'split' ? (
                <div className="animate-in space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {splitPresets.map(split => (
                      <button 
                        key={split.id}
                        onClick={() => handleSelectSplit(split)}
                        className={`p-8 bg-white/5 border rounded-[2.5rem] text-center transition-all hover:bg-primary/5 group flex flex-col items-center gap-4 ${
                          selectedSplit?.id === split.id ? 'border-primary bg-primary/5' : 'border-white/5 hover:border-primary/40'
                        }`}
                      >
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                          selectedSplit?.id === split.id ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                        }`}>
                          <Activity size={32} />
                        </div>
                        <div>
                          <h4 className="text-white font-black text-lg">{split.name}</h4>
                          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Plan completo semanal</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="animate-in space-y-8">
                  <div className="flex items-center gap-2 ml-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-secondary shadow-[0_0_5px_rgba(var(--secondary-rgb),0.5)]" />
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Selección Directa</h4>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    <button 
                      onClick={() => toggleManualMuscle('pierna')}
                      className={`p-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${
                        isPiernaSelected ? 'bg-primary border-primary text-white scale-[1.02]' : 'bg-white/5 border-white/5 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      Pierna
                    </button>
                    {muscles
                      .filter(m => !legMuscles.includes(m.name.toLowerCase()) && m.name.toLowerCase() !== 'pierna')
                      .sort((a,b) => a.name.localeCompare(b.name))
                      .map(m => (
                        <button 
                          key={m.id}
                          onClick={() => toggleManualMuscle(m.id)}
                          className={`p-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${
                            selectedMuscleIds.includes(m.id) ? 'bg-primary border-primary text-white scale-[1.02]' : 'bg-white/5 border-white/5 text-slate-400 hover:border-white/20'
                          }`}
                        >
                          {m.name}
                        </button>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="animate-in space-y-10">
              {selectionMode === 'split' ? (
                <>
                  <div className="flex items-center justify-between px-2 bg-primary/5 p-4 rounded-2xl border border-primary/10 mb-6">
                    <div className="flex items-center gap-2">
                      <Activity size={16} className="text-primary" />
                      <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Plan: {selectedSplit.name}</h4>
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedSplit(null);
                        setStep(1);
                      }} 
                      className="text-[9px] font-black text-primary hover:text-white uppercase px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary transition-all"
                    >
                      Cambiar Plan
                    </button>
                  </div>
                  
                  <div className="space-y-4 max-h-[380px] overflow-y-auto pr-2 scrollbar-thin">
                    {splitDaysConfig.map((day, idx) => (
                      <div 
                        key={idx} 
                        className={`p-5 rounded-[2rem] border transition-all duration-300 ${
                          day.enabled 
                          ? 'bg-white/[0.04] border-primary/30 shadow-[0_0_20px_rgba(var(--primary-rgb),0.05)]' 
                          : 'bg-white/[0.01] border-white/5 opacity-40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-5">
                          <label className="flex items-center gap-3 cursor-pointer group">
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${day.enabled ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'border-white/10 group-hover:border-white/30'}`}>
                              {day.enabled && <Check size={14} strokeWidth={4} />}
                              <input type="checkbox" className="hidden" checked={day.enabled} onChange={(e) => updateDayConfig(idx, 'enabled', e.target.checked)} />
                            </div>
                            <span className={`text-sm font-black transition-colors ${day.enabled ? 'text-white' : 'text-slate-500'}`}>{day.label}</span>
                          </label>
                        </div>
                        
                        {day.enabled && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in">
                            <div className="space-y-2">
                              <label className="text-[8px] font-black text-slate-500 uppercase ml-1">Fecha</label>
                              <input type="date" value={day.date} onChange={(e) => updateDayConfig(idx, 'date', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-primary/50" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[8px] font-black text-slate-500 uppercase ml-1">Inicio</label>
                              <input type="time" value={day.startTime} onChange={(e) => updateDayConfig(idx, 'startTime', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-primary/50" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[8px] font-black text-slate-500 uppercase ml-1">Fin</label>
                              <input type="time" value={day.endTime} onChange={(e) => updateDayConfig(idx, 'endTime', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-primary/50" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="animate-in space-y-10 max-w-md mx-auto pt-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha del Entrenamiento</label>
                    <div className="relative">
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field pl-12" />
                      <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hora Inicio</label>
                      <div className="relative">
                        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-field pl-12" />
                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hora Fin</label>
                      <div className="relative">
                        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input-field pl-12" />
                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="animate-in space-y-8">
              <div className="bg-black/40 border border-white/10 rounded-3xl p-8 font-mono text-xs whitespace-pre text-slate-300 leading-relaxed max-h-[300px] overflow-y-auto scrollbar-thin">
                {renderPreview()}
              </div>
              <div className="bg-white/5 rounded-3xl p-6 border border-white/5 flex flex-wrap items-center gap-4">
                <div className="flex flex-wrap gap-2">
                  {muscles.filter(m => selectedMuscleIds.includes(m.id)).map(m => (
                    <span key={m.id} className="px-3 py-1 bg-primary/20 text-primary rounded-lg text-[9px] font-black uppercase tracking-wider">{m.name}</span>
                  ))}
                </div>
                <div className="h-4 w-px bg-white/10" />
                <div className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                  {selectionMode === 'manual' ? `${format(new Date(date), "dd MMM")} | ${startTime} - ${endTime}` : 'Planificación Múltiple'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 border-t border-white/5 flex gap-4 bg-white/[0.02]">
          <button onClick={() => step > 1 ? setStep(step - 1) : onClose()} className="btn-secondary flex-1 py-4 uppercase text-xs font-black tracking-widest">{step === 1 ? 'Cerrar' : 'Atrás'}</button>
          {step === 1 && (selectionMode === 'manual' || selectedSplit) && (
            <button 
              disabled={selectionMode === 'manual' ? selectedMuscleIds.length === 0 : !splitDaysConfig.some(d => d.enabled)}
              onClick={handleNext}
              className="btn-primary flex-1 py-4 uppercase text-xs font-black tracking-widest flex items-center justify-center gap-2"
            >
              Siguiente <ChevronRight size={18} />
            </button>
          )}
          {step === 2 && (
            <button onClick={handleNext} className="btn-primary flex-1 py-4 uppercase text-xs font-black tracking-widest flex items-center justify-center gap-2">
              Siguiente <ChevronRight size={18} />
            </button>
          )}
          {step === 3 && (
            <button 
              disabled={saving}
              onClick={handleSave} 
              className="btn-primary flex-1 py-4 uppercase text-xs font-black tracking-widest flex items-center justify-center gap-2"
            >
              {saving ? 'Guardando...' : 'Confirmar y Guardar'} <Check size={18} />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const CalendarPage = () => {
  const [date, setDate] = useState(new Date());
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  const fetchWorkouts = async (showToast = false) => {
    const tid = showToast ? toast.loading('Sincronizando...') : null;
    try {
      if (showToast) await workoutApi.syncAll();
      const res = await workoutApi.getWorkouts();
      setWorkouts(res.data);
      if (showToast) toast.success('Listo', { id: tid });
    } catch (err) {
      if (showToast) toast.error('Error', { id: tid });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWorkouts(); }, []);

  const workoutsOnSelectedDay = workouts.filter(w => isSameDay(new Date(w.start_time), date));

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <header className="lg:col-span-12 flex justify-between items-center mb-6">
          <div>
            <h2 className="text-4xl font-black text-white tracking-tight">Registro de Rendimiento</h2>
            <p className="text-slate-500 font-medium">Sigue tu consistencia y planificación</p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => fetchWorkouts(true)} className="w-12 h-12 glass-card flex items-center justify-center text-slate-400 hover:text-primary transition-all"><Activity size={20} /></button>
            <button onClick={() => setIsModalOpen(true)} className="btn-primary px-6 py-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20"><Plus size={18} strokeWidth={3} /> Nueva Entrada</button>
          </div>
        </header>

        <div className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-8 animate-in">
            <div className="glass-card p-4 md:p-10 relative overflow-hidden min-h-[500px]">
              <motion.div 
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.05, 0.1, 0.05],
                  rotate: [0, 90, 0]
                }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 right-0 w-96 h-96 bg-primary/20 blur-[120px] -mr-48 -mt-48 rounded-full" 
              />
              <motion.div 
                animate={{ 
                  scale: [1.2, 1, 1.2],
                  opacity: [0.05, 0.1, 0.05],
                  rotate: [0, -90, 0]
                }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/20 blur-[120px] -ml-48 -mb-48 rounded-full" 
              />
              <div className="relative z-10 w-full">
                <Calendar onChange={setDate} value={date} tileContent={({ date: cellDate, view }) => view === 'month' && workouts.some(w => isSameDay(new Date(w.start_time), cellDate)) ? <div className="calendar-workout-indicator" /> : null} />
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="glass-card p-8 border-primary/10 h-full">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-lg shadow-primary/5"><CalendarIcon size={28} /></div>
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight capitalize">{format(date, 'EEEE', { locale: undefined })}</h3>
                  <p className="text-primary font-black uppercase text-[10px] tracking-widest">{format(date, 'dd MMMM, yyyy')}</p>
                </div>
              </div>
              <div className="space-y-4">
                {workoutsOnSelectedDay.length > 0 ? (
                  workoutsOnSelectedDay.map(w => (
                    <div key={w.id} onClick={() => setSelectedWorkout(w)} className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-3xl p-6 cursor-pointer transition-all group active:scale-95">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-black text-white text-lg group-hover:text-primary transition-colors">{w.title || 'Entrenamiento'}</h4>
                        <ChevronRight size={20} className="text-slate-600 group-hover:text-primary transition-all" />
                      </div>
                      <div className="flex items-center gap-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                        <Clock size={14} className="text-primary" />
                        {format(new Date(w.start_time), 'HH:mm')}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto opacity-20"><Activity size={32} /></div>
                    <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Descanso Estratégico</p>
                  </div>
                )}
              </div>
            </div>
            {workoutsOnSelectedDay.length === 0 && (
              <button 
                onClick={() => setIsModalOpen(true)}
                className="w-full mt-8 btn-primary py-5 text-xs font-black uppercase tracking-[0.3em] shadow-[0_10px_30px_rgba(99,102,241,0.3)] relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                Programar Sesión
              </button>
            )}
          </div>
        </div>
      </div>

      <AddWorkoutModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={fetchWorkouts}
      />

      <WorkoutDetailModal 
        isOpen={!!selectedWorkout}
        workout={selectedWorkout}
        onClose={() => setSelectedWorkout(null)}
        onUpdate={fetchWorkouts}
      />
    </>
  );
};

export default CalendarPage;
