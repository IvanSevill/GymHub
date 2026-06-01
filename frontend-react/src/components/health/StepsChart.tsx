import React, { useMemo } from "react";
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
import type { DailyHealth } from "../../services/fitbit";
import { CHART_TOOLTIP, fmtDate, xTickInterval } from "./chartUtils";
import ChartCard from "./components/ChartCard";

interface Props {
  data: DailyHealth[];
}

const StepsChart: React.FC<Props> = ({ data }) => {
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

  const xInterval = xTickInterval(sorted.length);

  return (
    <ChartCard delay={0.05} className="lg:col-span-2">
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
              {...CHART_TOOLTIP}
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
    </ChartCard>
  );
};

export default StepsChart;
