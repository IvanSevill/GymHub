import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { motion } from "framer-motion";
import { Moon } from "lucide-react";
import type { SleepLog } from "../../services/fitbit";
import { CHART_TOOLTIP, fmtDate, xTickInterval } from "./chartUtils";

interface Props {
  data: SleepLog[];
}

const HISTOGRAM_COLORS = ["#ef4444", "#f59e0b", "#f97316", "#10b981"];

const SleepCharts: React.FC<Props> = ({ data }) => {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );

  const trendData = useMemo(
    () =>
      sorted.map((s) => ({
        date: fmtDate(s.date),
        horas: parseFloat((s.duration_ms / 3_600_000).toFixed(2)),
        eficiencia: s.efficiency,
      })),
    [sorted],
  );

  const stagesData = useMemo(
    () =>
      sorted.map((s) => ({
        date: fmtDate(s.date),
        profundo: s.minutes_deep,
        ligero: s.minutes_light,
        rem: s.minutes_rem,
        despierto: s.minutes_wake,
      })),
    [sorted],
  );

  const histogram = useMemo(() => {
    const buckets = [
      { label: "< 70%", count: 0, fill: HISTOGRAM_COLORS[0] },
      { label: "70–79%", count: 0, fill: HISTOGRAM_COLORS[1] },
      { label: "80–89%", count: 0, fill: HISTOGRAM_COLORS[2] },
      { label: "≥ 90%", count: 0, fill: HISTOGRAM_COLORS[3] },
    ];
    sorted.forEach((s) => {
      if (s.efficiency < 70) buckets[0].count++;
      else if (s.efficiency < 80) buckets[1].count++;
      else if (s.efficiency < 90) buckets[2].count++;
      else buckets[3].count++;
    });
    return buckets;
  }, [sorted]);

  const avgHours = useMemo(
    () =>
      sorted.length
        ? sorted.reduce((a, s) => a + s.duration_ms, 0) /
          sorted.length /
          3_600_000
        : 0,
    [sorted],
  );

  const avgEff = useMemo(
    () =>
      sorted.length
        ? sorted.reduce((a, s) => a + s.efficiency, 0) / sorted.length
        : 0,
    [sorted],
  );

  const xInterval = xTickInterval(sorted.length);

  if (!sorted.length) {
    return (
      <p className="text-slate-500 text-sm py-6 text-center">
        Sin datos de sueño en el período seleccionado.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 border border-blue-500/20">
          <Moon size={16} />
        </div>
        <h2 className="text-base font-black text-white tracking-tight">
          Sueño
        </h2>
        <div className="flex-1 h-px bg-white/5" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Duration + Efficiency dual-axis LineChart — 2/3 */}
        <motion.div
          className="glass-card p-6 lg:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <h3 className="font-black text-white text-sm tracking-tight mb-0.5">
            Duración y eficiencia del sueño
          </h3>
          <p className="text-[10px] text-slate-500 mb-5">
            Media:{" "}
            <span className="text-blue-400 font-bold">
              {avgHours.toFixed(1)}h
            </span>{" "}
            ·{" "}
            <span className="text-purple-400 font-bold">
              {avgEff.toFixed(1)}% eficiencia
            </span>
          </p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
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
                  yAxisId="horas"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 10 }}
                  tickFormatter={(v: number) => `${v}h`}
                  domain={["auto", "auto"]}
                  width={32}
                />
                <YAxis
                  yAxisId="efic"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 10 }}
                  tickFormatter={(v: number) => `${v}%`}
                  domain={[50, 100]}
                  width={32}
                />
                <Tooltip
                  {...CHART_TOOLTIP}
                  formatter={(v, name) => {
                    const n = v as number;
                    if (name === "Horas") return [`${n.toFixed(1)}h`, name];
                    return [`${n}%`, name];
                  }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: "10px",
                    color: "#94a3b8",
                    paddingTop: "8px",
                  }}
                />
                <Line
                  yAxisId="horas"
                  type="monotone"
                  dataKey="horas"
                  name="Horas"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "#3b82f6" }}
                />
                <Line
                  yAxisId="efic"
                  type="monotone"
                  dataKey="eficiencia"
                  name="Eficiencia"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "#a855f7" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Efficiency Histogram — 1/3 */}
        <motion.div
          className="glass-card p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h3 className="font-black text-white text-sm tracking-tight mb-0.5">
            Distribución de eficiencia
          </h3>
          <p className="text-[10px] text-slate-500 mb-5">
            ¿Qué tan consistente es tu sueño?
          </p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} barCategoryGap="20%">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 10 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 10 }}
                  allowDecimals={false}
                  width={24}
                />
                <Tooltip
                  {...CHART_TOOLTIP}
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  formatter={(v) => {
                    const n = v as number;
                    return [`${n} noche${n !== 1 ? "s" : ""}`, "Frecuencia"];
                  }}
                />
                <Bar dataKey="count" name="Noches" radius={[6, 6, 0, 0]}>
                  {histogram.map((entry, i) => (
                    <Cell
                      key={`cell-${i}`}
                      fill={entry.fill}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Sleep Stages BarChart — full width */}
      <motion.div
        className="glass-card p-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h3 className="font-black text-white text-sm tracking-tight mb-0.5">
          Composición de fases de sueño por noche
        </h3>
        <p className="text-[10px] text-slate-500 mb-5">
          REM y sueño profundo son los más restauradores — cuánto más, mejor
        </p>
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stagesData} barCategoryGap="6%">
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
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#475569", fontSize: 10 }}
                tickFormatter={(v: number) => `${v}m`}
                width={34}
              />
              <Tooltip
                {...CHART_TOOLTIP}
                cursor={{ fill: "rgba(255,255,255,0.02)" }}
                formatter={(v, name) => [
                  `${v as number} min`,
                  String(name).charAt(0).toUpperCase() + String(name).slice(1),
                ]}
              />
              <Legend
                wrapperStyle={{
                  fontSize: "10px",
                  color: "#94a3b8",
                  paddingTop: "8px",
                }}
              />
              <Bar
                dataKey="profundo"
                name="Profundo"
                stackId="s"
                fill="#1e3a5f"
                fillOpacity={0.9}
                maxBarSize={36}
              />
              <Bar
                dataKey="ligero"
                name="Ligero"
                stackId="s"
                fill="#3b82f6"
                fillOpacity={0.8}
                maxBarSize={36}
              />
              <Bar
                dataKey="rem"
                name="REM"
                stackId="s"
                fill="#a855f7"
                fillOpacity={0.85}
                maxBarSize={36}
              />
              <Bar
                dataKey="despierto"
                name="Despierto"
                stackId="s"
                fill="#334155"
                fillOpacity={0.7}
                maxBarSize={36}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
};

export default SleepCharts;
