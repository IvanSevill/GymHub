import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { authApi, adminApi, exerciseApi } from '../api/gymhubApi';
import { User, LogOut, Activity, Shield, Download, Upload, Plus, Mail, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const NewExerciseModal = ({ isOpen, onClose, muscles, onCreated }) => {
  const [name, setName] = useState('');
  const [muscleId, setMuscleId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !muscleId) return toast.error("Por favor rellena todos los campos");
    setSubmitting(true);
    try {
      await exerciseApi.createExercise({ name, muscle_id: muscleId });
      toast.success("¡Ejercicio creado!");
      onCreated();
      onClose();
    } catch (err) {
      toast.error("Error al crear el ejercicio");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card w-full max-w-md p-8 z-10">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-white">Añadir Ejercicio</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest">Nombre del Ejercicio</label>
            <input 
              value={name} onChange={e => setName(e.target.value)}
              className="input-field w-full" placeholder="ej. Press de Banca Inclinado"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest">Grupo Muscular</label>
            <select 
              value={muscleId} onChange={e => setMuscleId(e.target.value)}
              className="input-field w-full appearance-none bg-surface"
            >
              <option value="">Seleccionar Músculo</option>
              {muscles.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full py-4 flex justify-center items-center gap-2">
            <Check size={18} strokeWidth={3} />
            {submitting ? 'Creando...' : 'Crear Ejercicio'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const Settings = () => {
  const { user, logout, isFitbitConnected, updateFitbitStatus } = useAuth();
  const [loadingFitbit, setLoadingFitbit] = useState(false);
  const [muscles, setMuscles] = useState([]);
  const [isNewExerciseOpen, setIsNewExerciseOpen] = useState(false);
  
  const [calendars, setCalendars] = useState([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [updatingCalendar, setUpdatingCalendar] = useState(false);

  useEffect(() => {
    if (user?.is_root) {
      exerciseApi.getMuscles().then(res => setMuscles(res.data));
    }
    fetchCalendars();
  }, [user]);

  const fetchCalendars = async () => {
    setLoadingCalendars(true);
    try {
      const res = await workoutApi.getCalendars();
      setCalendars(res.data);
    } catch (err) {
      console.error("Failed to fetch calendars", err);
    } finally {
      setLoadingCalendars(false);
    }
  };

  const handleSetCalendar = async (calendarId) => {
    setUpdatingCalendar(true);
    const tid = toast.loading("Actualizando calendario...");
    try {
      await workoutApi.setCalendar(calendarId);
      toast.success("Calendario actualizado", { id: tid });
      fetchCalendars(); // Refresh selection
    } catch (err) {
      toast.error("Error al actualizar calendario", { id: tid });
    } finally {
      setUpdatingCalendar(false);
    }
  };

  const handleFitbitConnect = async () => {
    setLoadingFitbit(true);
    try {
      const res = await authApi.getFitbitAuthUrl();
      window.location.href = res.data.url || res.data.auth_url;
    } catch (err) {
      toast.error("No se pudo iniciar la conexión con Fitbit");
    } finally {
      setLoadingFitbit(false);
    }
  };

  const handleFitbitDisconnect = async () => {
    if (!window.confirm("¿Estás seguro de desconectar Fitbit? Tus métricas dejarán de sincronizarse.")) return;
    const tid = toast.loading("Desconectando Fitbit...");
    try {
      await authApi.disconnectFitbit();
      updateFitbitStatus(false);
      toast.success("Fitbit desconectado", { id: tid });
    } catch (err) {
      toast.error("Error al conectar", { id: tid });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight">Ajustes del Sistema</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Gestiona tu identidad e integraciones</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Profile Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-12 glass-card p-8 md:p-12 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity pointer-events-none">
             <User size={200} />
          </div>
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="relative">
              {user?.picture_url ? (
                <img src={user.picture_url} alt={user.name} className="w-32 h-32 rounded-[2rem] border-4 border-primary/20 shadow-2xl shadow-primary/10 object-cover" />
              ) : (
                <div className="w-32 h-32 bg-primary/10 rounded-[2rem] border-2 border-primary/20 flex items-center justify-center text-primary text-4xl font-black">
                  {user?.name?.[0]}
                </div>
              )}
              {user?.is_root === 1 && (
                <div className="absolute -bottom-3 -right-3 bg-gradient-to-br from-secondary to-primary text-white p-2.5 rounded-2xl shadow-xl flex items-center justify-center">
                  <Shield size={20} />
                </div>
              )}
            </div>
            
            <div className="text-center md:text-left flex-1">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                 <h3 className="text-3xl font-black text-white">{user?.name}</h3>
                 {user?.is_root === 1 && (
                   <span className="bg-secondary/10 text-secondary text-[9px] font-black uppercase px-2.5 py-1 rounded-lg tracking-widest self-center md:self-auto border border-secondary/20 shadow-lg shadow-secondary/5">
                     Global Admin
                   </span>
                 )}
              </div>
              <div className="flex items-center justify-center md:justify-start gap-2 text-slate-500 font-bold text-sm mt-2">
                <Mail size={16} className="opacity-40" />
                {user?.email}
              </div>
              
              <div className="mt-8 flex flex-wrap justify-center md:justify-start gap-4">
                <button onClick={logout} className="px-8 py-3 bg-white/5 hover:bg-danger/10 text-slate-400 hover:text-danger rounded-2xl transition-all border border-white/5 active:scale-95 flex items-center gap-2 font-black uppercase text-[10px] tracking-widest">
                  <LogOut size={16} />
                  Cerrar Sesión
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Google Calendar Selection */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-6 glass-card p-10">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
              <Plus size={24} />
            </div>
            <div>
              <h3 className="font-black text-white text-lg tracking-tight">Google Calendar</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sincronización de Entrenamientos</p>
            </div>
          </div>
          
          <p className="text-slate-400 text-sm mb-10 leading-relaxed font-medium">
            Selecciona el calendario donde se guardarán tus sesiones. Solo los eventos de este calendario se sincronizarán con GymHub.
          </p>

          <div className="space-y-3">
            {loadingCalendars ? (
              <div className="flex justify-center p-4">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : calendars.length > 0 ? (
              calendars.map(cal => (
                <button
                  key={cal.id}
                  onClick={() => handleSetCalendar(cal.id)}
                  disabled={updatingCalendar}
                  className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between group ${
                    cal.selected 
                      ? 'bg-primary/10 border-primary/30 text-white shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                      : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cal.selected ? 'bg-primary animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]' : 'bg-slate-700'}`} />
                    <span className="font-black text-[11px] uppercase tracking-widest truncate">{cal.summary}</span>
                  </div>
                  {cal.selected && <Check size={16} className="text-primary" strokeWidth={3} />}
                </button>
              ))
            ) : (
              <div className="text-center p-6 border border-dashed border-white/10 rounded-3xl">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">No se detectaron calendarios</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Fitbit Integration */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-6 glass-card p-10">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent border border-accent/20">
              <Activity size={24} />
            </div>
            <div>
              <h3 className="font-black text-white text-lg tracking-tight">Conexión con Fitbit</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sincronización de Actividad y Pulso</p>
            </div>
          </div>
          
          <p className="text-slate-400 text-sm mb-10 leading-relaxed font-medium">
            Vincula tu dispositivo de salud para volcar frecuencia cardíaca, duración y gasto calórico directamente en tus entrenamientos.
          </p>

          {isFitbitConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-5 bg-accent/5 border border-accent/10 rounded-2xl">
                <div className="w-3 h-3 bg-accent rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.8)]" />
                <span className="text-accent font-black text-[10px] uppercase tracking-[0.2em]">Sincronizado y Verificado</span>
              </div>
              <button 
                onClick={handleFitbitDisconnect}
                className="w-full py-4 text-danger font-black uppercase text-[10px] tracking-widest hover:bg-danger/10 rounded-2xl transition-all border border-danger/20"
              >
                Cerrar sesión de Fitbit
              </button>
            </div>
          ) : (
            <button 
              onClick={handleFitbitConnect}
              disabled={loadingFitbit}
              className="w-full btn-primary bg-accent hover:bg-accent/90 shadow-2xl shadow-accent/20 flex items-center justify-center gap-3 py-5 rounded-[1.25rem]"
            >
              <Activity size={20} strokeWidth={3} />
              {loadingFitbit ? 'Solicitando...' : 'Vincular Dispositivo Fitbit'}
            </button>
          )}
        </motion.div>

        {/* Admin Panel */}
        {user?.is_root === 1 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-12 glass-card p-10 bg-gradient-to-br from-white/[0.03] to-transparent">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary border border-secondary/20">
                <Shield size={24} />
              </div>
              <div>
                <h3 className="font-black text-white text-lg tracking-tight">Consola de Admin</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Administración del Sistema</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <button 
                onClick={async () => {
                  const res = await adminApi.exportMock();
                  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = "gymhub_catalogo.json";
                  a.click();
                }}
                className="btn-secondary py-5 flex flex-col items-center justify-center gap-3 border-white/5 hover:border-secondary/30 transition-all rounded-3xl group"
              >
                <Download size={24} className="group-hover:text-secondary group-hover:-translate-y-1 transition-all" />
                <span className="text-[10px] font-black uppercase tracking-widest">Exportar Datos</span>
              </button>
              
              <button 
                onClick={() => setIsNewExerciseOpen(true)}
                className="btn-primary bg-secondary hover:bg-secondary/90 shadow-2xl shadow-secondary/20 flex flex-col items-center justify-center gap-3 py-5 rounded-3xl"
              >
                <Plus size={24} strokeWidth={3} />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Nuevo Ejercicio</span>
              </button>

              <div className="relative group">
                <input 
                  type="file" 
                  id="import-catalog" 
                  className="hidden" 
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      const tid = toast.loading("Importando catálogo...");
                      try {
                          const data = JSON.parse(event.target.result);
                          await adminApi.importMock(data);
                          toast.success("Catálogo importado con éxito", { id: tid });
                      } catch (err) {
                          toast.error("JSON inválido o error en la importación", { id: tid });
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
                <button 
                  onClick={() => document.getElementById('import-catalog').click()}
                  className="w-full h-full p-4 bg-white/5 border border-white/5 rounded-3xl text-[10px] font-black text-slate-500 uppercase tracking-widest flex flex-col items-center justify-center gap-3 hover:bg-white/10 transition-colors border-dashed"
                >
                  <Upload size={24} />
                  Importar JSON Mock
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {isNewExerciseOpen && (
          <NewExerciseModal 
            isOpen={isNewExerciseOpen} 
            onClose={() => setIsNewExerciseOpen(false)}
            muscles={muscles}
            onCreated={() => {}}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Settings;
