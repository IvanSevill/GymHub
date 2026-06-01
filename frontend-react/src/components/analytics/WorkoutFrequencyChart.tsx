import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Activity } from "lucide-react";
import { motion } from "framer-motion";
import { SkeletonChartArea } from "../ui/Skeleton";
import { WorkoutFrequencyPoint } from "../../services/analytics";
import { CHART_TOOLTIP_CONFIG, AXIS_TICK_STYLE } from "../../constants/chartStyles";
import { formatWeek } from "../../utils/chartFormatters";

interface Props {
  data: WorkoutFrequencyPoint[];
  loading: boolean;
}

const WorkoutFrequencyChart: React.FC<Props> = ({ data, loading }) => {
  const avg =
    data.length > 0 ? data.reduce((s, d) => s + d.count, 0) / data.length : 0;
  const xInterval = Math.max(0, Math.ceil(data.length / 8) - 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass-card p-6 md:p-8"
    >
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent border border-accent/20">
          <Activity size={22} />
        </div>
        <div>
          <h3 className="font-black text-white text-lg tracking-tight">
            Frecuencia Semanal
          </h3>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
            Entrenamientos por semana
          </p>
        </div>
        {avg > 0 && (
          <div className="ml-auto text-right shrink-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Media
            </p>
            <p className="text-2xl font-black text-accent tabular-nums">
              {avg.toFixed(1)}
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonChartArea height="h-[200px]" />
      ) : data.every((d) => d.count === 0) ? (
        <div className="h-[200px] flex items-center justify-center text-slate-600 text-sm">
          Sin entrenamientos en este período
        </div>
      ) : (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="freqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="5 5"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="week"
                stroke={AXIS_TICK_STYLE.fill}
                fontSize={AXIS_TICK_STYLE.fontSize}
                fontWeight={AXIS_TICK_STYLE.fontWeight}
                axisLine={false}
                tickLine={false}
                interval={xInterval}
                tickFormatter={formatWeek}
              />
              <YAxis
                stroke={AXIS_TICK_STYLE.fill}
                fontSize={AXIS_TICK_STYLE.fontSize}
                fontWeight={AXIS_TICK_STYLE.fontWeight}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={20}
              />
              <Tooltip
                {...CHART_TOOLTIP_CONFIG}
                itemStyle={{
                  ...CHART_TOOLTIP_CONFIG.itemStyle,
                  color: "#3b82f6",
                }}
                formatter={(v: unknown) => [`${v} entrenos`, ""]}
              />
              <ReferenceLine
                y={avg}
                stroke="#f97316"
                strokeDasharray="5 4"
                strokeOpacity={0.5}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fill="url(#freqGrad)"
                dot={false}
                activeDot={{
                  r: 6,
                  fill: "#3b82f6",
                  stroke: "#fff",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
};

export default WorkoutFrequencyChart;
