import React, { useState, useEffect } from 'react';
import { workoutApi, exerciseApi } from '../api/gymhubApi';
import { useAuth } from '../hooks/useAuth';
import { Activity, Calendar, Clock, Filter, Search, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import WorkoutDetailModal from '../components/WorkoutDetailModal';

const WorkoutCard = ({ workout, onClick }) => {
  // Group exercises by muscle
  const muscles = [...new Set(workout.exercise_sets.map(s => s.exercise?.muscle_name).filter(Boolean))];

  return (
    <motion.div 
      layout
      onClick={onClick}
      className="glass-card p-5 hover:border-primary/30 transition-all group cursor-pointer"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors">
            {workout.title || 'Untitled Workout'}
          </h3>
          <div className="flex items-center gap-3 mt-1 text-slate-400 text-sm font-medium">
            <div className="flex items-center gap-1">
              <Calendar size={14} />
              {format(new Date(workout.start_time), 'MMM dd')}
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
          <span key={m} className="bg-primary/10 text-primary text-[10px] font-black uppercase px-2 py-1 rounded-md tracking-wider">
            {m}
          </span>
        ))}
      </div>

      {workout.fitbit_data && (
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5">
          <div className="text-center">
            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Calories</p>
            <p className="text-sm font-black text-accent">{workout.fitbit_data.calories} kcal</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Avg HR</p>
            <p className="text-sm font-black text-danger">{workout.fitbit_data.heart_rate_avg} bpm</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Time</p>
            <p className="text-sm font-black text-primary">{(workout.fitbit_data.duration_ms / 60000).toFixed(0)}m</p>
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
  const [filterMuscle, setFilterMuscle] = useState('all');
  const [filterFitbit, setFilterFitbit] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  const fetchData = async () => {
    try {
      const [wRes, mRes] = await Promise.all([
        workoutApi.getWorkouts(),
        exerciseApi.getMuscles()
      ]);
      setWorkouts(wRes.data);
      setMuscles(mRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredWorkouts = workouts.filter(w => {
    const muscleMatch = filterMuscle === 'all' || w.exercise_sets.some(s => s.exercise?.muscle_name === filterMuscle);
    const fitbitMatch = !filterFitbit || !!w.fitbit_data;
    return muscleMatch && fitbitMatch;
  });

  if (loading) return <div className="flex justify-center py-20"><div className="loading-spinner" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-white">Recent Workouts</h2>
          <p className="text-slate-400 font-medium">Tracking your progress and metrics</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <select 
              value={filterMuscle}
              onChange={(e) => setFilterMuscle(e.target.value)}
              className="bg-surface border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm font-bold text-white outline-none focus:border-primary/50"
            >
              <option value="all">All Muscles</option>
              {muscles.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>

          <button 
            onClick={() => setFilterFitbit(!filterFitbit)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              filterFitbit ? 'bg-accent text-white' : 'bg-surface text-slate-400 border border-white/10'
            }`}
          >
            <Activity size={16} />
            Fitbit Only
          </button>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkouts.map(w => (
            <WorkoutCard key={w.id} workout={w} onClick={() => setSelectedWorkout(w)} />
          ))}
          {filteredWorkouts.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full py-20 text-center"
            >
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-slate-600 mx-auto mb-4 border border-white/5">
                <Search size={32} />
              </div>
              <p className="text-slate-400 font-bold">No workouts match your filters</p>
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
