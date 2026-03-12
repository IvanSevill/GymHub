import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, Check, Loader2 } from 'lucide-react';
import { workoutApi } from '../api/gymhubApi';
import toast from 'react-hot-toast';

const CalendarSelectionModal = ({ isOpen, onComplete }) => {
  const [calendars, setCalendars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCalendars();
    }
  }, [isOpen]);

  const fetchCalendars = async () => {
    try {
      const res = await workoutApi.getCalendars();
      setCalendars(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar calendarios");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (id) => {
    setSelecting(id);
    try {
      await workoutApi.setCalendar(id);
      toast.success("¡Calendario configurado!");
      onComplete();
    } catch (err) {
      toast.error("Error al configurar el calendario");
    } finally {
      setSelecting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className="absolute inset-0 bg-black/90 backdrop-blur-xl" 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="glass-card max-w-md w-full p-10 z-10 text-center relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />
        
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mx-auto mb-8 border border-primary/20 shadow-inner">
          <CalendarIcon size={36} />
        </div>
        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Objetivo de Enfoque</h2>
        <p className="text-slate-400 text-sm mb-10 font-medium">Selecciona el calendario donde GymHub sincronizará tus rutinas de alto rendimiento.</p>
        
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-primary" size={32} />
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Mapeando Calendarios...</p>
            </div>
          ) : (
            calendars.map(c => (
              <button 
                key={c.id}
                onClick={() => handleSelect(c.id)}
                disabled={selecting !== false}
                className={`w-full text-left p-5 rounded-[2rem] border transition-all flex items-center justify-between group active:scale-95 ${
                  selecting === c.id 
                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' 
                    : 'bg-white/[0.03] border-white/5 hover:border-white/10 text-slate-400'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <p className="font-bold text-sm group-hover:text-white transition-colors">{c.summary}</p>
                  {c.primary && (
                    <span className={`text-[9px] font-black uppercase tracking-widest ${selecting === c.id ? 'text-white/80' : 'text-primary'}`}>
                      Calendario Principal
                    </span>
                  )}
                </div>
                {selecting === c.id ? (
                  <Loader2 className="animate-spin text-white" size={20} />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary/20 transition-all">
                    <Check size={18} className="text-slate-600 group-hover:text-primary transition-colors" />
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default CalendarSelectionModal;
