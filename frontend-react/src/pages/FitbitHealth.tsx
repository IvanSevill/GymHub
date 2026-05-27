import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fitbitService, SleepLog, DailyHealth } from "../services/fitbit";
import { useToast } from "../context/ToastContext";

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

  const [sleep, setSleep] = useState<SleepLog[]>([]);
  const [daily, setDaily] = useState<DailyHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [days, setDays] = useState(30);

  const load = async (d: number) => {
    if (!user?.fitbit_connected) return;
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        fitbitService.getSleep(d),
        fitbitService.getDaily(d),
      ]);
      setSleep(s);
      setDaily(h);
    } catch {
      addToast("Error al cargar datos Fitbit", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(days);
  }, [days, user?.fitbit_connected]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fitbitService.sync(days);
      addToast(
        `Sincronizado: ${res.sleep_synced} noches · ${res.days_synced} días`,
        "success",
      );
      await load(days);
    } catch {
      addToast("Error al sincronizar Fitbit", "error");
    } finally {
      setSyncing(false);
    }
  };

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

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight">
            Salud
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">
            Sueño · Actividad diaria · Frecuencia cardíaca
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2 outline-none"
          >
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
          </select>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-primary text-white font-bold rounded-xl text-sm hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Cargando…</p>
      ) : (
        <>
          {/* Sleep section */}
          <section>
            <h3 className="text-white font-black text-lg mb-3">
              Sueño ({sleep.length} registros)
            </h3>
            {sleep.length === 0 ? (
              <p className="text-slate-500 text-sm">
                Sin datos. Pulsa "Sincronizar" para importar.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-sm text-white">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-slate-500 text-[10px] uppercase tracking-widest">
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Hora inicio</th>
                      <th className="px-4 py-3">Hora fin</th>
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
                    {sleep.map((s) => (
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
                        <td className="px-4 py-3">{fmtMin(s.duration_ms)}</td>
                        <td className="px-4 py-3 text-slate-400">
                          {s.time_in_bed}m
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-black ${s.efficiency >= 85 ? "text-green-400" : s.efficiency >= 70 ? "text-yellow-400" : "text-red-400"}`}
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
            )}
          </section>

          {/* Daily activity section */}
          <section>
            <h3 className="text-white font-black text-lg mb-3">
              Actividad diaria ({daily.length} registros)
            </h3>
            {daily.length === 0 ? (
              <p className="text-slate-500 text-sm">
                Sin datos. Pulsa "Sincronizar" para importar.
              </p>
            ) : (
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
                    {daily.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-3 font-bold">{d.date}</td>
                        <td className="px-4 py-3 font-black text-white">
                          {d.steps.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{d.floors}</td>
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
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default FitbitHealth;
