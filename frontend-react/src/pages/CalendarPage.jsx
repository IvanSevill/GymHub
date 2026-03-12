import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import { workoutApi, exerciseApi } from '../api/gymhubApi';
import { Plus, X, ChevronRight, ChevronLeft, Check, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import WorkoutDetailModal from '../components/WorkoutDetailModal';

const AddWorkoutModal = ({ isOpen, onClose, onSave }) => {
  const [step, setStep] = useState(1);
  const [muscles, setMuscles] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedMuscleIds, setSelectedMuscleIds] = useState([]);
  const [dateTime, setDateTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [title, setTitle] = useState('New Workout');

  useEffect(() => {
    const fetchData = async () => {
      const [mRes, eRes] = await Promise.all([
        exerciseApi.getMuscles(),
        exerciseApi.getExercises()
      ]);
      setMuscles(mRes.data);
      setExercises(eRes.data);
    };
    if (isOpen) fetchData();
  }, [isOpen]);

  const splits = [
    { name: "Full Body A", items: ["Pecho", "Hombro", "Triceps"] },
    { name: "Full Body B", items: ["Espalda", "Biceps", "Pierna"] },
    { name: "Option A1", items: ["Pecho", "Hombro", "Triceps"] },
    { name: "Option A2", items: ["Pierna", "Abdominales"] },
    { name: "Option A3", items: ["Espalda", "Biceps"] },
    { name: "Option B1", items: ["Pecho", "Abdominales"] },
    { name: "Option B2", items: ["Hombro", "Triceps"] },
    { name: "Option B3", items: ["Pierna"] },
    { name: "Option B4", items: ["Espalda", "Biceps"] },
  ];

  const handleApplySplit = (items) => {
    const ids = muscles.filter(m => items.some(item => m.name.toLowerCase().includes(item.toLowerCase()))).map(m => m.id);
    setSelectedMuscleIds(ids);
  };

  const handleSave = async () => {
    const saveToast = toast.loading('Creating workout and syncing...');
    try {
      const payload = {
        title,
        start_time: dateTime,
        end_time: format(new Date(new Date(dateTime).getTime() + 3600000), "yyyy-MM-dd'T'HH:mm"),
        exercise_sets: [] // Empty sets at creation as per spec
      };
      await workoutApi.createWorkout(payload);
      toast.success('Workout created!', { id: saveToast });
      onSave();
      onClose();
    } catch (err) {
      toast.error('Failed to create workout', { id: saveToast });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="glass-card w-full max-w-xl overflow-hidden z-10"
      >
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-white">Add New Workout</h3>
            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={20}/></button>
        </div>

        <div className="p-6 min-h-[300px]">
          {step === 1 && (
            <div className="space-y-6 animate-in">
              <div>
                <label className="text-xs font-black uppercase text-slate-500 mb-3 block">Quick Templates</label>
                <div className="flex flex-wrap gap-2">
                  {splits.map(s => (
                    <button 
                      key={s.name} 
                      onClick={() => handleApplySplit(s.items)}
                      className="btn-secondary text-[10px] py-1.5 px-3 uppercase tracking-wider"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-black uppercase text-slate-500 mb-3 block">Manual Selection</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {muscles.map(m => (
                    <button 
                      key={m.id}
                      onClick={() => setSelectedMuscleIds(prev => 
                        prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                      )}
                      className={`p-3 rounded-xl border text-sm font-bold transition-all text-left flex justify-between items-center ${
                        selectedMuscleIds.includes(m.id) 
                          ? 'bg-primary/20 border-primary text-primary' 
                          : 'bg-white/5 border-white/5 text-slate-400'
                      }`}
                    >
                      {m.name}
                      {selectedMuscleIds.includes(m.id) && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in">
              <div>
                <label className="text-xs font-black uppercase text-slate-500 mb-2 block">Workout Title</label>
                <input 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field w-full text-lg font-bold"
                  placeholder="e.g. Morning Push Day"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase text-slate-500 mb-2 block">Start Time</label>
                  <div className="relative">
                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="datetime-local"
                      value={dateTime}
                      onChange={(e) => setDateTime(e.target.value)}
                      className="input-field w-full pl-12"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in space-y-4">
               <label className="text-xs font-black uppercase text-slate-500 mb-2 block tracking-widest">Calendar Event Preview</label>
               <div className="bg-black/40 rounded-2xl p-6 font-mono border border-white/5 whitespace-pre leading-relaxed text-sm">
                 <span className="text-primary font-bold">[GymHub]</span>{"\n"}
                 {muscles
                   .filter(m => selectedMuscleIds.includes(m.id))
                   .map(m => {
                     const ex = exercises.find(e => e.muscle_id === m.id);
                     return `${m.name} - ${ex ? ex.name : 'Exercises TBA'}`;
                   })
                   .sort((a, b) => a.localeCompare(b))
                   .join('\n')
                 }
               </div>
               <p className="text-slate-500 text-xs text-center font-medium">This description will be synced with your Google Calendar event.</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex justify-between gap-4">
          <button 
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="btn-secondary flex-1"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          <button 
            disabled={step === 1 && selectedMuscleIds.length === 0}
            onClick={() => step < 3 ? setStep(step + 1) : handleSave()}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {step === 3 ? 'Confirm & Sync' : 'Next Step'}
            <ChevronRight size={18} />
          </button>
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

  const fetchWorkouts = async () => {
    try {
      const res = await workoutApi.getWorkouts();
      setWorkouts(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkouts();
  }, []);

  const workoutsOnSelectedDay = workouts.filter(w => isSameDay(new Date(w.start_time), date));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-12 flex justify-between items-center mb-4">
        <div>
          <h2 className="text-3xl font-black text-white">Your Calendar</h2>
          <p className="text-slate-400 font-medium">Plan and manage your routines</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary py-3 px-6 rounded-2xl flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          <Plus size={20} strokeWidth={3} />
          New Workout
        </button>
      </div>

      <div className="lg:col-span-8 space-y-8 animate-in">
        <div className="glass-card p-4 md:p-8">
          <Calendar 
            onChange={setDate} 
            value={date} 
            tileContent={({ date: cellDate, view }) => {
              if (view === 'month') {
                const count = workouts.filter(w => isSameDay(new Date(w.start_time), cellDate)).length;
                if (count > 0) return <div className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full shadow-lg shadow-primary" />;
              }
              return null;
            }}
          />
        </div>
      </div>

      <div className="lg:col-span-4 space-y-6">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-primary border border-white/5">
            <CalendarIcon size={24} />
          </div>
          <div>
            <h3 className="font-black text-white">{format(date, 'EEEE')}</h3>
            <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">{format(date, 'MMMM dd, yyyy')}</p>
          </div>
        </div>

        <div className="space-y-4">
          {workoutsOnSelectedDay.length > 0 ? (
            workoutsOnSelectedDay.map(w => (
              <motion.div 
                key={w.id} 
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                onClick={() => setSelectedWorkout(w)}
                className="glass-card p-5 border-l-4 border-l-primary cursor-pointer hover:bg-white/5 transition-all"
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-black text-white uppercase text-sm tracking-wide">{w.title || 'Workout'}</h4>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  <Clock size={12} />
                  {format(new Date(w.start_time), 'HH:mm')} - {format(new Date(w.end_time), 'HH:mm')}
                </div>
              </motion.div>
            ))
          ) : (
            <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-10 text-center">
              <p className="text-slate-500 font-bold text-sm">No workouts planned for this day.</p>
            </div>
          )}
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
    </div>
  );
};

export default CalendarPage;
