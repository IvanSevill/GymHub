import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { BarChart2, AlertCircle } from "lucide-react";
import PeriodSelector from "../ui/PeriodSelector";
import { PERIOD_OPTIONS } from "../../constants/periods";
import { analyticsService, ExerciseFrequency } from "../../services/analytics";
import { motion } from "framer-motion";
import { SkeletonChartArea } from "../ui/Skeleton";
import { CHART_COLORS } from "../../constants/colors";
import {
  CHART_TOOLTIP_CONFIG,
  AXIS_TICK_STYLE,
} from "../../constants/chartStyles";
import {
  aggregateByMuscle,
  aggregateByExercise,
} from "../../utils/frequencyAnalytics";

const FrequencyAnalysisCard: React.FC = () => {
  const [frequency, setFrequency] = useState<ExerciseFrequency[]>([]);
  const [frequencyDays, setFrequencyDays] = useState(30);
  const [viewType, setViewType] = useState<"muscle" | "exercise">("muscle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = (days: number) => {
    setLoading(true);
    setError(false);
    analyticsService
      .getExerciseFrequency(undefined, days)
      .then(setFrequency)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(frequencyDays);
  }, [frequencyDays]);

  const chartData =
    viewType === "muscle"
      ? aggregateByMuscle(frequency)
      : aggregateByExercise(frequency);

  const tableRows =
    viewType === "muscle"
      ? aggregateByMuscle(frequency).map(({ name, count }) => [name, count])
      : aggregateByExercise(frequency).map(({ name, count }) => [name, count]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-card p-6 md:p-10 flex flex-col"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary border border-secondary/20">
            <BarChart2 size={24} />
          </div>
          <div>
            <h3 className="font-black text-white text-lg tracking-tight">
              Análisis de Frecuencia
            </h3>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Distribución de entrenamiento
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PeriodSelector
            options={PERIOD_OPTIONS}
            value={String(frequencyDays)}
            onChange={(v) => setFrequencyDays(Number(v))}
            activeClass="bg-secondary shadow-lg shadow-secondary/20"
          />
          <PeriodSelector
            options={[
              { value: "muscle", label: "Músculo" },
              { value: "exercise", label: "Ejercicio" },
            ]}
            value={viewType}
            onChange={(v) => setViewType(v as "muscle" | "exercise")}
            activeClass="bg-secondary shadow-lg shadow-secondary/20"
          />
        </div>
      </div>

      {loading ? (
        <SkeletonChartArea height="h-[400px]" />
      ) : error ? (
        <div className="h-[400px] flex flex-col items-center justify-center gap-3 text-center border border-dashed border-red-500/20 rounded-2xl">
          <AlertCircle size={28} className="text-red-500/50" />
          <p className="text-slate-500 text-sm">
            Error al cargar la frecuencia de ejercicios.
          </p>
          <button
            onClick={() => load(frequencyDays)}
            className="text-xs text-primary hover:underline font-semibold"
          >
            Reintentar
          </button>
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-[400px] flex flex-col items-center justify-center gap-3 text-center border border-dashed border-white/[0.06] rounded-2xl">
          <BarChart2 size={28} className="text-slate-700" />
          <p className="text-slate-500 text-sm">
            Sin ejercicios registrados en este período.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="h-[400px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#ffffff05"
                  horizontal={false}
                />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  stroke={AXIS_TICK_STYLE.fill}
                  fontSize={AXIS_TICK_STYLE.fontSize}
                  fontWeight={AXIS_TICK_STYLE.fontWeight}
                  axisLine={false}
                  tickLine={false}
                  width={140}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  {...CHART_TOOLTIP_CONFIG}
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={25}>
                  {chartData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    formatter={(v: unknown) => {
                      const num = typeof v === "number" ? v : 0;
                      const total = chartData.reduce((s, d) => s + d.count, 0);
                      return total > 0
                        ? `${Math.round((num / total) * 100)}%`
                        : "";
                    }}
                    style={{
                      fill: "#64748b",
                      fontSize: 10,
                      fontWeight: "bold",
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-black/20 rounded-[2rem] border border-white/5 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                {viewType === "muscle" ? "Por Grupo Muscular" : "Por Ejercicio"}
              </h4>
              <span className="text-[10px] font-black text-primary uppercase">
                Métricas de Volumen
              </span>
            </div>
            <div className="max-h-[300px] overflow-y-auto no-scrollbar">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-[#090e1c] z-10">
                  <tr>
                    <th className="px-6 py-4 text-[9px] font-black text-slate-600 uppercase tracking-widest border-b border-white/5">
                      Ejercicio
                    </th>
                    <th className="px-6 py-4 text-[9px] font-black text-slate-600 uppercase tracking-widest text-right border-b border-white/5">
                      Sets Totales
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {tableRows
                    .filter(([name]) => name)
                    .map(([name, count], i) => (
                      <tr
                        key={i}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="px-6 py-4 flex items-center gap-3">
                          <div
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${i < 3 ? "bg-primary" : "bg-slate-700"}`}
                          />
                          <span className="text-sm font-bold text-slate-300 group-hover:text-white">
                            {name}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-black text-white">
                          {count}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default FrequencyAnalysisCard;
