import React, { useState, useEffect } from 'react';
import { analyticsApi } from '../api/gymhubApi';
import { Award, Clock, ArrowUpRight, Search, TrendingUp, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const MaxLifts = () => {
  const [maxLifts, setMaxLifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchMaxLifts = async () => {
      try {
        const res = await analyticsApi.getMaxLifts();
        setMaxLifts(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMaxLifts();
  }, []);

  const fetchHistory = async (exerciseId, exerciseName) => {
    try {
      const res = await analyticsApi.getExerciseHistory(exerciseId);
      setHistoryData(res.data);
      setSelectedHistory({ id: exerciseId, name: exerciseName });
    } catch (err) {
      console.error(err);
    }
  };

  const filteredLifts = maxLifts.filter(lift => 
    lift.exercise_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lift.muscle_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by muscle
  const groupedLifts = filteredLifts.reduce((acc, lift) => {
    const muscle = lift.muscle_name || 'Otros';
    if (!acc[muscle]) acc[muscle] = [];
    acc[muscle].push(lift);
    return acc;
  }, {});

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-40 gap-4">
      <div className="loading-spinner" />
      <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest animate-pulse">Cargando Récords...</p>
    </div>
  );

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight">Mis Máximos</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Tus récords personales y marcas históricas</p>
        </div>
        
        <div className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-primary transition-colors">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            placeholder="BUSCAR EJERCICIO O MÚSCULO..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-xs font-black text-white outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all min-w-[300px] uppercase tracking-widest placeholder:text-slate-600"
          />
        </div>
      </div>

      {maxLifts.length === 0 ? (
        <div className="glass-card p-20 text-center">
          <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-slate-700 mx-auto mb-6">
            <Award size={40} />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Sin récords registrados</h3>
          <p className="text-slate-500 text-sm font-bold">Completa tus primeros entrenamientos para ver tus máximos aquí.</p>
        </div>
      ) : Object.keys(groupedLifts).length === 0 ? (
        <div className="glass-card p-20 text-center">
          <p className="text-slate-500 text-sm font-bold">No se encontraron resultados para "{searchQuery}"</p>
        </div>
      ) : (
        <div className="space-y-12">
          {Object.entries(groupedLifts).map(([muscle, lifts], groupIndex) => (
            <motion.div 
              key={muscle}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: groupIndex * 0.1 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">{muscle}</h3>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {lifts.map((lift) => (
                  <motion.div 
                    key={lift.exercise_id}
                    whileHover={{ scale: 1.02, translateY: -5 }}
                    onClick={() => fetchHistory(lift.exercise_id, lift.exercise_name)}
                    className="glass-card p-6 cursor-pointer group hover:border-primary/30 transition-all border-white/5 bg-white/[0.02]"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                        <TrendingUp size={20} />
                      </div>
                      <ArrowUpRight size={16} className="text-slate-600 group-hover:text-primary transition-colors" />
                    </div>
                    
                    <h4 className="text-lg font-black text-white mb-1 group-hover:text-primary transition-colors">{lift.exercise_name}</h4>
                    
                    <div className="flex items-baseline gap-2 mt-4">
                      <span className="text-4xl font-black text-white tracking-tighter">{lift.max_value}</span>
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{lift.measurement}</span>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Clock size={12} />
                        <span className="text-[10px] font-bold">{format(new Date(lift.date), 'dd MMM yyyy')}</span>
                      </div>
                      <span className="text-[9px] font-black text-primary uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        Historial <ChevronRight size={10} />
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* History Modal */}
      <AnimatePresence>
        {selectedHistory && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setSelectedHistory(null)} 
              className="absolute inset-0 bg-background/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-card w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col z-10 border-white/10"
            >
              <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Award size={14} className="text-primary" />
                    <span className="text-[9px] font-black text-primary uppercase tracking-[0.3em]">Récord Histórico</span>
                  </div>
                  <h3 className="text-2xl font-black text-white">{selectedHistory.name}</h3>
                </div>
                <button 
                  onClick={() => setSelectedHistory(null)} 
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-all"
                >
                  <Clock size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar">
                {historyData.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="loading-spinner mx-auto mb-4" />
                    <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Cargando historial...</p>
                  </div>
                ) : historyData.map((h, i) => {
                  // Check if this is the max value in history
                  const isMax = parseFloat(h.value) === Math.max(...historyData.map(d => parseFloat(d.value) || 0));
                  
                  return (
                    <motion.div 
                      key={i} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`flex justify-between items-center p-5 rounded-2xl border transition-all ${
                        isMax 
                          ? 'bg-primary/5 border-primary/20 shadow-lg shadow-primary/5' 
                          : 'bg-white/[0.02] border-white/5'
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-white uppercase tracking-widest">{format(new Date(h.date), 'dd MMMM, yyyy')}</span>
                          {isMax && (
                            <span className="bg-primary/20 text-primary text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">PR</span>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
                          <Clock size={10} /> {format(new Date(h.date), 'HH:mm')}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-xl font-black ${isMax ? 'text-primary' : 'text-white'}`}>{h.value}</span>
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{h.measurement}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="p-8 border-t border-white/5 bg-white/[0.01]">
                <button 
                  onClick={() => setSelectedHistory(null)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-white/5"
                >
                  Cerrar Historial
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MaxLifts;
