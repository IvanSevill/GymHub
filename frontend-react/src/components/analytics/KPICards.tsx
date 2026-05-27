import React from "react";
import {
  TrendingUp,
  TrendingDown,
  CalendarDays,
  Dumbbell,
  Clock,
  Award,
} from "lucide-react";
import { motion } from "framer-motion";
import { SkeletonCard } from "../ui/Skeleton";
import { AnalyticsSummary } from "../../services/analytics";

interface Props {
  summary: AnalyticsSummary | null;
  loading: boolean;
  days: number;
}

const pctChange = (curr: number, prev: number): number | null =>
  prev === 0 ? null : ((curr - prev) / prev) * 100;

const KPICards: React.FC<Props> = ({ summary, loading, days }) => {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const showComparison = days < 365;

  const cards = [
    {
      label: "Entrenamientos",
      value: summary.workout_count,
      prevValue: summary.prev_workout_count,
      display: String(summary.workout_count),
      sub: showComparison
        ? `${summary.prev_workout_count} período anterior`
        : "total en el período",
      icon: CalendarDays,
      color: "text-accent",
      bg: "bg-accent/10",
      borderHex: "#3b82f6",
    },
    {
      label: "Volumen Total",
      value: summary.total_volume_kg,
      prevValue: summary.prev_total_volume_kg,
      display:
        summary.total_volume_kg >= 1000
          ? `${(summary.total_volume_kg / 1000).toFixed(1)}t`
          : `${Math.round(summary.total_volume_kg)}kg`,
      sub: "kg totales movidos",
      icon: Dumbbell,
      color: "text-primary",
      bg: "bg-primary/10",
      borderHex: "#f97316",
    },
    {
      label: "Duración Media",
      value: summary.avg_duration_min ?? 0,
      prevValue: summary.prev_avg_duration_min ?? 0,
      display:
        summary.avg_duration_min != null
          ? `${Math.round(summary.avg_duration_min)}min`
          : "—",
      sub: "por sesión",
      icon: Clock,
      color: "text-secondary",
      bg: "bg-secondary/10",
      borderHex: "#a855f7",
    },
    {
      label: "Récords",
      value: summary.pr_count,
      prevValue: summary.prev_pr_count,
      display: String(summary.pr_count),
      sub: "nuevos máximos este período",
      icon: Award,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      borderHex: "#f59e0b",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, i) => {
        const pct = showComparison
          ? pctChange(card.value, card.prevValue)
          : null;
        const isUp = pct !== null && pct >= 0;
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="glass-card p-6 flex items-center gap-4 group overflow-hidden"
            style={{ borderLeft: `2px solid ${card.borderHex}` }}
          >
            <div
              className={`w-12 h-12 ${card.bg} ${card.color} rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110`}
            >
              <card.icon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase text-slate-500 tracking-widest truncate">
                {card.label}
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-3xl font-black text-white tabular-nums leading-none">
                  {card.display}
                </p>
                {pct !== null && (
                  <span
                    className={`flex items-center gap-0.5 text-xs font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {isUp ? (
                      <TrendingUp size={12} />
                    ) : (
                      <TrendingDown size={12} />
                    )}
                    {Math.abs(pct).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-[9px] text-slate-600 mt-0.5 truncate">
                {card.sub}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default KPICards;
