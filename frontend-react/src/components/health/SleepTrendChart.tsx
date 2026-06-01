import React, { useMemo } from "react";
import {
  LineChart,
  Line,
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

const SleepTrendChart: React.FC<Props> = ({ data }) => {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );

  const trendData = useMemo(
    () =>
      sorted.map((s) => ({
        date: fmtDate(s.date),
        horas: parseFloat((s.duration_ms / 3_600_000).toFixed(2)),
        eficiencia: s.efficiency,
      })),
    [sorted],
  );

  const avgHours = useMemo(
    () =>
      sorted.length
        ? sorted.reduce((a, s) => a + s.duration_ms, 0) /
          sorted.length /
          3_600_000
        : 0,
    [sorted],
  );

  const avgEff = useMemo(
    () =>
      sorted.length
        ? sorted.reduce((a, s) => a + s.efficiency, 0) / sorted.length
        : 0,
    [sorted],
  );

  const xInterval = xTickInterval(sorted.length);

  return (
    <ChartCard delay={0.05} className="lg:col-span-2">
      <h3 className="font-black text-white text-sm tracking-tight mb-0.5">
        Duración y eficiencia del sueño
      </h3>
      <p className="text-[10px] text-slate-500 mb-5">
        Media:{" "}
        <span className="text-blue-400 font-bold">{avgHours.toFixed(1)}h</span>{" "}
        ·{" "}
        <span className="text-purple-400 font-bold">
          {avgEff.toFixed(1)}% eficiencia
        </span>
      </p>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData}>
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
              yAxisId="horas"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#475569", fontSize: 10 }}
              tickFormatter={(v: number) => `${v}h`}
              domain={["auto", "auto"]}
              width={32}
            />
            <YAxis
              yAxisId="efic"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#475569", fontSize: 10 }}
              tickFormatter={(v: number) => `${v}%`}
              domain={[50, 100]}
              width={32}
            />
            <Tooltip
              {...CHART_TOOLTIP}
              formatter={(v, name) => {
                const n = v as number;
                if (name === "Horas") return [`${n.toFixed(1)}h`, name];
                return [`${n}%`, name];
              }}
            />
            <Legend
              wrapperStyle={{
                fontSize: "10px",
                color: "#94a3b8",
                paddingTop: "8px",
              }}
            />
            <Line
              yAxisId="horas"
              type="monotone"
              dataKey="horas"
              name="Horas"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: "#3b82f6" }}
            />
            <Line
              yAxisId="efic"
              type="monotone"
              dataKey="eficiencia"
              name="Eficiencia"
              stroke="#a855f7"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: "#a855f7" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default SleepTrendChart;
