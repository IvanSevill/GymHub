import React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { Moon } from "lucide-react";
import type { SleepLog } from "../../services/fitbit";
import ChartCard from "./components/ChartCard";

interface Props {
  data: SleepLog[];
}

const PHASES = [
  { key: "minutes_deep", label: "Profundo", color: "#6366f1" },
  { key: "minutes_rem", label: "REM", color: "#a78bfa" },
  { key: "minutes_light", label: "Ligero", color: "#38bdf8" },
  { key: "minutes_wake", label: "Despierto", color: "#334155" },
] as const;

const fmtMin = (m: number) => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
};

const SleepLastEntry: React.FC<Props> = ({ data }) => {
  const last = [...data].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return null;

  const pieData = PHASES.map((p) => ({
    name: p.label,
    value: last[p.key as keyof SleepLog] as number,
    color: p.color,
  })).filter((d) => d.value > 0);

  const totalMinutes = last.minutes_asleep;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
    >
      <ChartCard>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20 shrink-0">
            <Moon size={14} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-black text-white text-sm tracking-tight">
              Última noche registrada
            </h3>
            <p className="text-[10px] text-slate-500">{last.date}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-6 items-center">
          {/* Pie chart */}
          <div className="w-[160px] h-[160px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "rgba(15,23,42,0.95)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    fontSize: 11,
                    color: "#e2e8f0",
                  }}
                  formatter={(v) => [fmtMin(Number(v)), ""]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Stats */}
          <div className="flex-1 w-full space-y-3">
            {/* Phase legend */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {PHASES.map((p) => {
                const mins = last[p.key as keyof SleepLog] as number;
                const pct =
                  totalMinutes > 0
                    ? Math.round((mins / totalMinutes) * 100)
                    : 0;
                return (
                  <div key={p.key} className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: p.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        {p.label}
                      </p>
                      <p className="text-xs font-bold text-white">
                        {fmtMin(mins)}{" "}
                        <span className="text-slate-500 font-normal">
                          {pct}%
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary stats */}
            <div className="border-t border-white/[0.06] pt-3 grid grid-cols-3 gap-2">
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Total
                </p>
                <p className="text-sm font-black text-white">
                  {fmtMin(last.minutes_asleep)}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Eficiencia
                </p>
                <p className="text-sm font-black text-white">
                  {last.efficiency}%
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  En cama
                </p>
                <p className="text-sm font-black text-white">
                  {fmtMin(last.time_in_bed)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </ChartCard>
    </motion.div>
  );
};

export default SleepLastEntry;
