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
} from "recharts";
import type { SleepLog } from "../../services/fitbit";
import { CHART_TOOLTIP } from "./chartUtils";
import ChartCard from "./components/ChartCard";

interface Props {
  data: SleepLog[];
}

const HISTOGRAM_COLORS = ["#ef4444", "#f59e0b", "#f97316", "#10b981"];

const EfficiencyHistogram: React.FC<Props> = ({ data }) => {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );

  const histogram = useMemo(() => {
    const buckets = [
      { label: "< 70%", count: 0, fill: HISTOGRAM_COLORS[0] },
      { label: "70–79%", count: 0, fill: HISTOGRAM_COLORS[1] },
      { label: "80–89%", count: 0, fill: HISTOGRAM_COLORS[2] },
      { label: "≥ 90%", count: 0, fill: HISTOGRAM_COLORS[3] },
    ];
    sorted.forEach((s) => {
      if (s.efficiency < 70) buckets[0].count++;
      else if (s.efficiency < 80) buckets[1].count++;
      else if (s.efficiency < 90) buckets[2].count++;
      else buckets[3].count++;
    });
    return buckets;
  }, [sorted]);

  return (
    <ChartCard delay={0.1}>
      <h3 className="font-black text-white text-sm tracking-tight mb-0.5">
        Distribución de eficiencia
      </h3>
      <p className="text-[10px] text-slate-500 mb-5">
        ¿Qué tan consistente es tu sueño?
      </p>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={histogram} barCategoryGap="20%">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#475569", fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#475569", fontSize: 10 }}
              allowDecimals={false}
              width={24}
            />
            <Tooltip
              {...CHART_TOOLTIP}
              cursor={{ fill: "rgba(255,255,255,0.02)" }}
              formatter={(v) => {
                const n = v as number;
                return [`${n} noche${n !== 1 ? "s" : ""}`, "Frecuencia"];
              }}
            />
            <Bar dataKey="count" name="Noches" radius={[6, 6, 0, 0]}>
              {histogram.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={entry.fill} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

export default EfficiencyHistogram;
