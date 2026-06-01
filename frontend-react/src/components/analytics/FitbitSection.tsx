import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Flame, Heart, Zap } from "lucide-react";
import {
  CHART_TOOLTIP_CONFIG,
  AXIS_TICK_STYLE,
} from "../../constants/chartStyles";
import { AZM_ZONES } from "../../constants/colors";

interface FitbitEntry {
  date: string;
}

interface CaloriesEntry extends FitbitEntry {
  calories: number;
}

interface HeartRateEntry extends FitbitEntry {
  fc: number;
}

type AzmKey = (typeof AZM_ZONES)[number]["key"];

type AzmEntry = FitbitEntry & Record<AzmKey, number>;

interface Props {
  caloriesData: CaloriesEntry[];
  heartRateData: HeartRateEntry[];
  azmData: AzmEntry[];
}

const FitbitSection: React.FC<Props> = ({
  caloriesData,
  heartRateData,
  azmData,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary border border-secondary/20">
          <Zap size={16} />
        </div>
        <h2 className="text-base font-black text-white tracking-tight">
          Métricas Fitbit
        </h2>
        <div className="flex-1 h-px bg-white/5" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6 md:p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-11 h-11 bg-accent/10 rounded-2xl flex items-center justify-center text-accent border border-accent/20">
              <Flame size={20} />
            </div>
            <div>
              <h3 className="font-black text-white text-base tracking-tight">
                Calorías por Sesión
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {caloriesData.length} sesiones con datos Fitbit
              </p>
            </div>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={caloriesData} barCategoryGap="30%">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: AXIS_TICK_STYLE.fill,
                    fontSize: AXIS_TICK_STYLE.fontSize,
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: AXIS_TICK_STYLE.fill,
                    fontSize: AXIS_TICK_STYLE.fontSize,
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  {...CHART_TOOLTIP_CONFIG}
                />
                <Bar
                  dataKey="calories"
                  name="Calorías"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                  fill="#3b82f6"
                  fillOpacity={0.85}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-6 md:p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-11 h-11 bg-danger/10 rounded-2xl flex items-center justify-center text-danger border border-danger/20">
              <Heart size={20} />
            </div>
            <div>
              <h3 className="font-black text-white text-base tracking-tight">
                Frecuencia Cardíaca Media
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                FC media por sesión (ppm)
              </p>
            </div>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={heartRateData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: AXIS_TICK_STYLE.fill,
                    fontSize: AXIS_TICK_STYLE.fontSize,
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: AXIS_TICK_STYLE.fill,
                    fontSize: AXIS_TICK_STYLE.fontSize,
                  }}
                  domain={["auto", "auto"]}
                />
                <Tooltip {...CHART_TOOLTIP_CONFIG} />
                <Line
                  type="monotone"
                  dataKey="fc"
                  name="FC Media"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  dot={{ fill: "#ef4444", r: 3 }}
                  activeDot={{ r: 5, fill: "#ef4444" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {azmData.length > 0 && (
        <div className="glass-card p-6 md:p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-11 h-11 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary border border-secondary/20">
              <Zap size={20} />
            </div>
            <div>
              <h3 className="font-black text-white text-base tracking-tight">
                Minutos en Zona Activa (AZM)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribución de intensidad por sesión
              </p>
            </div>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={azmData} barCategoryGap="30%">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: AXIS_TICK_STYLE.fill,
                    fontSize: AXIS_TICK_STYLE.fontSize,
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: AXIS_TICK_STYLE.fill,
                    fontSize: AXIS_TICK_STYLE.fontSize,
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  {...CHART_TOOLTIP_CONFIG}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: "11px",
                    color: "#94a3b8",
                    paddingTop: "8px",
                  }}
                />
                {AZM_ZONES.map(({ key, fill }, i) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="azm"
                    fill={fill}
                    fillOpacity={0.85}
                    maxBarSize={48}
                    radius={
                      i === AZM_ZONES.length - 1 ? [6, 6, 0, 0] : undefined
                    }
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default FitbitSection;
