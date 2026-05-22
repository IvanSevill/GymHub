import React, { useState } from "react";
import { DatabaseZap, Trash2, RefreshCw } from "lucide-react";
import { workoutService } from "../../services/workout";
import { useToast } from "../../context/ToastContext";

const DataResetPanel: React.FC = () => {
  const { addToast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="p-3 bg-danger/5 rounded-xl border border-danger/20">
        <p className="text-[10px] font-bold text-danger/80 leading-relaxed">
          Borra <strong className="text-danger">todos</strong> los
          entrenamientos, series, ejercicios, grupos musculares y datos de
          Fitbit. Tu cuenta y la conexión con Google Calendar se conservan.
          Deberás volver a sincronizar el calendario para reimportar los datos.
        </p>
      </div>

      {showConfirm ? (
        <div className="space-y-2">
          <p className="text-[10px] font-black text-danger text-center uppercase tracking-wider">
            ¿Confirmar? Esta acción borrará todos los datos y no se puede
            deshacer.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              disabled={isResetting}
              className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={handleReset}
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
          onClick={() => setShowConfirm(true)}
          className="w-full flex items-center justify-center gap-2 bg-danger/10 text-danger border border-danger/20 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-danger hover:text-white transition-all"
        >
          <DatabaseZap size={13} />
          Limpiar base de datos
        </button>
      )}
    </div>
  );
};

export default DataResetPanel;
