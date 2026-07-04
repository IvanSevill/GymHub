import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  /** Headline shown to the user. */
  title?: string;
  /** Supporting explanation under the headline. */
  message?: string;
  /** Called when the user presses "Reintentar". */
  onRetry: () => void;
  /** When true, the retry button shows a spinner and is disabled. */
  retrying?: boolean;
}

/**
 * Shared error state for data-loading views. Renders a clear failure message
 * and a prominent call-to-action retry button, so a backend failure is never
 * confused with an empty result. Part of the mandatory 4-state lifecycle
 * (loading / success / empty / error).
 */
const ErrorState: React.FC<ErrorStateProps> = ({
  title = "No se pudieron cargar los datos",
  message = "Ha ocurrido un problema al conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.",
  onRetry,
  retrying = false,
}) => (
  <div className="glass-card p-10 text-center flex flex-col items-center gap-4">
    <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center">
      <AlertTriangle size={24} className="text-red-400" />
    </div>
    <div>
      <p className="text-white font-black text-lg">{title}</p>
      <p className="text-slate-500 text-sm mt-1.5 max-w-[280px] mx-auto leading-relaxed">
        {message}
      </p>
    </div>
    <button
      onClick={onRetry}
      disabled={retrying}
      className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-colors"
    >
      <RefreshCw size={16} className={retrying ? "animate-spin" : ""} />
      {retrying ? "Reintentando…" : "Reintentar"}
    </button>
  </div>
);

export default ErrorState;
