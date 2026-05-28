import React, { useEffect, useState } from "react";
import { exerciseService, Exercise } from "../services/exercise";
import {
  analyticsService,
  AnalyticsSummary,
  WorkoutFrequencyPoint,
  MuscleBalancePoint,
  SessionDuration,
} from "../services/analytics";
import { useToast } from "../context/ToastContext";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import PeriodSelector from "../components/ui/PeriodSelector";
import { GLOBAL_PERIODS } from "../constants/periods";
import KPICards from "../components/analytics/KPICards";
import WorkoutFrequencyChart from "../components/analytics/WorkoutFrequencyChart";
import VolumeTrendChart from "../components/analytics/VolumeTrendChart";
import MuscleBalanceChart from "../components/analytics/MuscleBalanceChart";
import DurationHistogram from "../components/analytics/DurationHistogram";
import WeightProgressCard from "../components/analytics/WeightProgressCard";
import FrequencyAnalysisCard from "../components/analytics/FrequencyAnalysisCard";

interface VolumeTrendDataPoint {
  date: string;
  volume: number;
  formattedDate: string;
}

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 mb-6">
    {children}
  </p>
);

const Analytics: React.FC = () => {
  const { addToast } = useToast();
  const [globalDays, setGlobalDays] = useState("30");

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [freqData, setFreqData] = useState<WorkoutFrequencyPoint[]>([]);
  const [volumeData, setVolumeData] = useState<VolumeTrendDataPoint[]>([]);
  const [muscleBalance, setMuscleBalance] = useState<MuscleBalancePoint[]>([]);
  const [sessionDurations, setSessionDurations] = useState<SessionDuration[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const days = Number(globalDays);
        const [exRes, summaryRes, freqRes, volRes, muscleRes, durRes] =
          await Promise.all([
            exerciseService.getExercises(),
            analyticsService.getSummary(days),
            analyticsService.getWorkoutFrequency(days),
            analyticsService.getVolumeTrend(days),
            analyticsService.getMuscleBalance(days),
            analyticsService.getSessionDurations(days),
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
        setMuscleBalance(muscleRes);
        setSessionDurations(durRes);
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
        <PeriodSelector
          options={GLOBAL_PERIODS}
          value={globalDays}
          onChange={setGlobalDays}
        />
      </div>

      {/* KPI Cards — Pattern 1: period comparison */}
      <KPICards summary={summary} loading={loading} days={Number(globalDays)} />

      {/* Tendencias temporales */}
      <div>
        <SectionLabel>Tendencias</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WorkoutFrequencyChart data={freqData} loading={loading} />
          <VolumeTrendChart data={volumeData} loading={loading} />
        </div>
      </div>

      {/* Composición muscular + Consistencia de sesiones */}
      <div>
        <SectionLabel>Composición y consistencia</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MuscleBalanceChart data={muscleBalance} loading={loading} />
          <DurationHistogram data={sessionDurations} loading={loading} />
        </div>
      </div>

      {/* Per-exercise weight progress (own period selector) */}
      <WeightProgressCard exercises={exercises} loading={loading} />

      {/* Frequency distribution */}
      <FrequencyAnalysisCard />
    </div>
  );
};

export default Analytics;
