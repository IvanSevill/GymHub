import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { Timer } from "lucide-react";
import { motion } from "framer-motion";
import { SkeletonChartArea } from "../ui/Skeleton";
import { SessionDuration } from "../../services/analytics";
import { CHART_TOOLTIP_CONFIG, AXIS_TICK_STYLE } from "../../constants/chartStyles";

const BUCKETS = [
  { label: "< 30min", min: 0, max: 30, color: "#64748b" },
  { label: "30–45min", min: 30, max: 45, color: "#f59e0b" },
  { label: "45–60min", min: 45, max: 60, color: "#10b981" },
  { label: "60–75min", min: 60, max: 75, color: "#3b82f6" },
  { label: "> 75min", min: 75, max: Infinity, color: "#a855f7" },
];

interface Props {
  data: SessionDuration[];
  loading: boolean;
}

const DurationHistogram: React.FC<Props> = ({ data, loading }) => {
  const chartData = useMemo(() => {
    const counts = BUCKETS.map((b) => ({ ...b, count: 0 }));
    for (const d of data) {
      const bucket = counts.find(
        (b) => d.duration_min >= b.min && d.duration_min < b.max,
      );
      if (bucket) bucket.count++;
    }
    return counts;
  }, [data]);

  const total = chartData.reduce((s, b) => s + b.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="glass-card p-6 md:p-8"
    >
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 border border-emerald-500/20">
          <Timer size={22} />
        </div>
        <div>
          <h3 className="font-black text-white text-lg tracking-tight">
            Duración de Sesiones
          </h3>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
            Distribución por rango de tiempo
          </p>
        </div>
        {total > 0 && (
          <div className="ml-auto text-right shrink-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Sesiones
            </p>
            <p className="text-2xl font-black text-white tabular-nums">
              {total}
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonChartArea height="h-[200px]" />
      ) : total === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-slate-600 text-sm">
          Sin datos de duración en este período
        </div>
      ) : (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="24%">
              <CartesianGrid
                strokeDasharray="5 5"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke={AXIS_TICK_STYLE.fill}
                fontSize={AXIS_TICK_STYLE.fontSize}
                fontWeight={AXIS_TICK_STYLE.fontWeight}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                stroke={AXIS_TICK_STYLE.fill}
                fontSize={AXIS_TICK_STYLE.fontSize}
                fontWeight={AXIS_TICK_STYLE.fontWeight}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={24}
              />
              <Tooltip
                {...CHART_TOOLTIP_CONFIG}
                formatter={(v: unknown) => [
                  `${v} sesión${Number(v) !== 1 ? "es" : ""} (${
                    total > 0 ? Math.round((Number(v) / total) * 100) : 0
                  }%)`,
                  "",
                ]}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {chartData.map((bucket, i) => (
                  <Cell key={i} fill={bucket.color} />
                ))}
                <LabelList
                  dataKey="count"
                  position="top"
                  formatter={(v: unknown) => {
                    const n = typeof v === "number" ? v : 0;
                    return n > 0 && total > 0
                      ? `${Math.round((n / total) * 100)}%`
                      : "";
                  }}
                  style={{ fill: "#64748b", fontSize: 10, fontWeight: "bold" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
};

export default DurationHistogram;
