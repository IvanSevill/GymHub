import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import PeriodSelector from "../components/ui/PeriodSelector";
import { PERIOD_OPTIONS } from "../constants/periods";
import HealthKpiCards from "../components/health/HealthKpiCards";
import ActivityCharts from "../components/health/ActivityCharts";
import SleepCharts from "../components/health/SleepCharts";
import SleepTable from "../components/health/SleepTable";
import ActivityTable from "../components/health/ActivityTable";
import WeightSection from "../components/health/WeightSection";
import { useFitbitHealthData } from "../components/health/hooks/useFitbitHealthData";
import NotConnectedState from "../components/health/components/NotConnectedState";
import SyncStatusDisplay from "../components/health/components/SyncStatusDisplay";
import { useToast } from "../context/ToastContext";

const FitbitHealth: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [manualSyncing, setManualSyncing] = useState(false);

  const {
    days,
    setDays,
    allSleep,
    allDaily,
    syncStatus,
    loading,
    autoSyncing,
    tablesOpen,
    setTablesOpen,
    syncData,
  } = useFitbitHealthData(!!user?.fitbit_connected);

  const handleManualSync = async () => {
    setManualSyncing(true);
    try {
      await syncData();
      addToast("Datos sincronizados correctamente", "success");
    } catch {
      addToast("Error al sincronizar datos de Fitbit", "error");
    } finally {
      setManualSyncing(false);
    }
  };

  // Split into current and previous periods for KPI comparison
  const { currentSleep, prevSleep, currentDaily, prevDaily } = useMemo(() => {
    const d = Number(days);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - d);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return {
      currentSleep: allSleep.filter((s) => s.date >= cutoffStr),
      prevSleep: allSleep.filter((s) => s.date < cutoffStr),
      currentDaily: allDaily.filter((dh) => dh.date >= cutoffStr),
      prevDaily: allDaily.filter((dh) => dh.date < cutoffStr),
    };
  }, [allSleep, allDaily, days]);

  if (!user?.fitbit_connected) {
    return <NotConnectedState />;
  }

  const hasData = currentSleep.length > 0 || currentDaily.length > 0;

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight">
            Salud
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">
            Sueño · Actividad · Frecuencia cardíaca
          </p>
          <SyncStatusDisplay
            autoSyncing={autoSyncing}
            syncStatus={syncStatus}
          />
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector
            options={PERIOD_OPTIONS}
            value={days}
            onChange={setDays}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="glass-card h-16 animate-pulse rounded-2xl"
            />
          ))}
        </div>
      ) : !hasData ? (
        <div className="glass-card p-10 text-center">
          <p className="text-white font-black text-lg mb-2">
            Sin datos en este período
          </p>
          <p className="text-slate-500 text-sm mb-6">
            {!syncStatus?.has_data
              ? "Importa tu historial completo de Fitbit"
              : "Prueba a ampliar el período de tiempo."}
          </p>
          {!syncStatus?.has_data && (
            <button
              onClick={handleManualSync}
              disabled={manualSyncing || autoSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-colors"
            >
              <RefreshCw
                size={16}
                className={manualSyncing ? "animate-spin" : ""}
              />
              {manualSyncing ? "Sincronizando…" : "Sincronizar ahora"}
            </button>
          )}
        </div>
      ) : (
        <>
          <HealthKpiCards
            currentDaily={currentDaily}
            prevDaily={prevDaily}
            currentSleep={currentSleep}
            prevSleep={prevSleep}
          />

          <ActivityCharts data={currentDaily} />

          <SleepCharts data={currentSleep} />

          <WeightSection />

          {/* Collapsible raw data tables */}
          <div className="border border-white/10 rounded-2xl overflow-hidden">
            <button
              onClick={() => setTablesOpen((o) => !o)}
              className="w-full flex items-center justify-between px-6 py-4 text-slate-400 hover:text-white hover:bg-white/[0.02] transition-colors"
            >
              <span className="text-sm font-bold">
                Ver datos detallados ({currentSleep.length} noches ·{" "}
                {currentDaily.length} días)
              </span>
              {tablesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {tablesOpen && (
              <div className="border-t border-white/10 p-4 space-y-8">
                {currentSleep.length > 0 && <SleepTable data={currentSleep} />}
                {currentDaily.length > 0 && (
                  <ActivityTable data={currentDaily} />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FitbitHealth;
