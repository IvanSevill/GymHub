import React, { useState } from "react";
import { DatabaseZap, Trash2, RefreshCw, CalendarSync } from "lucide-react";
import { workoutService } from "../../services/workout";
import { useToast } from "../../context/ToastContext";

const DataResetPanel: React.FC = () => {
  const { addToast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isReformatting, setIsReformatting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await workoutService.resetAll();
      setShowConfirm(false);
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

  const handleReformatAll = async () => {
    setIsReformatting(true);
    try {
      const result = await workoutService.reformatAll();
      addToast(
        `Calendario actualizado: ${result.updated} eventos reformateados${result.failed > 0 ? `, ${result.failed} fallidos` : ""}`,
        result.failed > 0 ? "error" : "success",
      );
    } catch {
      addToast("Error al reformatear el calendario", "error");
    } finally {
      setIsReformatting(false);
    }
  };

  const isBusy = isResetting || isReformatting;

  return (
    <div className="space-y-3">
      {/* Reformat calendar */}
      <div className="p-3 bg-white/[0.02] rounded-xl border border-white/[0.06] space-y-2.5">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Reformatear Google Calendar
          </p>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            Aplica migraciones de BD y reescribe la descripción de todos los
            eventos del calendario con el formato actual.
          </p>
        </div>
        <button
          onClick={handleReformatAll}
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary border border-primary/20 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-primary hover:text-white transition-all disabled:opacity-40"
        >
          {isReformatting ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <CalendarSync size={13} />
          )}
          {isReformatting ? "Reformateando..." : "Reformatear calendario"}
        </button>
      </div>

      {/* Reset all */}
      <div className="p-3 bg-danger/5 rounded-xl border border-danger/20 space-y-2.5">
        <div>
          <p className="text-[10px] font-black text-danger/80 uppercase tracking-widest mb-1">
            Limpiar base de datos
          </p>
          <p className="text-[10px] font-bold text-danger/60 leading-relaxed">
            Borra <strong className="text-danger">todos</strong> los
            entrenamientos, series, ejercicios, grupos musculares y datos de
            Fitbit. Tu cuenta y la conexión con Google Calendar se conservan.
          </p>
        </div>

        {showConfirm ? (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-danger text-center uppercase tracking-wider">
              ¿Confirmar? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isBusy}
                className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleReset}
                disabled={isBusy}
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
            onClick={() => setShowConfirm(true)}
            disabled={isBusy}
            className="w-full flex items-center justify-center gap-2 bg-danger/10 text-danger border border-danger/20 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-danger hover:text-white transition-all disabled:opacity-40"
          >
            <DatabaseZap size={13} />
            Limpiar base de datos
          </button>
        )}
      </div>
    </div>
  );
};

export default DataResetPanel;
