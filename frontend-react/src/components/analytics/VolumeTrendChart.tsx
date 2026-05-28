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
import { BarChart2 } from "lucide-react";
import { motion } from "framer-motion";
import { SkeletonChartArea } from "../ui/Skeleton";

interface DataPoint {
  date: string;
  volume: number;
  formattedDate: string;
}

interface Props {
  data: DataPoint[];
  loading: boolean;
}

const fmtVolume = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}kg`;

const VolumeTrendChart: React.FC<Props> = ({ data, loading }) => {
  const avg =
    data.length > 0 ? data.reduce((s, d) => s + d.volume, 0) / data.length : 0;
  const xInterval = Math.max(0, Math.ceil(data.length / 8) - 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass-card p-6 md:p-8"
    >
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
          <BarChart2 size={22} />
        </div>
        <div>
          <h3 className="font-black text-white text-lg tracking-tight">
            Volumen por Sesión
          </h3>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
            Carga total acumulada por entrenamiento (kg)
          </p>
        </div>
        {avg > 0 && (
          <div className="ml-auto text-right shrink-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Media
            </p>
            <p className="text-2xl font-black text-primary tabular-nums">
              {fmtVolume(avg)}
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonChartArea height="h-[200px]" />
      ) : data.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-slate-600 text-sm">
          Sin datos de volumen en este período
        </div>
      ) : (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="5 5"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="formattedDate"
                stroke="#475569"
                fontSize={10}
                fontWeight="bold"
                axisLine={false}
                tickLine={false}
                interval={xInterval}
              />
              <YAxis
                stroke="#475569"
                fontSize={10}
                fontWeight="bold"
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={fmtVolume}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f1729",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "14px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
                labelStyle={{ color: "#94a3b8", fontSize: 11 }}
                itemStyle={{
                  color: "#f97316",
                  fontWeight: "700",
                  fontSize: "13px",
                }}
                formatter={(v: unknown) => [
                  typeof v === "number" ? `${v.toLocaleString()}kg` : "",
                  "",
                ]}
              />
              <ReferenceLine
                y={avg}
                stroke="#a855f7"
                strokeDasharray="5 4"
                strokeOpacity={0.5}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="volume"
                stroke="#f97316"
                strokeWidth={2.5}
                fill="url(#volGrad)"
                dot={false}
                activeDot={{
                  r: 6,
                  fill: "#f97316",
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

export default VolumeTrendChart;
