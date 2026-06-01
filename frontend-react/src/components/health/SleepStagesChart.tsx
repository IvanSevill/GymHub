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
import type { SleepLog } from "../../services/fitbit";
import { CHART_TOOLTIP, fmtDate, xTickInterval } from "./chartUtils";
import ChartCard from "./components/ChartCard";

interface Props {
  data: SleepLog[];
}

const SleepStagesChart: React.FC<Props> = ({ data }) => {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data],
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

  const xInterval = xTickInterval(sorted.length);

  return (
    <ChartCard delay={0.15}>
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
    </ChartCard>
  );
};

export default SleepStagesChart;
