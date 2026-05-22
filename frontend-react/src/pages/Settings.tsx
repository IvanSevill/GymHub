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
  DatabaseZap,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import StandardizeExercises from "./StandardizeExercises";

const Settings: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const { addToast } = useToast();

  const [calendars, setCalendars] = useState<any[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isCalendarListOpen, setIsCalendarListOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const fetchCalendars = async () => {
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
      addToast("Calendario configurado correctamente", "success");
    } catch {
      addToast("Error al configurar el calendario", "error");
    }
  };

  const handleConnectFitbit = async () => {
    try {
      const { url } = await authService.getFitbitAuthUrl();
      window.location.href = url;
    } catch {
      addToast("Error al conectar Fitbit", "error");
    }
  };

  const handleDisconnectFitbit = async () => {
    try {
      await authService.disconnectFitbit();
      await refreshUser();
      setShowDisconnectConfirm(false);
      addToast("Fitbit desconectado correctamente", "success");
    } catch {
      addToast("Error al desconectar Fitbit", "error");
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const { message } = await workoutService.syncAllFromCalendar();
      addToast(message || "Sincronización completada", "success");
      await refreshUser();
    } catch (error: any) {
      addToast(
        error.response?.data?.detail || "Error en la sincronización.",
        "error",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetAll = async () => {
    setIsResetting(true);
    try {
      await workoutService.resetAll();
      setShowResetConfirm(false);
      addToast(
        "Base de datos limpiada. Sincroniza el calendario para reimportar.",
        "success",
      );
    } catch {
      addToast("Error al limpiar la base de datos", "error");
    } finally {
      setIsResetting(false);
    }
  };

  const selectedCalendar = calendars.find((c) => c.selected);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight">
          Ajustes
        </h1>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">
          Configuración de cuenta e integraciones
        </p>
      </div>

      {/* Profile */}
      <section className="glass-card p-8 relative overflow-hidden group">
        <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
          <div className="relative">
            {user?.picture_url ? (
              <img
                src={user.picture_url}
                alt={user?.name}
                className="w-20 h-20 rounded-[1.5rem] shadow-2xl border-4 border-white/5"
              />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-secondary text-white rounded-[1.5rem] flex items-center justify-center text-3xl font-black shadow-2xl">
                {user?.name?.charAt(0)}
              </div>
            )}
            <div className="absolute -bottom-2 -right-2 bg-accent border-4 border-[#0f172a] w-7 h-7 rounded-full flex items-center justify-center text-white shadow-lg">
              <CheckCircle2 size={14} />
            </div>
          </div>

          <div className="text-center md:text-left flex-1 space-y-3">
            <h2 className="text-2xl font-black text-white tracking-tight">
              {user?.name}
            </h2>
            <div className="flex flex-wrap justify-center md:justify-start gap-2">
              <span className="px-3 py-1 bg-white/5 text-[9px] font-black text-slate-400 rounded-lg border border-white/5 uppercase tracking-widest flex items-center gap-2">
                <Mail size={11} />
                {user?.email}
              </span>
              {user?.is_root === 1 && (
                <span className="px-3 py-1 bg-danger/10 text-[9px] font-black text-danger rounded-lg border border-danger/20 uppercase tracking-widest flex items-center gap-2">
                  <Shield size={11} />
                  Administrador
                </span>
              )}
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all font-black text-[10px] uppercase tracking-[0.2em] shrink-0"
          >
            <LogOut size={14} />
            Cerrar Sesión
          </button>
        </div>
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-[60px] -z-10 group-hover:bg-primary/10 transition-all duration-700" />
      </section>

      {/* Integrations — compact row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Google Calendar */}
        <section className="glass-card p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center border border-primary/20 shrink-0">
              <Calendar size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white uppercase tracking-tighter">
                Google Calendar
              </h3>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                Sincroniza entrenamientos con tu calendario
              </p>
            </div>
          </div>

          <div className="flex-1">
            {calendarError ? (
              <div className="p-3 bg-amber-500/10 rounded-xl border border-dashed border-amber-500/20 flex items-center gap-3">
                <AlertCircle className="text-amber-400 shrink-0" size={16} />
                <p className="text-[10px] font-bold text-amber-400 leading-snug">
                  {calendarError}
                </p>
                <button
                  onClick={fetchCalendars}
                  className="ml-auto text-amber-400 hover:text-amber-300 transition-colors shrink-0"
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1.5">
                  Calendario activo
                </p>
                {loadingCalendars ? (
                  <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setIsCalendarListOpen(!isCalendarListOpen)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all border text-xs font-black uppercase tracking-widest ${
                        selectedCalendar
                          ? "bg-primary/10 border-primary/40 text-primary"
                          : "bg-white/[0.02] border-white/5 hover:border-white/10 text-slate-400"
                      }`}
                    >
                      <span>
                        {selectedCalendar
                          ? selectedCalendar.summary
                          : "Seleccionar Calendario"}
                      </span>
                      {isCalendarListOpen ? (
                        <ChevronUp size={14} className="text-slate-500" />
                      ) : (
                        <ChevronDown size={14} className="text-slate-500" />
                      )}
                    </button>

                    <AnimatePresence>
                      {isCalendarListOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                        >
                          <div className="max-h-[180px] overflow-y-auto py-1">
                            {calendars.map((cal) => (
                              <button
                                key={cal.id}
                                onClick={() => handleSetCalendar(cal.id)}
                                className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors ${
                                  cal.selected
                                    ? "text-primary"
                                    : "text-slate-400"
                                }`}
                              >
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                  {cal.summary}
                                </span>
                                {cal.selected && <CheckCircle2 size={11} />}
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

          <button
            onClick={handleSyncAll}
            disabled={isSyncing || !user?.has_calendar}
            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all disabled:opacity-20"
          >
            <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
            Sincronizar Histórico
          </button>
        </section>

        {/* Fitbit */}
        <section className="glass-card p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent/10 text-accent rounded-xl flex items-center justify-center border border-accent/20 shrink-0">
              <Watch size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white uppercase tracking-tighter">
                Fitbit Metrics
              </h3>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                FC, calorías y minutos de actividad
              </p>
            </div>
            {user?.fitbit_connected && (
              <span className="ml-auto flex items-center gap-1.5 text-[9px] font-black text-accent uppercase tracking-widest shrink-0">
                <CheckCircle2 size={11} />
                Activo
              </span>
            )}
          </div>

          <div className="flex-1 flex items-center">
            {user?.fitbit_connected ? (
              <div className="w-full p-3 bg-accent/5 rounded-xl border border-accent/10 flex items-center gap-3">
                <div className="w-8 h-8 bg-accent/20 text-accent rounded-lg flex items-center justify-center shrink-0">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <p className="text-xs font-black text-white">
                    Servicio Conectado
                  </p>
                  <p className="text-[9px] text-accent font-bold uppercase tracking-widest">
                    Sincronización biométrica activa
                  </p>
                </div>
              </div>
            ) : (
              <div className="w-full py-4 text-center bg-white/[0.01] rounded-xl border border-dashed border-white/5">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em]">
                  Sin dispositivos conectados
                </p>
              </div>
            )}
          </div>

          {!user?.fitbit_connected ? (
            <button
              onClick={handleConnectFitbit}
              className="w-full flex items-center justify-center gap-2 bg-accent text-white py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-accent/90 transition-all"
            >
              Vincular Fitbit
              <ExternalLink size={13} />
            </button>
          ) : showDisconnectConfirm ? (
            <div className="space-y-2">
              <p className="text-[10px] font-black text-danger text-center uppercase tracking-wider">
                ¿Desconectar? Se eliminarán los datos biométricos.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDisconnectFitbit}
                  className="flex-1 py-2 rounded-xl bg-danger text-white font-black text-[10px] uppercase tracking-widest hover:bg-danger/90 transition-all"
                >
                  Confirmar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              className="w-full flex items-center justify-center gap-2 bg-danger/10 text-danger border border-danger/20 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-danger hover:text-white transition-all"
            >
              <Trash2 size={13} />
              Desvincular Dispositivo
            </button>
          )}
        </section>
      </div>

      {/* Data management — root only */}
      {user?.is_root === 1 && (
        <section className="glass-card p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-danger/10 text-danger rounded-xl flex items-center justify-center border border-danger/20 shrink-0">
              <DatabaseZap size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-tighter">
                Limpiar base de datos
              </h3>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                Elimina todos los datos y reinicia desde cero
              </p>
            </div>
          </div>

          <div className="p-3 bg-danger/5 rounded-xl border border-danger/20">
            <p className="text-[10px] font-bold text-danger/80 leading-relaxed">
              Borra <strong className="text-danger">todos</strong> los
              entrenamientos, series, ejercicios, grupos musculares y datos de
              Fitbit. Tu cuenta y la conexión con Google Calendar se conservan.
              Deberás volver a sincronizar el calendario para reimportar los
              datos.
            </p>
          </div>

          {showResetConfirm ? (
            <div className="space-y-2">
              <p className="text-[10px] font-black text-danger text-center uppercase tracking-wider">
                ¿Confirmar? Esta acción borrará todos los datos y no se puede
                deshacer.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={isResetting}
                  className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleResetAll}
                  disabled={isResetting}
                  className="flex-1 py-2 rounded-xl bg-danger text-white font-black text-[10px] uppercase tracking-widest hover:bg-danger/90 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {isResetting ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  {isResetting ? "Limpiando..." : "Confirmar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full flex items-center justify-center gap-2 bg-danger/10 text-danger border border-danger/20 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-danger hover:text-white transition-all"
            >
              <DatabaseZap size={13} />
              Limpiar base de datos
            </button>
          )}
        </section>
      )}

      {/* Standardize Exercises — root only */}
      {user?.is_root === 1 && (
        <section>
          <StandardizeExercises />
        </section>
      )}
    </div>
  );
};

export default Settings;
