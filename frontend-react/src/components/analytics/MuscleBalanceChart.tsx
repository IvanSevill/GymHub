import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Layers } from "lucide-react";
import { motion } from "framer-motion";
import { SkeletonChartArea } from "../ui/Skeleton";
import { MuscleBalancePoint } from "../../services/analytics";

const MUSCLE_COLORS: Record<string, string> = {
  pecho: "#f97316",
  espalda: "#3b82f6",
  pierna: "#a855f7",
  hombro: "#10b981",
  brazo: "#f59e0b",
  abdomen: "#ec4899",
  glúteo: "#06b6d4",
  glúte: "#06b6d4",
};
const FALLBACK_COLORS = [
  "#f97316",
  "#3b82f6",
  "#a855f7",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
];

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fmtVol = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}kg`;

interface Props {
  data: MuscleBalancePoint[];
  loading: boolean;
}

const MuscleBalanceChart: React.FC<Props> = ({ data, loading }) => {
  const { pivotData, muscles } = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const muscleSet = new Set<string>();
    for (const row of data) {
      if (row.volume <= 0) continue;
      if (!map[row.week]) map[row.week] = {};
      const m = cap(row.muscle);
      map[row.week][m] = (map[row.week][m] || 0) + row.volume;
      muscleSet.add(m);
    }
    const weeks = Object.keys(map).sort();
    return {
      pivotData: weeks.map((week) => ({ week, ...map[week] })),
      muscles: [...muscleSet],
    };
  }, [data]);

  const xInterval = Math.max(0, Math.ceil(pivotData.length / 8) - 1);

  const getColor = (muscle: string, i: number) =>
    MUSCLE_COLORS[muscle.toLowerCase()] ??
    FALLBACK_COLORS[i % FALLBACK_COLORS.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-card p-6 md:p-8"
    >
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary border border-secondary/20">
          <Layers size={22} />
        </div>
        <div>
          <h3 className="font-black text-white text-lg tracking-tight">
            Balance Muscular
          </h3>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
            Volumen semanal por grupo muscular (kg)
          </p>
        </div>
      </div>

      {loading ? (
        <SkeletonChartArea height="h-[220px]" />
      ) : pivotData.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-slate-600 text-sm">
          Sin datos en este período
        </div>
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pivotData}>
              <CartesianGrid
                strokeDasharray="5 5"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="week"
                stroke="#475569"
                fontSize={10}
                fontWeight="bold"
                axisLine={false}
                tickLine={false}
                interval={xInterval}
                tickFormatter={(w: string) => {
                  const parts = w.split("-W");
                  return parts.length === 2 ? `S${parts[1]}` : w;
                }}
              />
              <YAxis
                stroke="#475569"
                fontSize={10}
                fontWeight="bold"
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtVol}
                width={42}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f1729",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "14px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
                labelStyle={{ color: "#94a3b8", fontSize: 11 }}
                formatter={(v: unknown, name: unknown) => [
                  typeof v === "number" ? fmtVol(v) : String(v),
                  String(name),
                ]}
              />
              <Legend
                wrapperStyle={{ paddingTop: 16 }}
                formatter={(value) => (
                  <span
                    style={{
                      color: "#64748b",
                      fontWeight: "bold",
                      fontSize: 10,
                    }}
                  >
                    {value}
                  </span>
                )}
              />
              {muscles.map((m, i) => (
                <Bar
                  key={m}
                  dataKey={m}
                  stackId="a"
                  fill={getColor(m, i)}
                  radius={
                    i === muscles.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
                  }
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
};

export default MuscleBalanceChart;
