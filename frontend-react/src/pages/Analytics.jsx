import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell 
} from 'recharts';
import { analyticsApi, exerciseApi, workoutApi } from '../api/gymhubApi';
import { TrendingUp, BarChart2, Zap, ArrowUpRight, Scale, Clock, Award, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const Analytics = () => {
  const [lastWorkout, setLastWorkout] = useState(null);
  const [delta, setDelta] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [weightData, setWeightData] = useState([]);
  const [period, setPeriod] = useState('month');
  const [viewType, setViewType] = useState('muscle'); // muscle, exercise, all
  const [frequencyData, setFrequencyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('progreso'); // progreso, records
  const [maxLifts, setMaxLifts] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [historyData, setHistoryData] = useState([]);

  const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#fbbf24', '#10b981', '#06b6d4'];

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
            const volDelta = prevVol === 0 ? 0 : ((lastVol - prevVol) / prevVol) * 100;
            
            setDelta({
              volume: volDelta.toFixed(1),
              date: format(new Date(previousMatch.start_time), 'MMM dd'),
              improved: volDelta >= 0
            });
          }
        }
        if (exRes.data.length > 0) setSelectedExercise(exRes.data[0].id);

        const maxLiftsRes = await analyticsApi.getMaxLifts();
        setMaxLifts(maxLiftsRes.data);
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

  const fetchHistory = async (exerciseId, exerciseName) => {
    try {
      const res = await analyticsApi.getExerciseHistory(exerciseId);
      setHistoryData(res.data);
      setSelectedHistory({ id: exerciseId, name: exerciseName });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="loading-spinner" /></div>;

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight">Análisis de Rendimiento</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Inteligencia de entrenamiento basada en datos</p>
        </div>
        <div className="bg-white/5 border border-white/5 px-4 py-2 rounded-2xl flex items-center gap-3">
          <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          <span className="text-xs font-black text-slate-300 uppercase tracking-widest">Sincronización en tiempo real activa</span>
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
                   <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Última Sesión Completada</p>
                   <h3 className="text-2xl font-black text-white">{lastWorkout.title || 'Entrenamiento sin título'}</h3>
                   <div className="flex items-center gap-3 text-slate-400 text-xs font-bold mt-1">
                     <span className="flex items-center gap-1"><Clock size={12}/> {format(new Date(lastWorkout.start_time), 'dd MMM')}</span>
                     <span className="text-white/10">|</span>
                     <span>{lastWorkout.exercise_sets.length} Series Totales</span>
                   </div>
                   
                   <div className="mt-4 flex flex-wrap gap-2 max-w-md">
                      {[...new Set(lastWorkout.exercise_sets.map(s => s.exercise?.name))].slice(0, 4).map(ex => (
                        <span key={ex} className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-slate-400 border border-white/5 uppercase font-bold tracking-wider">
                          {ex}
                        </span>
                      ))}
                      {new Set(lastWorkout.exercise_sets.map(s => s.exercise?.name)).size > 4 && <span className="text-[9px] text-slate-600 font-bold items-center flex">...</span>}
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
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Calorías</p>
                      <p className="text-lg font-black text-accent">{lastWorkout.fitbit_data.calories}</p>
                    </div>
                    <div className="text-center bg-black/20 px-4 py-2 rounded-2xl">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">FC Media</p>
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
                <h3 className="font-black text-white text-lg tracking-tight">Rendimiento de Cargas</h3>
                <div className="flex gap-4 mt-1">
                  <button 
                    onClick={() => setActiveTab('progreso')}
                    className={`text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === 'progreso' ? 'text-primary' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Progreso Temporal
                  </button>
                  <button 
                    onClick={() => setActiveTab('records')}
                    className={`text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === 'records' ? 'text-primary' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Mis Marcas (PR)
                  </button>
                </div>
              </div>
            </div>
            {activeTab === 'progreso' && (
              <div className="flex bg-black/20 p-1.5 rounded-2xl border border-white/5">
                {['week', 'month', 'year'].map(p => (
                  <button 
                    key={p} 
                    onClick={() => setPeriod(p)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      period === p ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    {p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Año'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeTab === 'progreso' ? (
            <>
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
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[450px] overflow-y-auto no-scrollbar pr-2">
              {maxLifts.map((lift) => (
                <div 
                  key={lift.exercise_id}
                  onClick={() => fetchHistory(lift.exercise_id, lift.exercise_name)}
                  className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:border-primary/30 transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[8px] font-black text-primary uppercase tracking-[0.2em]">{lift.muscle_name}</span>
                    <ArrowUpRight size={14} className="text-slate-600 group-hover:text-primary transition-colors" />
                  </div>
                  <h4 className="text-sm font-black text-white mb-1">{lift.exercise_name}</h4>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-white">{lift.max_value}</span>
                    <span className="text-[10px] font-black text-slate-500 uppercase">{lift.measurement}</span>
                  </div>
                  <p className="text-[9px] font-bold text-slate-600 mt-2">Logrado el {format(new Date(lift.date), 'dd/MM/yyyy')}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* frequency refactor */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }} 
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: 0.1 }} 
          className="lg:col-span-12 glass-card p-6 md:p-10 flex flex-col"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary border border-secondary/20">
                <BarChart2 size={24} />
              </div>
              <div>
                <h3 className="font-black text-white text-lg tracking-tight">Análisis de Frecuencia</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Distribución de entrenamiento (30d)</p>
              </div>
            </div>
            <div className="flex bg-black/20 p-1 rounded-2xl border border-white/5">
              {[
                { id: 'muscle', label: 'Por Músculo' },
                { id: 'exercise', label: 'Por Ejercicio' },
                { id: 'all', label: 'Entrenamientos' }
              ].map(v => (
                <button 
                  key={v.id}
                  onClick={() => setViewType(v.id)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    viewType === v.id ? 'bg-secondary text-white shadow-lg shadow-secondary/20' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className="h-[300px] w-full mt-4">
              {(() => {
                const chartData = viewType === 'muscle' 
                  ? Object.entries(frequencyData.reduce((acc, curr) => {
                      const m = curr.muscle_name || 'Otro';
                      acc[m] = (acc[m] || 0) + curr.count;
                      return acc;
                    }, {})).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count)
                  : viewType === 'exercise'
                  ? frequencyData.slice(0, 8).map(d => ({ name: d.exercise_name, count: d.count }))
                  : [{ name: 'Sesiones Totales', count: [...new Set(frequencyData.map(d => d.exercise_name))].length }];

                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category"
                        stroke="#94a3b8" 
                        fontSize={10} 
                        fontWeight="black"
                        axisLine={false}
                        tickLine={false}
                        width={100}
                      />
                      <Tooltip 
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      />
                      <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={25}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>

            <div className="bg-black/20 rounded-[2rem] border border-white/5 overflow-hidden">
               <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
                  <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    {viewType === 'muscle' ? 'Detalle por Grupo Muscular' : 'Frecuencia de Ejercicios'}
                  </h4>
                  <span className="text-[10px] font-black text-primary uppercase">Volume Metrics</span>
               </div>
               <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#0c1221] z-10">
                      <tr>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-600 uppercase tracking-widest">Elemento</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-600 uppercase tracking-widest text-right">Repeticiones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(viewType === 'muscle' 
                        ? Object.entries(frequencyData.reduce((acc, curr) => {
                            const m = curr.muscle_name || 'Otro';
                            acc[m] = (acc[m] || 0) + curr.count;
                            return acc;
                          }, {})).sort((a,b) => b[1] - a[1])
                        : frequencyData.map(d => [d.exercise_name, d.count])
                      ).map(([name, count], i) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4 flex items-center gap-3">
                            <div className={`w-1.5 h-1.5 rounded-full ${i < 3 ? 'bg-primary' : 'bg-slate-700'}`} />
                            <span className="text-sm font-bold text-slate-300 group-hover:text-white">{name}</span>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-black text-white">{count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>
        </motion.div>

        {/* Global Overview Stats */}
        <div className="lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Intensidad Semanal', value: 'Overdrive', icon: Zap, color: 'text-accent', bg: 'bg-accent/10' },
            { label: 'Gasto Calórico (TDEE)', value: '2,840 kcal', icon: Scale, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Fatiga Muscular', value: 'Media', icon: ArrowUpRight, color: 'text-secondary', bg: 'bg-secondary/10' },
            { label: 'Récords Batidos', value: '7', icon: Award, color: 'text-accent', bg: 'bg-accent/10' },
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
      <AnimatePresence>
        {selectedHistory && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setSelectedHistory(null)} 
              className="absolute inset-0 bg-black/90 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-card w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col z-10"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <div>
                  <h3 className="text-xl font-black text-white">{selectedHistory.name}</h3>
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mt-1">Historial de registros</p>
                </div>
                <button onClick={() => setSelectedHistory(null)} className="text-slate-500 hover:text-white transition-colors">
                  <Clock size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                {historyData.map((h, i) => (
                  <div key={i} className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-4 rounded-2xl group hover:border-primary/30 transition-all">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{format(new Date(h.date), 'dd/MM/yyyy')}</span>
                      <span className="text-xs font-bold text-slate-400">{format(new Date(h.date), 'HH:mm')}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black text-white group-hover:text-primary transition-colors">{h.value}</span>
                      <span className="text-[10px] font-black text-slate-600 uppercase">{h.measurement}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-6 border-t border-white/5 bg-white/[0.02]">
                <button 
                  onClick={() => setSelectedHistory(null)}
                  className="w-full btn-secondary py-3 text-[10px] font-black uppercase tracking-widest"
                >
                  Cerrar Registro
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Analytics;
