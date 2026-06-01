import React from "react";
import type { SyncStatus } from "../../../services/fitbit";

interface Props {
  autoSyncing: boolean;
  syncStatus: SyncStatus | null;
}

const SyncStatusDisplay: React.FC<Props> = ({ autoSyncing, syncStatus }) => {
  if (!syncStatus) return null;

  return (
    <p className="text-[10px] text-slate-600 mt-1">
      {autoSyncing ? (
        <span className="text-primary/60 animate-pulse">Actualizando…</span>
      ) : syncStatus.has_data ? (
        `Último sueño: ${syncStatus.last_sleep_date ?? "—"} · Última actividad: ${syncStatus.last_daily_date ?? "—"}`
      ) : (
        "Sin datos — pulsa Sincronizar para importar el historial completo"
      )}
    </p>
  );
};

export default SyncStatusDisplay;
