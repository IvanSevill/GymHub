import React, { useEffect, useRef, useState } from "react";
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
import { TrendingUp, ChevronDown } from "lucide-react";
import PeriodSelector from "../ui/PeriodSelector";
import { PERIOD_OPTIONS } from "../../constants/periods";
import { analyticsService } from "../../services/analytics";
import { Exercise } from "../../services/exercise";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { SkeletonChartArea } from "../ui/Skeleton";

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

interface Props {
  exercises: Exercise[];
  loading: boolean;
}

const WeightProgressCard: React.FC<Props> = ({ exercises, loading }) => {
  const [selectedExercise, setSelectedExercise] = useState("");
  const [weightData, setWeightData] = useState<any[]>([]);
  const [days, setDays] = useState("30");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sortedExercises = exercises.slice().sort((a, b) => {
    const ma = a.muscle?.name ?? "";
    const mb = b.muscle?.name ?? "";
    return ma.localeCompare(mb) || a.name.localeCompare(b.name);
  });

  const selectedEx = sortedExercises.find((ex) => ex.id === selectedExercise);

  useEffect(() => {
    if (exercises.length > 0 && !selectedExercise) {
      setSelectedExercise(exercises[0].id);
    }
  }, [exercises]);

  useEffect(() => {
    if (!selectedExercise) return;
    analyticsService
      .getWeightProgress(selectedExercise, Number(days))
      .then((res) =>
        setWeightData(
          res.map((d) => ({
            ...d,
            formattedDate: format(parseISO(d.date), "dd MMM", { locale: es }),
          })),
        ),
      )
      .catch(() => setWeightData([]));
  }, [selectedExercise, days]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
                  ? `${cap(selectedEx.muscle.name)} — ${cap(selectedEx.name)}`
                  : cap(selectedEx.name)
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
                      ? `${cap(ex.muscle.name)} — ${cap(ex.name)}`
                      : cap(ex.name);
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

      {loading ? (
        <SkeletonChartArea height="h-[300px]" />
      ) : weightData.length === 0 ? (
        <div className="h-[300px] flex flex-col items-center justify-center gap-4 text-center border border-dashed border-white/[0.06] rounded-2xl">
          <TrendingUp size={36} className="text-slate-700" />
          <p className="text-slate-500 text-sm">
            No hay datos para este ejercicio en el período seleccionado.
          </p>
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weightData}>
              <CartesianGrid
                strokeDasharray="5 5"
                stroke="#ffffff03"
                vertical={false}
              />
              <XAxis
                dataKey="formattedDate"
                stroke="#64748b"
                fontSize={10}
                fontWeight="black"
                axisLine={false}
                tickLine={false}
                interval={Math.max(0, Math.ceil(weightData.length / 8) - 1)}
              />
              <YAxis
                stroke="#64748b"
                fontSize={10}
                fontWeight="black"
                axisLine={false}
                tickLine={false}
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
