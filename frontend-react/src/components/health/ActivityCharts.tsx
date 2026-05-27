import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import type { DailyHealth } from "../../services/fitbit";

interface Props {
  data: DailyHealth[];
}

const TOOLTIP = {
  contentStyle: {
    background: "#0f1729",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "14px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  labelStyle: { color: "#94a3b8", fontSize: 11 },
  itemStyle: { fontWeight: "700", fontSize: "13px" },
};

const fmtDate = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

const ActivityCharts: React.FC<Props> = ({ data }) => {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );

  const avgSteps = useMemo(
    () =>
      sorted.length
        ? sorted.reduce((s, d) => s + d.steps, 0) / sorted.length
        : 0,
    [sorted],
  );

  const stepsData = useMemo(
    () => sorted.map((d) => ({ date: fmtDate(d.date), steps: d.steps })),
    [sorted],
  );

  const activityData = useMemo(() => {
    return sorted.map((d) => {
      const total =
        d.minutes_sedentary +
        d.minutes_lightly_active +
        d.minutes_fairly_active +
        d.minutes_very_active;
      if (!total)
        return {
          date: fmtDate(d.date),
          sedentario: 0,
          ligero: 0,
          moderado: 0,
          intenso: 0,
        };
      const pct = (v: number) => Math.round((v / total) * 100);
      return {
        date: fmtDate(d.date),
        sedentario: pct(d.minutes_sedentary),
        ligero: pct(d.minutes_lightly_active),
        moderado: pct(d.minutes_fairly_active),
        intenso: pct(d.minutes_very_active),
      };
    });
  }, [sorted]);

  const composedData = useMemo(
    () =>
      sorted.map((d) => ({
        date: fmtDate(d.date),
        calorias: d.calories_out > 0 ? d.calories_out : null,
        fc: d.resting_heart_rate > 0 ? d.resting_heart_rate : null,
      })),
    [sorted],
  );

  const xInterval = Math.max(0, Math.ceil(sorted.length / 8) - 1);

  if (!sorted.length) {
    return (
      <p className="text-slate-500 text-sm py-6 text-center">
        Sin datos de actividad en el período seleccionado.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
          <Activity size={16} />
        </div>
        <h2 className="text-base font-black text-white tracking-tight">
          Actividad Física
        </h2>
        <div className="flex-1 h-px bg-white/5" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Steps AreaChart — 2/3 */}
        <motion.div
          className="glass-card p-6 lg:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <h3 className="font-black text-white text-sm tracking-tight mb-0.5">
            Pasos diarios
          </h3>
          <p className="text-[10px] text-slate-500 mb-5">
            Media del período:{" "}
            <span className="text-primary font-bold">
              {Math.round(avgSteps).toLocaleString()} pasos/día
            </span>
            {" · "}línea punteada = media
          </p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stepsData}>
                <defs>
                  <linearGradient id="stepsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
                  </linearGradient>
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
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 10 }}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                  width={32}
                />
                <Tooltip
                  {...TOOLTIP}
                  cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }}
                  formatter={(v) => [
                    `${(v as number).toLocaleString()} pasos`,
                    "Pasos",
                  ]}
                />
                <ReferenceLine
                  y={avgSteps}
                  stroke="#f97316"
                  strokeDasharray="5 4"
                  strokeOpacity={0.5}
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="steps"
                  stroke="#f97316"
                  strokeWidth={2}
                  fill="url(#stepsGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#f97316" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Activity Distribution — 1/3 */}
        <motion.div
          className="glass-card p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h3 className="font-black text-white text-sm tracking-tight mb-0.5">
            Distribución de actividad
          </h3>
          <p className="text-[10px] text-slate-500 mb-5">
            % del tiempo registrado por intensidad
          </p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData} barCategoryGap="8%">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 9 }}
                  interval={xInterval}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 9 }}
                  tickFormatter={(v: number) => `${v}%`}
                  domain={[0, 100]}
                  width={30}
                />
                <Tooltip
                  {...TOOLTIP}
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  formatter={(v, name) => [
                    `${(v as number).toFixed(1)}%`,
                    String(name).charAt(0).toUpperCase() +
                      String(name).slice(1),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: "9px", color: "#94a3b8" }} />
                <Bar
                  dataKey="sedentario"
                  name="Sedentario"
                  stackId="a"
                  fill="#334155"
                  fillOpacity={0.85}
                  maxBarSize={36}
                />
                <Bar
                  dataKey="ligero"
                  name="Ligero"
                  stackId="a"
                  fill="#f59e0b"
                  fillOpacity={0.85}
                  maxBarSize={36}
                />
                <Bar
                  dataKey="moderado"
                  name="Moderado"
                  stackId="a"
                  fill="#f97316"
                  fillOpacity={0.85}
                  maxBarSize={36}
                />
                <Bar
                  dataKey="intenso"
                  name="Intenso"
                  stackId="a"
                  fill="#ef4444"
                  fillOpacity={0.9}
                  maxBarSize={36}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Calories + Resting HR ComposedChart — full width */}
      <motion.div
        className="glass-card p-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h3 className="font-black text-white text-sm tracking-tight mb-0.5">
          Calorías quemadas y FC en reposo
        </h3>
        <p className="text-[10px] text-slate-500 mb-5">
          Una FC en reposo más baja a lo largo del tiempo indica mejor forma
          cardiovascular
        </p>
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={composedData}>
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
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#475569", fontSize: 10 }}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
                width={36}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#475569", fontSize: 10 }}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `${v}`}
                width={30}
              />
              <Tooltip
                {...TOOLTIP}
                cursor={{ fill: "rgba(255,255,255,0.02)" }}
                formatter={(v, name) => {
                  const n = v as number;
                  if (name === "Calorías")
                    return [`${n.toLocaleString()} kcal`, name];
                  return [`${n} bpm`, name];
                }}
              />
              <Legend
                wrapperStyle={{
                  fontSize: "10px",
                  color: "#94a3b8",
                  paddingTop: "8px",
                }}
              />
              <Bar
                yAxisId="left"
                dataKey="calorias"
                name="Calorías"
                fill="#f59e0b"
                fillOpacity={0.7}
                maxBarSize={40}
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="fc"
                name="FC reposo"
                stroke="#ef4444"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: "#ef4444" }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
};

export default ActivityCharts;
