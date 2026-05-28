import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  fitbitService,
  SleepLog,
  DailyHealth,
  SyncStatus,
} from "../services/fitbit";
import { useToast } from "../context/ToastContext";
import PeriodSelector from "../components/ui/PeriodSelector";
import { PERIOD_OPTIONS } from "../constants/periods";
import HealthKpiCards from "../components/health/HealthKpiCards";
import ActivityCharts from "../components/health/ActivityCharts";
import SleepCharts from "../components/health/SleepCharts";
import SleepTable from "../components/health/SleepTable";
import ActivityTable from "../components/health/ActivityTable";

const FitbitHealth: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [days, setDays] = useState("30");
  const [allSleep, setAllSleep] = useState<SleepLog[]>([]);
  const [allDaily, setAllDaily] = useState<DailyHealth[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);

  // Distinguishes mount (first run) from period changes
  const isFirstLoad = useRef(true);

  const fetchData = async (d: number) => {
    // Double the period for KPI comparison (current vs previous); for large
    // periods (>= 365) there is no meaningful "previous" so fetch as-is.
    const extDays = d < 365 ? d * 2 : d;
    const [s, h, status] = await Promise.all([
      fitbitService.getSleep(extDays),
      fitbitService.getDaily(extDays),
      fitbitService.getSyncStatus(),
    ]);
    setAllSleep(s);
    setAllDaily(h);
    setSyncStatus(status);
    return status;
  };

  useEffect(() => {
    if (!user?.fitbit_connected) return;

    const d = Number(days);
    const firstLoad = isFirstLoad.current;
    isFirstLoad.current = false;

    const run = async () => {
      setLoading(true);
      let status;
      try {
        status = await fetchData(d);
      } catch {
        addToast("Error al cargar datos Fitbit", "error");
        setLoading(false);
        return;
      }
      setLoading(false); // show cached data immediately

      // On first page visit: incremental sync in the background.
      // _determine_sync_range ensures only the delta is fetched from Fitbit.
      if (firstLoad && status.has_data) {
        setAutoSyncing(true);
        try {
          await fitbitService.sync();
          await fetchData(d);
        } catch {
          // silent — stale data already visible
        } finally {
          setAutoSyncing(false);
        }
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, user?.fitbit_connected]);

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
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-white text-xl font-black">Fitbit no conectado</p>
        <p className="text-slate-500 text-sm">
          Conecta tu Fitbit para ver tus datos de salud.
        </p>
        <button
          onClick={() => navigate("/settings")}
          className="px-5 py-2.5 bg-primary text-white font-bold rounded-xl text-sm hover:bg-primary/80 transition-colors"
        >
          Ir a Ajustes →
        </button>
      </div>
    );
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
          {syncStatus && (
            <p className="text-[10px] text-slate-600 mt-1">
              {autoSyncing ? (
                <span className="text-primary/60 animate-pulse">
                  Actualizando…
                </span>
              ) : syncStatus.has_data ? (
                `Último sueño: ${syncStatus.last_sleep_date ?? "—"} · Última actividad: ${syncStatus.last_daily_date ?? "—"}`
              ) : (
                "Sin datos — pulsa Sincronizar para importar el historial completo"
              )}
            </p>
          )}
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
          <p className="text-slate-500 text-sm">
            {!syncStatus?.has_data
              ? "Pulsa «Sincronizar» para importar tu historial de Fitbit."
              : "Prueba a ampliar el período de tiempo."}
          </p>
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
