import React, { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { fitbitService, WeightLogEntry } from "../../services/fitbit";
import { useToast } from "../../context/ToastContext";
import ChartCard from "./components/ChartCard";
import { CHART_TOOLTIP, fmtDate, xTickInterval } from "./chartUtils";
import PeriodSelector from "../ui/PeriodSelector";
import { GLOBAL_PERIODS } from "../../constants/periods";

const today = () => new Date().toISOString().slice(0, 10);

type State = "loading" | "success" | "empty" | "error";

const WeightSection: React.FC = () => {
  const { addToast } = useToast();

  const [days, setDays] = useState("90");
  const [logs, setLogs] = useState<WeightLogEntry[]>([]);
  const [state, setState] = useState<State>("loading");

  const [formOpen, setFormOpen] = useState(false);
  const [dateInput, setDateInput] = useState(today());
  const [weightInput, setWeightInput] = useState("");
  const [fatInput, setFatInput] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchLogs = useCallback(async () => {
    setState("loading");
    try {
      const data = await fitbitService.getWeightLogs(Number(days));
      setLogs(data);
      setState(data.length === 0 ? "empty" : "success");
    } catch {
      setState("error");
    }
  }, [days]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSave = async () => {
    const kg = parseFloat(weightInput);
    if (isNaN(kg) || kg <= 0 || kg > 500) {
      addToast("Peso inválido", "error");
      return;
    }
    const fat = fatInput ? parseFloat(fatInput) : undefined;
    if (fat !== undefined && (fat < 1 || fat > 70)) {
      addToast("% grasa inválido (1–70)", "error");
      return;
    }
    setSaving(true);
    try {
      await fitbitService.logWeight({
        date: dateInput,
        weight_kg: kg,
        body_fat_pct: fat,
      });
      await fetchLogs();
      setFormOpen(false);
      setWeightInput("");
      setFatInput("");
      addToast("Peso guardado", "success");
    } catch {
      addToast("Error al guardar el peso", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fitbitService.deleteWeightLog(id);
      setLogs((prev) => {
        const next = prev.filter((l) => l.id !== id);
        if (next.length === 0) setState("empty");
        return next;
      });
      addToast("Entrada eliminada", "success");
    } catch {
      addToast("Error al eliminar", "error");
    }
  };

  // KPI deltas
  const latest = logs.at(-1);
  const prev = logs.at(-2);
  const weightDelta = latest && prev ? latest.weight_kg - prev.weight_kg : null;
  const fatDelta =
    latest?.body_fat_pct != null && prev?.body_fat_pct != null
      ? latest.body_fat_pct - prev.body_fat_pct
      : null;

  const chartData = logs.map((l) => ({
    date: fmtDate(l.date),
    weight: l.weight_kg,
    fat: l.body_fat_pct ?? undefined,
  }));
  const xInterval = xTickInterval(chartData.length);
  const hasFat = logs.some((l) => l.body_fat_pct != null);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-4"
    >
      {/* Section header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-black text-white tracking-tight">
              Peso corporal
            </h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-0.5">
              Registro manual · últimos {days} días
            </p>
          </div>
          <button
            onClick={() => setFormOpen((v) => !v)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-[10px] font-black uppercase tracking-wider hover:bg-primary hover:text-white transition-all"
          >
            <Plus size={12} />
            Añadir
          </button>
        </div>
        <div className="overflow-x-auto scrollbar-none">
          <PeriodSelector
            options={GLOBAL_PERIODS}
            value={days}
            onChange={setDays}
          />
        </div>
      </div>

      {/* Entry form */}
      {formOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="glass-card p-4 overflow-hidden"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                Fecha
              </label>
              <input
                type="date"
                value={dateInput}
                max={today()}
                onChange={(e) => setDateInput(e.target.value)}
                className="input-field text-xs py-2 px-3"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                Peso (kg)
              </label>
              <input
                type="number"
                step="0.1"
                min={1}
                max={500}
                placeholder="70.5"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="input-field text-xs py-2 px-3"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                % Grasa (opcional)
              </label>
              <input
                type="number"
                step="0.1"
                min={1}
                max={70}
                placeholder="18.0"
                value={fatInput}
                onChange={(e) => setFatInput(e.target.value)}
                className="input-field text-xs py-2 px-3"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <button
              onClick={() => setFormOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-300 px-3 py-2"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !weightInput}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary/90 transition-all disabled:opacity-40"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Guardar
            </button>
          </div>
        </motion.div>
      )}

      {/* States */}
      {state === "loading" && (
        <div className="glass-card h-48 animate-pulse rounded-2xl" />
      )}

      {state === "error" && (
        <div className="glass-card p-8 text-center">
          <p className="text-slate-400 text-sm">
            Error al cargar los registros de peso.
          </p>
        </div>
      )}

      {state === "empty" && (
        <div className="glass-card p-10 text-center">
          <p className="text-white font-black text-lg mb-2">
            Sin registros aún
          </p>
          <p className="text-slate-500 text-sm">
            Añade tu primer peso con el botón de arriba.
          </p>
        </div>
      )}

      {state === "success" && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4">
            <KpiCard
              label="Peso actual"
              value={latest?.weight_kg != null ? `${latest.weight_kg} kg` : "—"}
              delta={weightDelta}
              unit="kg"
              color="#2dd4bf"
            />
            <KpiCard
              label="Grasa corporal"
              value={
                latest?.body_fat_pct != null ? `${latest.body_fat_pct}%` : "—"
              }
              delta={fatDelta}
              unit="%"
              color="#a78bfa"
            />
          </div>

          {/* Chart */}
          <ChartCard delay={0.05}>
            <h3 className="font-black text-white text-sm tracking-tight mb-0.5">
              Evolución del peso
            </h3>
            <p className="text-[10px] text-slate-500 mb-5">
              {hasFat ? "Peso (kg) · % grasa corporal" : "Peso en kilogramos"}
            </p>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                      <stop
                        offset="95%"
                        stopColor="#2dd4bf"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                    {hasFat && (
                      <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#a78bfa"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="95%"
                          stopColor="#a78bfa"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    )}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.04)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#475569", fontSize: 10 }}
                    interval={xInterval}
                  />
                  <YAxis
                    yAxisId="weight"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#475569", fontSize: 10 }}
                    width={36}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  {hasFat && (
                    <YAxis
                      yAxisId="fat"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#475569", fontSize: 10 }}
                      width={28}
                      domain={["auto", "auto"]}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                  )}
                  <Tooltip
                    {...CHART_TOOLTIP}
                    cursor={{
                      stroke: "rgba(255,255,255,0.06)",
                      strokeWidth: 1,
                    }}
                    formatter={(v, name) =>
                      name === "fat"
                        ? [`${v}%`, "% Grasa"]
                        : [`${v} kg`, "Peso"]
                    }
                  />
                  <Area
                    yAxisId="weight"
                    type="monotone"
                    dataKey="weight"
                    stroke="#2dd4bf"
                    strokeWidth={2}
                    fill="url(#weightGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#2dd4bf" }}
                  />
                  {hasFat && (
                    <Area
                      yAxisId="fat"
                      type="monotone"
                      dataKey="fat"
                      stroke="#a78bfa"
                      strokeWidth={1.5}
                      fill="url(#fatGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#a78bfa" }}
                      connectNulls
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Log table — collapsible */}
          <LogTable logs={logs} onDelete={handleDelete} />
        </>
      )}
    </motion.section>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  delta: number | null;
  unit: string;
  color: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  delta,
  unit,
  color,
}) => {
  const sign = delta != null ? (delta > 0 ? "+" : "") : "";
  const deltaColor =
    delta == null
      ? "text-slate-500"
      : delta === 0
        ? "text-slate-400"
        : delta < 0
          ? "text-emerald-400"
          : "text-rose-400";

  return (
    <div className="glass-card p-5 flex flex-col gap-2">
      <p
        className="text-[9px] font-black uppercase tracking-[0.25em]"
        style={{ color }}
      >
        {label}
      </p>
      <p className="text-3xl font-black text-white tracking-tight">{value}</p>
      {delta != null && (
        <p className={`text-xs font-bold ${deltaColor}`}>
          {sign}
          {delta.toFixed(1)} {unit} vs anterior
        </p>
      )}
    </div>
  );
};

interface LogTableProps {
  logs: WeightLogEntry[];
  onDelete: (id: string) => void;
}

const LogTable: React.FC<LogTableProps> = ({ logs, onDelete }) => {
  const [open, setOpen] = useState(false);
  const sorted = [...logs].reverse();

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-slate-400 hover:text-white hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-sm font-bold">Ver registros ({logs.length})</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="border-t border-white/10 divide-y divide-white/5 max-h-72 overflow-y-auto">
          {sorted.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between px-6 py-3"
            >
              <span className="text-xs text-slate-400">{l.date}</span>
              <span className="text-sm font-black text-white">
                {l.weight_kg} kg
                {l.body_fat_pct != null && (
                  <span className="ml-2 text-xs text-slate-400 font-normal">
                    {l.body_fat_pct}% grasa
                  </span>
                )}
              </span>
              <button
                onClick={() => onDelete(l.id)}
                className="text-slate-600 hover:text-red-400 transition-colors"
                aria-label="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WeightSection;
