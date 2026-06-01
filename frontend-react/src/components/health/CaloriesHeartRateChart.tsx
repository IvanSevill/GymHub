import React, { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
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

const CaloriesHeartRateChart: React.FC<Props> = ({ data }) => {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );

  const composedData = useMemo(
    () =>
      sorted.map((d) => ({
        date: fmtDate(d.date),
        calorias: d.calories_out > 0 ? d.calories_out : null,
        fc: d.resting_heart_rate > 0 ? d.resting_heart_rate : null,
      })),
    [sorted],
  );

  const xInterval = xTickInterval(sorted.length);

  return (
    <ChartCard delay={0.15}>
      <h3 className="font-black text-white text-sm tracking-tight mb-0.5">
        Calorías quemadas y FC en reposo
      </h3>
      <p className="text-[10px] text-slate-500 mb-5">
        Una FC en reposo más baja a lo largo del tiempo indica mejor forma
        cardiovascular
      </p>
      <div className="h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={composedData}>
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
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#475569", fontSize: 10 }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
              width={36}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#475569", fontSize: 10 }}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v}`}
              width={30}
            />
            <Tooltip
              {...CHART_TOOLTIP}
              cursor={{ fill: "rgba(255,255,255,0.02)" }}
              formatter={(v, name) => {
                const n = v as number;
                if (name === "Calorías")
                  return [`${n.toLocaleString()} kcal`, name];
                return [`${n} bpm`, name];
              }}
            />
            <Legend
              wrapperStyle={{
                fontSize: "10px",
                color: "#94a3b8",
                paddingTop: "8px",
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="calorias"
              name="Calorías"
              fill="#f59e0b"
              fillOpacity={0.7}
              maxBarSize={40}
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="fc"
              name="FC reposo"
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: "#ef4444" }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default CaloriesHeartRateChart;
