import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell 
} from 'recharts';
import { analyticsApi, exerciseApi, workoutApi } from '../api/gymhubApi';
import { TrendingUp, BarChart2, Zap, ArrowUpRight, Scale, Clock, Award, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const Analytics = () => {
  const [lastWorkout, setLastWorkout] = useState(null);
  const [delta, setDelta] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [weightData, setWeightData] = useState([]);
  const [frequencyData, setFrequencyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  useEffect(() => {
    const init = async () => {
      try {
        const [exRes, freqRes, wRes] = await Promise.all([
          exerciseApi.getExercises(),
          analyticsApi.getFrequency({ days: 30 }),
          workoutApi.getWorkouts({ limit: 10 }) // Fetch more to find previous match
        ]);
        setExercises(exRes.data);
        setFrequencyData(freqRes.data);
        
        const allW = wRes.data;
        if (allW.length > 0) {
          const last = allW[0];
          setLastWorkout(last);
          
          // Find delta: find the first workout (allW[1...]) that shares a muscle with allW[0]
          const lastMuscles = new Set(last.exercise_sets.map(s => s.exercise?.muscle_name));
          const previousMatch = allW.slice(1).find(w => 
            w.exercise_sets.some(s => lastMuscles.has(s.exercise?.muscle_name))
          );
          
          if (previousMatch) {
            const lastVol = last.exercise_sets.reduce((sum, s) => sum + (parseFloat(s.value) || 0), 0);
            const prevVol = previousMatch.exercise_sets.reduce((sum, s) => sum + (parseFloat(s.value) || 0), 0);
            const volDelta = prevVol === 0 ? 100 : ((lastVol - prevVol) / prevVol) * 100;
            
            setDelta({
              volume: volDelta.toFixed(1),
              date: format(new Date(previousMatch.start_time), 'MMM dd'),
              improved: volDelta >= 0
            });
          }
        }
        if (exRes.data.length > 0) setSelectedExercise(exRes.data[0].id);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (selectedExercise) {
      const fetchWeight = async () => {
        try {
          const res = await analyticsApi.getWeightProgress(selectedExercise, period);
          setWeightData(res.data.map(d => ({
            ...d,
            formattedDate: format(new Date(d.date), 'MMM dd')
          })));
        } catch (err) {
          console.error(err);
        }
      };
      fetchWeight();
    }
  }, [selectedExercise, period]);

  if (loading) return <div className="flex justify-center py-20"><div className="loading-spinner" /></div>;

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight">Performance Hub</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Data-driven workout intelligence</p>
        </div>
        <div className="bg-white/5 border border-white/5 px-4 py-2 rounded-2xl flex items-center gap-3">
          <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          <span className="text-xs font-black text-slate-300 uppercase tracking-widest">Real-time sync active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Last Workout Summary */}
        {lastWorkout && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-12 glass-card overflow-hidden group">
            <div className="bg-gradient-to-r from-primary/10 to-transparent p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-primary/20 rounded-3xl flex items-center justify-center text-primary border border-primary/20 shadow-xl shadow-primary/5">
                  <Award size={32} />
                </div>
                <div>
                   <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Last Session Mastered</p>
                   <h3 className="text-2xl font-black text-white">{lastWorkout.title || 'Untitled Workout'}</h3>
                   <div className="flex items-center gap-3 text-slate-400 text-xs font-bold mt-1">
                     <span className="flex items-center gap-1"><Clock size={12}/> {format(new Date(lastWorkout.start_time), 'MMM dd')}</span>
                     <span className="text-white/10">|</span>
                     <span>{lastWorkout.exercise_sets.length} Exercises Performed</span>
                   </div>
                   {delta && (
                     <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                       delta.improved ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'
                     }`}>
                       {delta.improved ? <ArrowUpRight size={12}/> : <ArrowUpRight size={12} className="rotate-90"/>}
                       {delta.volume}% vs {delta.date}
                     </div>
                   )}
                </div>
              </div>

              <div className="flex gap-4">
                {lastWorkout.fitbit_data && (
                  <>
                    <div className="text-center bg-black/20 px-4 py-2 rounded-2xl">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Calories</p>
                      <p className="text-lg font-black text-accent">{lastWorkout.fitbit_data.calories}</p>
                    </div>
                    <div className="text-center bg-black/20 px-4 py-2 rounded-2xl">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg HR</p>
                      <p className="text-lg font-black text-danger">{lastWorkout.fitbit_data.heart_rate_avg}</p>
                    </div>
                  </>
                )}
                <button className="w-12 h-12 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center text-slate-400 transition-all border border-white/5">
                  <ChevronRight size={24} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Weight Progression Chart */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }} 
          animate={{ opacity: 1, x: 0 }} 
          className="lg:col-span-8 glass-card p-6 md:p-10"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                <TrendingUp size={24} />
              </div>
              <div>
                <h3 className="font-black text-white text-lg tracking-tight">Lifting Progress</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Load volume overtime</p>
              </div>
            </div>
            <div className="flex bg-black/20 p-1.5 rounded-2xl border border-white/5">
              {['week', 'month', 'year'].map(p => (
                <button 
                  key={p} 
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    period === p ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <select 
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="w-full sm:w-64 bg-surface border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-primary/50"
            >
              {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            </select>
          </div>

          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightData}>
                <CartesianGrid strokeDasharray="5 5" stroke="#ffffff03" vertical={false} />
                <XAxis 
                  dataKey="formattedDate" 
                  stroke="#64748b" 
                  fontSize={10} 
                  fontWeight="black"
                  axisLine={false}
                  tickLine={false}
                  padding={{ left: 20, right: 20 }}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  fontWeight="black"
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#6366f1', fontWeight: 'black', fontSize: '14px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#6366f1" 
                  strokeWidth={6} 
                  dot={{ r: 6, fill: '#6366f1', strokeWidth: 3, stroke: '#0f172a' }}
                  activeDot={{ r: 9, fill: '#6366f1', strokeWidth: 3, stroke: '#fff' }}
                  animationDuration={1500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* frequency */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }} 
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: 0.1 }} 
          className="lg:col-span-4 glass-card p-6 md:p-10 flex flex-col"
        >
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary border border-secondary/20">
              <BarChart2 size={24} />
            </div>
            <div>
              <h3 className="font-black text-white text-lg tracking-tight">Frequency</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Most repeated 30d</p>
            </div>
          </div>

          <div className="flex-1 min-h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={frequencyData.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="exercise_name" 
                  type="category"
                  stroke="#94a3b8" 
                  fontSize={9} 
                  fontWeight="black"
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={20}>
                  {frequencyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#6366f1' : '#a855f7'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
             <div className="flex justify-between items-center bg-black/20 p-4 rounded-2xl">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Consistency Score</span>
                <span className="text-xl font-black text-accent">84%</span>
             </div>
          </div>
        </motion.div>

        {/* Global Overview Stats */}
        <div className="lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Weekly Intensity', value: 'Overdrive', icon: Zap, color: 'text-accent', bg: 'bg-accent/10' },
            { label: 'Estimated TDEE', value: '2,840 kcal', icon: Scale, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Muscle Fatigue', value: 'Medium', icon: ArrowUpRight, color: 'text-secondary', bg: 'bg-secondary/10' },
            { label: 'PRs Cracked', value: '7', icon: Award, color: 'text-accent', bg: 'bg-accent/10' },
          ].map((stat, i) => (
            <motion.div 
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + (i * 0.1) }}
              className="glass-card p-8 flex flex-col items-center text-center group"
            >
              <div className={`w-14 h-14 ${stat.bg} ${stat.color} rounded-3xl flex items-center justify-center mb-6 border border-white/5 transition-transform group-hover:scale-110`}>
                <stat.icon size={28} />
              </div>
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-2">{stat.label}</p>
              <p className="text-3xl font-black text-white">{stat.value}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
