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
} from "recharts";
import { BarChart2 } from "lucide-react";
import PeriodSelector from "../ui/PeriodSelector";
import { PERIOD_OPTIONS } from "../../constants/periods";
import { analyticsService, ExerciseFrequency } from "../../services/analytics";
import { motion } from "framer-motion";
import { SkeletonChartArea } from "../ui/Skeleton";

const COLORS = [
  "#f97316",
  "#a855f7",
  "#3b82f6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
];

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const FrequencyAnalysisCard: React.FC = () => {
  const [frequency, setFrequency] = useState<ExerciseFrequency[]>([]);
  const [frequencyDays, setFrequencyDays] = useState(30);
  const [viewType, setViewType] = useState<"muscle" | "exercise">("muscle");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    analyticsService
      .getExerciseFrequency(undefined, frequencyDays)
      .then(setFrequency)
      .catch(() => setFrequency([]))
      .finally(() => setLoading(false));
  }, [frequencyDays]);

  const chartData =
    viewType === "muscle"
      ? Object.entries(
          frequency.reduce((acc: Record<string, number>, curr) => {
            const m = curr.muscle_name ? cap(curr.muscle_name) : "Otro";
            acc[m] = (acc[m] || 0) + curr.count;
            return acc;
          }, {}),
        )
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
      : frequency
          .filter((d) => d.exercise_name)
          .slice(0, 10)
          .map((d) => ({
            name: d.muscle_name
              ? `${cap(d.muscle_name)} — ${cap(d.exercise_name)}`
              : cap(d.exercise_name),
            count: d.count,
          }));

  const tableRows =
    viewType === "muscle"
      ? Object.entries(
          frequency.reduce((acc: Record<string, number>, curr) => {
            const m = curr.muscle_name ? cap(curr.muscle_name) : "Otro";
            acc[m] = (acc[m] || 0) + curr.count;
            return acc;
          }, {}),
        ).sort((a, b) => b[1] - a[1])
      : frequency
          .filter((d) => d.exercise_name)
          .map((d) => [
            d.muscle_name
              ? `${cap(d.muscle_name)} — ${cap(d.exercise_name)}`
              : cap(d.exercise_name),
            d.count,
          ]);

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
            options={
              PERIOD_OPTIONS as unknown as { value: string; label: string }[]
            }
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
                  stroke="#94a3b8"
                  fontSize={10}
                  fontWeight="black"
                  axisLine={false}
                  tickLine={false}
                  width={140}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  contentStyle={{
                    background: "#0f1729",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "12px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  }}
                  labelStyle={{ color: "#94a3b8", fontSize: 11 }}
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={25}>
                  {chartData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
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
                    .filter(([name]: any) => name)
                    .map(([name, count]: any, i) => (
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
