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

const HEALTH_PERIODS = PERIOD_OPTIONS as unknown as {
  value: string;
  label: string;
}[];

function fmtMin(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(11, 16);
}

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
            options={HEALTH_PERIODS}
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
                {currentSleep.length > 0 && (
                  <section>
                    <h3 className="text-white font-black text-sm mb-3">
                      Sueño
                    </h3>
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="w-full text-sm text-white">
                        <thead>
                          <tr className="border-b border-white/10 text-left text-slate-500 text-[10px] uppercase tracking-widest">
                            <th className="px-4 py-3">Fecha</th>
                            <th className="px-4 py-3">Inicio</th>
                            <th className="px-4 py-3">Fin</th>
                            <th className="px-4 py-3">Duración</th>
                            <th className="px-4 py-3">En cama</th>
                            <th className="px-4 py-3">Eficiencia</th>
                            <th className="px-4 py-3">Profundo</th>
                            <th className="px-4 py-3">Ligero</th>
                            <th className="px-4 py-3">REM</th>
                            <th className="px-4 py-3">Despierto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentSleep.map((s) => (
                            <tr
                              key={s.id}
                              className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                            >
                              <td className="px-4 py-3 font-bold">{s.date}</td>
                              <td className="px-4 py-3 text-slate-400">
                                {fmtTime(s.start_time)}
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {fmtTime(s.end_time)}
                              </td>
                              <td className="px-4 py-3 font-bold">
                                {fmtMin(s.duration_ms)}
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {s.time_in_bed}m
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`font-black ${
                                    s.efficiency >= 85
                                      ? "text-green-400"
                                      : s.efficiency >= 70
                                        ? "text-yellow-400"
                                        : "text-red-400"
                                  }`}
                                >
                                  {s.efficiency}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-blue-400 font-bold">
                                {s.minutes_deep}m
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {s.minutes_light}m
                              </td>
                              <td className="px-4 py-3 text-purple-400 font-bold">
                                {s.minutes_rem}m
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {s.minutes_wake}m
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {currentDaily.length > 0 && (
                  <section>
                    <h3 className="text-white font-black text-sm mb-3">
                      Actividad diaria
                    </h3>
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="w-full text-sm text-white">
                        <thead>
                          <tr className="border-b border-white/10 text-left text-slate-500 text-[10px] uppercase tracking-widest">
                            <th className="px-4 py-3">Fecha</th>
                            <th className="px-4 py-3">Pasos</th>
                            <th className="px-4 py-3">Pisos</th>
                            <th className="px-4 py-3">FC reposo</th>
                            <th className="px-4 py-3">Calorías</th>
                            <th className="px-4 py-3">Distancia</th>
                            <th className="px-4 py-3">Sedentario</th>
                            <th className="px-4 py-3">Ligero</th>
                            <th className="px-4 py-3">Moderado</th>
                            <th className="px-4 py-3">Intenso</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentDaily.map((d) => (
                            <tr
                              key={d.id}
                              className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                            >
                              <td className="px-4 py-3 font-bold">{d.date}</td>
                              <td className="px-4 py-3 font-black">
                                {d.steps.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {d.floors}
                              </td>
                              <td className="px-4 py-3">
                                {d.resting_heart_rate > 0 ? (
                                  <span className="text-red-400 font-bold">
                                    {d.resting_heart_rate} bpm
                                  </span>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-orange-400">
                                {d.calories_out > 0
                                  ? `${d.calories_out.toLocaleString()} kcal`
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {d.distance_km > 0
                                  ? `${d.distance_km.toFixed(2)} km`
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {d.minutes_sedentary}m
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {d.minutes_lightly_active}m
                              </td>
                              <td className="px-4 py-3 text-yellow-400">
                                {d.minutes_fairly_active}m
                              </td>
                              <td className="px-4 py-3 text-green-400 font-bold">
                                {d.minutes_very_active}m
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
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
