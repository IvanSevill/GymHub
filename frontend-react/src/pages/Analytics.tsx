import React, { useEffect, useState } from "react";
import { exerciseService, Exercise } from "../services/exercise";
import {
  analyticsService,
  AnalyticsSummary,
  WorkoutFrequencyPoint,
} from "../services/analytics";
import { useToast } from "../context/ToastContext";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import PeriodSelector from "../components/ui/PeriodSelector";
import KPICards from "../components/analytics/KPICards";
import WorkoutFrequencyChart from "../components/analytics/WorkoutFrequencyChart";
import VolumeTrendChart from "../components/analytics/VolumeTrendChart";
import WeightProgressCard from "../components/analytics/WeightProgressCard";
import FrequencyAnalysisCard from "../components/analytics/FrequencyAnalysisCard";

interface VolumeTrendDataPoint {
  date: string;
  volume: number;
  formattedDate: string;
}

const GLOBAL_PERIODS = [
  { value: "7", label: "Semana" },
  { value: "30", label: "Mes" },
  { value: "90", label: "Trimestre" },
  { value: "180", label: "Semestre" },
  { value: "365", label: "Año" },
];

const Analytics: React.FC = () => {
  const { addToast } = useToast();
  const [globalDays, setGlobalDays] = useState("30");

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [freqData, setFreqData] = useState<WorkoutFrequencyPoint[]>([]);
  const [volumeData, setVolumeData] = useState<VolumeTrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const days = Number(globalDays);
        const [exRes, summaryRes, freqRes, volRes] = await Promise.all([
          exerciseService.getExercises(),
          analyticsService.getSummary(days),
          analyticsService.getWorkoutFrequency(days),
          analyticsService.getVolumeTrend(days),
        ]);
        setExercises(exRes);
        setSummary(summaryRes);
        setFreqData(freqRes);
        setVolumeData(
          volRes.map((d) => ({
            ...d,
            formattedDate: format(parseISO(d.date), "dd MMM", { locale: es }),
          })),
        );
      } catch {
        addToast("Error al cargar los datos de análisis", "error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [globalDays]);

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight">
            Análisis de Rendimiento
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">
            Inteligencia de entrenamiento basada en datos
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <PeriodSelector
            options={GLOBAL_PERIODS}
            value={globalDays}
            onChange={setGlobalDays}
          />
          <div
            className="flex items-center gap-3 px-4 py-2 rounded-2xl"
            style={{
              background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.15)",
            }}
          >
            <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-accent">
              En tiempo real
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards — Pattern 1: period comparison */}
      <KPICards summary={summary} loading={loading} days={Number(globalDays)} />

      {/* Trend charts — Pattern 2: AreaChart + ReferenceLine at avg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WorkoutFrequencyChart data={freqData} loading={loading} />
        <VolumeTrendChart data={volumeData} loading={loading} />
      </div>

      {/* Per-exercise weight progress (own period selector) */}
      <WeightProgressCard exercises={exercises} loading={loading} />

      {/* Frequency distribution (own period selector) */}
      <FrequencyAnalysisCard />
    </div>
  );
};

export default Analytics;
