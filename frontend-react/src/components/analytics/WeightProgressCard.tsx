import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp, ChevronDown, AlertCircle } from "lucide-react";
import PeriodSelector from "../ui/PeriodSelector";
import { PERIOD_OPTIONS } from "../../constants/periods";
import { Exercise } from "../../services/exercise";
import { motion, AnimatePresence } from "framer-motion";
import { SkeletonChartArea } from "../ui/Skeleton";
import {
  CHART_TOOLTIP_CONFIG,
  AXIS_TICK_STYLE,
} from "../../constants/chartStyles";
import { CHART_HEIGHTS } from "../../constants/dimensions";
import { capitalize } from "../../utils/chartFormatters";
import { useWeightProgress } from "./hooks/useWeightProgress";
import { useDropdown } from "./hooks/useDropdown";

interface Props {
  exercises: Exercise[];
  loading: boolean;
}

const WeightProgressCard: React.FC<Props> = ({ exercises, loading }) => {
  const {
    selectedExercise,
    setSelectedExercise,
    weightData,
    loadingWeights,
    weightError,
    setWeightError,
    days,
    setDays,
  } = useWeightProgress(exercises);

  const { isOpen, setIsOpen, dropdownRef } = useDropdown();

  const sortedExercises = exercises.slice().sort((a, b) => {
    const ma = a.muscle?.name ?? "";
    const mb = b.muscle?.name ?? "";
    return ma.localeCompare(mb) || a.name.localeCompare(b.name);
  });

  const selectedEx = sortedExercises.find((ex) => ex.id === selectedExercise);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-card p-6 md:p-10"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
            <TrendingUp size={24} />
          </div>
          <div>
            <h3 className="font-black text-white text-lg tracking-tight">
              Rendimiento de Cargas
            </h3>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
              Progreso temporal por ejercicio
            </p>
          </div>
        </div>
        <PeriodSelector
          options={PERIOD_OPTIONS}
          value={days}
          onChange={setDays}
        />
      </div>

      {/* Custom exercise dropdown */}
      <div className="mb-6" ref={dropdownRef}>
        <div className="relative w-full sm:w-80">
          <button
            onClick={() => setIsOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-white/10 bg-black/30 text-sm font-semibold text-white hover:border-primary/40 transition-all"
          >
            <span className="truncate">
              {selectedEx
                ? selectedEx.muscle?.name
                  ? `${capitalize(selectedEx.muscle.name)} — ${capitalize(selectedEx.name)}`
                  : capitalize(selectedEx.name)
                : "Seleccionar ejercicio"}
            </span>
            <ChevronDown
              size={16}
              className={`text-slate-500 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
                style={{ background: "#0d1526" }}
              >
                <div className="max-h-64 overflow-y-auto no-scrollbar py-1">
                  {sortedExercises.map((ex) => {
                    const label = ex.muscle?.name
                      ? `${capitalize(ex.muscle.name)} — ${capitalize(ex.name)}`
                      : capitalize(ex.name);
                    const isSelected = ex.id === selectedExercise;
                    return (
                      <button
                        key={ex.id}
                        onClick={() => {
                          setSelectedExercise(ex.id);
                          setIsOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          isSelected
                            ? "text-primary bg-primary/10"
                            : "text-slate-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {!selectedExercise && !loading ? (
        <div
          className={`${CHART_HEIGHTS.LARGE} flex flex-col items-center justify-center gap-4 text-center border border-dashed border-white/[0.06] rounded-2xl`}
        >
          <TrendingUp size={36} className="text-slate-700" />
          <p className="text-slate-500 text-sm">
            Selecciona un ejercicio para ver su progreso.
          </p>
        </div>
      ) : loading || loadingWeights ? (
        <SkeletonChartArea height={CHART_HEIGHTS.LARGE} />
      ) : weightError ? (
        <div
          className={`${CHART_HEIGHTS.LARGE} flex flex-col items-center justify-center gap-3 text-center border border-dashed border-red-500/20 rounded-2xl`}
        >
          <AlertCircle size={28} className="text-red-500/50" />
          <p className="text-slate-500 text-sm">Error al cargar los datos.</p>
          <button
            onClick={() => {
              setWeightError(false);
            }}
            className="text-xs text-primary hover:underline font-semibold"
          >
            Reintentar
          </button>
        </div>
      ) : weightData.length === 0 ? (
        <div
          className={`${CHART_HEIGHTS.LARGE} flex flex-col items-center justify-center gap-4 text-center border border-dashed border-white/[0.06] rounded-2xl`}
        >
          <TrendingUp size={36} className="text-slate-700" />
          <p className="text-slate-500 text-sm">
            No hay datos para este ejercicio en el período seleccionado.
          </p>
        </div>
      ) : (
        <div className={`${CHART_HEIGHTS.LARGE} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weightData}>
              <CartesianGrid
                strokeDasharray="5 5"
                stroke="#ffffff03"
                vertical={false}
              />
              <XAxis
                dataKey="formattedDate"
                stroke={AXIS_TICK_STYLE.fill}
                fontSize={AXIS_TICK_STYLE.fontSize}
                fontWeight={AXIS_TICK_STYLE.fontWeight}
                axisLine={false}
                tickLine={false}
                interval={Math.max(0, Math.ceil(weightData.length / 8) - 1)}
              />
              <YAxis
                stroke={AXIS_TICK_STYLE.fill}
                fontSize={AXIS_TICK_STYLE.fontSize}
                fontWeight={AXIS_TICK_STYLE.fontWeight}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                {...CHART_TOOLTIP_CONFIG}
                itemStyle={{
                  ...CHART_TOOLTIP_CONFIG.itemStyle,
                  color: "#f97316",
                }}
              />
              <ReferenceLine
                y={
                  weightData.reduce((s, d) => s + d.value, 0) /
                  weightData.length
                }
                stroke="#f97316"
                strokeDasharray="5 4"
                strokeOpacity={0.45}
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#f97316"
                strokeWidth={3}
                dot={{
                  r: 5,
                  fill: "#f97316",
                  strokeWidth: 2,
                  stroke: "#080c14",
                }}
                activeDot={{
                  r: 8,
                  fill: "#f97316",
                  strokeWidth: 2,
                  stroke: "#fff",
                }}
                animationDuration={1500}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
};

export default WeightProgressCard;
