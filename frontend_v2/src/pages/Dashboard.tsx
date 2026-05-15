import React, { useEffect, useState } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell 
} from 'recharts';
import { 
  Dumbbell, 
  TrendingUp, 
  Calendar as CalendarIcon, 
  Award,
  ArrowUpRight,
  ChevronRight,
  Zap,
  Scale,
  Clock
} from 'lucide-react';
import { analyticsService, MaxLift, ExerciseFrequency } from '../services/analytics';
import { workoutService, Workout } from '../services/workout';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const Dashboard: React.FC = () => {
  const [maxLifts, setMaxLifts] = useState<MaxLift[]>([]);
  const [frequency, setFrequency] = useState<ExerciseFrequency[]>([]);
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [lifts, freq, workouts] = await Promise.all([
          analyticsService.getMaxLifts(),
          analyticsService.getExerciseFrequency(undefined, 30),
          workoutService.getWorkouts()
        ]);
        setMaxLifts(lifts.slice(0, 5));
        setFrequency(freq.slice(0, 6));
        setRecentWorkouts(workouts.slice(0, 3));
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  const stats = [
    { label: 'Intensidad Semanal', value: 'Overdrive', icon: <Zap size={24} />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Gasto Calórico', value: '2,840 kcal', icon: <Scale size={24} />, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Fatiga Muscular', value: 'Media', icon: <ArrowUpRight size={24} />, color: 'text-secondary', bg: 'bg-secondary/10' },
    { label: 'Récords Batidos', value: '7', icon: <Award size={24} />, color: 'text-accent', bg: 'bg-accent/10' },
  ];

  const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#fbbf24', '#10b981'];

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">Panel de Control</h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Visión general de tu rendimiento</p>
        </div>
        <div className="bg-white/5 border border-white/5 px-4 py-2 rounded-2xl flex items-center gap-3">
          <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          <span className="text-xs font-black text-slate-300 uppercase tracking-widest">Sincronización Activa</span>
        </div>
      </div>

      {/* Global Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-card p-8 flex flex-col items-center text-center group"
          >
            <div className={`w-14 h-14 ${stat.bg} ${stat.color} rounded-3xl flex items-center justify-center mb-6 border border-white/5 transition-transform group-hover:scale-110`}>
              {stat.icon}
            </div>
            <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-2">{stat.label}</p>
            <p className="text-3xl font-black text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Frequency Chart */}
        <div className="lg:col-span-8 glass-card p-6 md:p-10">
          <div className="flex justify-between items-center mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                <TrendingUp size={24} />
              </div>
              <div>
                <h3 className="font-black text-white text-lg tracking-tight">Frecuencia de Entrenamiento</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Últimos 30 días</p>
              </div>
            </div>
          </div>
          
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={frequency}>
                <CartesianGrid strokeDasharray="5 5" stroke="#ffffff03" vertical={false} />
                <XAxis 
                  dataKey="exercise_name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'black' }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'black' }} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
                  itemStyle={{ fontWeight: 'black', fontSize: '14px' }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={40}>
                  {frequency.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Max Lifts List */}
        <div className="lg:col-span-4 glass-card p-6 md:p-10">
          <div className="flex justify-between items-center mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary border border-secondary/20">
                <Award size={24} />
              </div>
              <div>
                <h3 className="font-black text-white text-lg tracking-tight">Mejores Marcas</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tus records personales</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {maxLifts.map((lift, i) => (
              <div key={i} className="flex items-center justify-between group cursor-default">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/[0.02] rounded-xl flex items-center justify-center text-slate-500 group-hover:bg-primary/20 group-hover:text-primary transition-colors border border-white/5">
                    <Dumbbell size={18} />
                  </div>
                  <div>
                    <p className="font-black text-white text-sm capitalize">{lift.exercise_name}</p>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{lift.muscle_name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-white">{lift.max_value}<span className="text-[10px] text-slate-500 ml-0.5">{lift.measurement}</span></p>
                  <p className="text-[9px] font-bold text-slate-600">{format(new Date(lift.date), 'MMM d')}</p>
                </div>
              </div>
            ))}
            {maxLifts.length === 0 && (
              <div className="text-center py-10">
                <p className="text-slate-500 text-xs italic font-bold">No hay registros aún.</p>
              </div>
            )}
          </div>
          <button className="w-full mt-10 py-4 rounded-2xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2">
            Ver Todos los Registros
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Recent Workouts */}
      <div className="glass-card p-6 md:p-10">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent border border-accent/20">
              <CalendarIcon size={24} />
            </div>
            <div>
              <h3 className="font-black text-white text-lg tracking-tight">Sesiones Recientes</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tus últimos entrenamientos</p>
            </div>
          </div>
          <button className="text-primary font-black text-[10px] uppercase tracking-widest hover:underline">Ver Historial</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {recentWorkouts.map((workout, i) => (
            <motion.div 
              key={i}
              whileHover={{ y: -5 }}
              className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-primary/30 transition-all cursor-pointer group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowUpRight size={20} className="text-primary" />
              </div>
              
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
                 <Clock size={12} />
                 {format(new Date(workout.start_time), 'EEEE, MMM d')}
              </div>
              
              <h4 className="text-xl font-black text-white mb-6 group-hover:text-primary transition-colors">{workout.title || 'Entrenamiento'}</h4>
              
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(workout.exercise_sets.map(s => s.exercise?.muscle?.name))).slice(0, 3).map(m => (
                  <span key={m} className="px-3 py-1 bg-white/5 text-[9px] font-black text-slate-400 rounded-lg border border-white/5 uppercase tracking-wider">
                    {m}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
          {recentWorkouts.length === 0 && (
            <div className="col-span-3 text-center py-16 bg-white/[0.01] rounded-[2rem] border border-dashed border-white/10">
               <p className="text-slate-500 text-sm font-bold italic">No hay entrenamientos recientes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
