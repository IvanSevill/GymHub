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
import type { DailyHealth } from "../../services/fitbit";
import { CHART_TOOLTIP, fmtDate, xTickInterval } from "./chartUtils";
import ChartCard from "./components/ChartCard";

interface Props {
  data: DailyHealth[];
}

const ActivityDistributionChart: React.FC<Props> = ({ data }) => {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data],
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
      const pct = (v: number): number => Math.round((v / total) * 100);
      return {
        date: fmtDate(d.date),
        sedentario: pct(d.minutes_sedentary),
        ligero: pct(d.minutes_lightly_active),
        moderado: pct(d.minutes_fairly_active),
        intenso: pct(d.minutes_very_active),
      };
    });
  }, [sorted]);

  const xInterval = xTickInterval(sorted.length);

  return (
    <ChartCard delay={0.1}>
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
              {...CHART_TOOLTIP}
              cursor={{ fill: "rgba(255,255,255,0.02)" }}
              formatter={(v, name) => [
                `${(v as number).toFixed(1)}%`,
                String(name).charAt(0).toUpperCase() + String(name).slice(1),
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
    </ChartCard>
  );
};

export default ActivityDistributionChart;
