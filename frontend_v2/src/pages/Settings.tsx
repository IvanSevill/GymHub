import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { authService } from "../services/auth";
import { workoutService } from "../services/workout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  AlertCircle,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Watch,
  ExternalLink,
  Trash2,
  Mail,
  Shield,
  LogOut,
} from "lucide-react";

const Settings: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();

  const [calendars, setCalendars] = useState<any[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isCalendarListOpen, setIsCalendarListOpen] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchCalendars = async () => {
    // Attempt to fetch regardless of has_calendar just in case, but usually depends on user
    setLoadingCalendars(true);
    setCalendarError(null);
    try {
      const data = await workoutService.getCalendars();
      setCalendars(data);
    } catch (err: any) {
      setCalendarError(err.response?.data?.detail || "Error loading calendars");
    } finally {
      setLoadingCalendars(false);
    }
  };

  useEffect(() => {
    fetchCalendars();
  }, []);

  const handleSetCalendar = async (id: string) => {
    try {
      await workoutService.setCalendar(id);
      await fetchCalendars();
      setIsCalendarListOpen(false);
    } catch (error) {
      console.error("Failed to set calendar:", error);
    }
  };

  const handleConnectFitbit = async () => {
    try {
      const { url } = await authService.getFitbitAuthUrl();
      window.location.href = url;
    } catch (error) {
      console.error("Failed to get Fitbit URL:", error);
    }
  };

  const handleDisconnectFitbit = async () => {
    if (
      window.confirm(
        "¿Estás seguro de que deseas desconectar Fitbit? Esto también eliminará los datos de Fitbit de tus entrenamientos.",
      )
    ) {
      try {
        await authService.disconnectFitbit();
        await refreshUser();
      } catch (error) {
        console.error("Failed to disconnect Fitbit:", error);
      }
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const { message } = await workoutService.syncAllFromCalendar();
      setSyncMessage(message);
      await refreshUser();
    } catch (error: any) {
      setSyncMessage(
        error.response?.data?.detail || "Error en la sincronización.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const selectedCalendar = calendars.find((c) => c.selected);

  return (
    <div className="max-w-5xl mx-auto space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Ajustes
          </h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">
            Configuración de cuenta e integraciones
          </p>
        </div>
      </div>

      {/* Profile Section */}
      <section className="glass-card p-10 relative overflow-hidden group">
        <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
          <div className="relative">
            {user?.picture_url ? (
              <img
                src={user.picture_url}
                alt={user?.name}
                className="w-24 h-24 rounded-[2rem] shadow-2xl border-4 border-white/5"
              />
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-primary to-secondary text-white rounded-[2rem] flex items-center justify-center text-4xl font-black shadow-2xl">
                {user?.name?.charAt(0)}
              </div>
            )}
            <div className="absolute -bottom-2 -right-2 bg-accent border-4 border-[#0f172a] w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg">
              <CheckCircle2 size={16} />
            </div>
          </div>

          <div className="text-center md:text-left flex-1 space-y-4">
            <div>
              <h2 className="text-3xl font-black text-white tracking-tight">
                {user?.name}
              </h2>
              <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-3">
                <span className="px-3 py-1 bg-white/5 text-[9px] font-black text-slate-400 rounded-lg border border-white/5 uppercase tracking-widest flex items-center gap-2">
                  <Mail size={12} />
                  {user?.email}
                </span>
                {user?.is_root === 1 && (
                  <span className="px-3 py-1 bg-danger/10 text-[9px] font-black text-danger rounded-lg border border-danger/20 uppercase tracking-widest flex items-center gap-2">
                    <Shield size={12} />
                    Administrador
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <button
              onClick={logout}
              className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all duration-300 font-black text-[10px] uppercase tracking-[0.2em]"
            >
              <LogOut size={16} />
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* Background Accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] -z-10 group-hover:bg-primary/10 transition-all duration-700" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Google Calendar Section */}
        <section className="glass-card p-8 flex flex-col group">
          <div className="mb-8">
            <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6 border border-primary/20 transition-transform group-hover:scale-110">
              <Calendar size={28} />
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter">
              Google Calendar
            </h3>
            <p className="text-xs font-bold text-slate-500 mt-2 leading-relaxed">
              Sincroniza tus entrenamientos con eventos de tu calendario de
              Google automáticamente.
            </p>
          </div>

          <div className="flex-1 mb-8">
            {calendarError ? (
              <div className="p-6 bg-amber-50 rounded-3xl border border-dashed border-amber-200 flex flex-col items-center text-center gap-4">
                <AlertCircle className="text-amber-500" size={32} />
                <p className="text-xs font-bold text-amber-800 uppercase tracking-widest leading-relaxed">
                  {calendarError}
                </p>
                <button
                  onClick={fetchCalendars}
                  className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-600 hover:underline flex items-center gap-2"
                >
                  <RefreshCw size={12} />
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="space-y-3 relative">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-2 ml-1">
                  Calendario de Sincronización
                </p>

                {loadingCalendars ? (
                  <div className="h-14 bg-white/5 rounded-2xl animate-pulse"></div>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setIsCalendarListOpen(!isCalendarListOpen)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border ${
                        selectedCalendar
                          ? "bg-primary/10 border-primary/40 shadow-lg shadow-primary/5"
                          : "bg-white/[0.02] border-white/5 hover:border-white/10"
                      }`}
                    >
                      <span
                        className={`text-xs font-black uppercase tracking-widest ${selectedCalendar ? "text-primary" : "text-slate-400"}`}
                      >
                        {selectedCalendar
                          ? selectedCalendar.summary
                          : "Seleccionar Calendario"}
                      </span>
                      {isCalendarListOpen ? (
                        <ChevronUp size={16} className="text-slate-500" />
                      ) : (
                        <ChevronDown size={16} className="text-slate-500" />
                      )}
                    </button>

                    <AnimatePresence>
                      {isCalendarListOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-surface border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                        >
                          <div className="max-h-[200px] overflow-y-auto no-scrollbar py-2">
                            {calendars.map((cal) => (
                              <button
                                key={cal.id}
                                onClick={() => handleSetCalendar(cal.id)}
                                className={`w-full flex items-center justify-between px-6 py-3 hover:bg-white/5 transition-colors ${
                                  cal.selected
                                    ? "text-primary"
                                    : "text-slate-400"
                                }`}
                              >
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                  {cal.summary}
                                </span>
                                {cal.selected && <CheckCircle2 size={12} />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-white/5">
            <button
              onClick={handleSyncAll}
              disabled={isSyncing || !user?.has_calendar}
              className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all disabled:opacity-20"
            >
              {isSyncing ? (
                <RefreshCw className="animate-spin" size={16} />
              ) : (
                <RefreshCw size={16} />
              )}
              Sincronizar Histórico
            </button>
            {syncMessage && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[9px] text-center mt-4 text-primary font-black uppercase tracking-widest italic"
              >
                {syncMessage}
              </motion.p>
            )}
          </div>
        </section>

        {/* Fitbit Section */}
        <section className="glass-card p-8 flex flex-col group">
          <div className="mb-8">
            <div className="w-14 h-14 bg-accent/10 text-accent rounded-2xl flex items-center justify-center mb-6 border border-accent/20 transition-transform group-hover:scale-110">
              <Watch size={28} />
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter">
              Fitbit Metrics
            </h3>
            <p className="text-xs font-bold text-slate-500 mt-2 leading-relaxed">
              Importa frecuencia cardíaca, calorías y minutos de actividad
              directamente de tus dispositivos.
            </p>
          </div>

          <div className="flex-1 flex flex-col justify-center mb-8">
            {user?.fitbit_connected ? (
              <div className="flex flex-col items-center text-center space-y-6 p-8 bg-accent/5 rounded-[2.5rem] border border-accent/10">
                <div className="w-20 h-20 bg-accent/20 text-accent rounded-full flex items-center justify-center shadow-xl shadow-accent/10">
                  <CheckCircle2 size={40} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white uppercase tracking-tight">
                    Servicio Conectado
                  </h4>
                  <p className="text-[10px] font-black text-accent uppercase tracking-widest mt-1">
                    Sincronización biométrica activa
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center p-10 bg-white/[0.01] rounded-[2.5rem] border border-dashed border-white/5">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-[0.2em] italic">
                  No hay dispositivos conectados
                </p>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-white/5">
            {!user?.fitbit_connected ? (
              <button
                onClick={handleConnectFitbit}
                className="w-full flex items-center justify-center gap-3 bg-accent text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-accent/90 transition-all shadow-xl shadow-accent/10"
              >
                Vincular Fitbit
                <ExternalLink size={16} />
              </button>
            ) : (
              <button
                onClick={handleDisconnectFitbit}
                className="w-full flex items-center justify-center gap-3 bg-danger/10 text-danger border border-danger/20 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-danger hover:text-white transition-all"
              >
                <Trash2 size={16} />
                Desvincular Dispositivo
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Settings;
