import React from "react";
import { motion } from "framer-motion";
import { Activity, Flame, Moon, Clock } from "lucide-react";
import type { SleepLog, DailyHealth } from "../../services/fitbit";

interface Props {
  currentDaily: DailyHealth[];
  prevDaily: DailyHealth[];
  currentSleep: SleepLog[];
  prevSleep: SleepLog[];
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pctChange(current: number, prev: number): number | null {
  if (!prev || !current) return null;
  return ((current - prev) / prev) * 100;
}

interface CardDef {
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
  borderColor: string;
  label: string;
  value: string;
  subValue?: string;
  change: number | null;
  higherIsBetter: boolean;
}

const KpiCard: React.FC<CardDef & { delay: number }> = ({
  icon,
  iconBg,
  iconBorder,
  iconColor,
  borderColor,
  label,
  value,
  subValue,
  change,
  higherIsBetter,
  delay,
}) => {
  let changeEl: React.ReactNode = null;
  if (change !== null) {
    const good = higherIsBetter ? change > 2 : change < -2;
    const bad = higherIsBetter ? change < -2 : change > 2;
    const colorClass = good
      ? "text-green-400"
      : bad
        ? "text-red-400"
        : "text-slate-500";
    const arrow = change > 2 ? "↑" : change < -2 ? "↓" : "→";
    changeEl = (
      <p className={`text-[10px] font-bold ${colorClass}`}>
        {arrow} {Math.abs(change).toFixed(1)}%{" "}
        <span className="text-slate-600 font-normal">vs período ant.</span>
      </p>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`glass-card p-5 border-l-2 ${borderColor} flex flex-col gap-2`}
    >
      <div
        className={`w-9 h-9 ${iconBg} ${iconColor} ${iconBorder} rounded-xl flex items-center justify-center border transition-transform hover:scale-110`}
      >
        {icon}
      </div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">
        {label}
      </p>
      <p className="text-2xl font-black text-white leading-none">{value}</p>
      {subValue && <p className="text-[10px] text-slate-500">{subValue}</p>}
      {changeEl}
    </motion.div>
  );
};

const HealthKpiCards: React.FC<Props> = ({
  currentDaily,
  prevDaily,
  currentSleep,
  prevSleep,
}) => {
  const curSteps = avg(currentDaily.map((d) => d.steps));
  const prevSteps = avg(prevDaily.map((d) => d.steps));

  const curCalories = avg(
    currentDaily.filter((d) => d.calories_out > 0).map((d) => d.calories_out),
  );
  const prevCalories = avg(
    prevDaily.filter((d) => d.calories_out > 0).map((d) => d.calories_out),
  );

  const curEff = avg(currentSleep.map((s) => s.efficiency));
  const prevEff = avg(prevSleep.map((s) => s.efficiency));

  const curHours = avg(currentSleep.map((s) => s.duration_ms / 3_600_000));
  const prevHours = avg(prevSleep.map((s) => s.duration_ms / 3_600_000));

  const maxSteps = currentDaily.length
    ? Math.max(...currentDaily.map((d) => d.steps))
    : 0;

  const cards: (CardDef & { delay: number })[] = [
    {
      icon: <Activity size={16} />,
      iconBg: "bg-primary/10",
      iconBorder: "border-primary/20",
      iconColor: "text-primary",
      borderColor: "border-primary/50",
      label: "Pasos / día",
      value: curSteps > 0 ? Math.round(curSteps).toLocaleString() : "—",
      subValue: maxSteps > 0 ? `Máx: ${maxSteps.toLocaleString()}` : undefined,
      change: pctChange(curSteps, prevSteps),
      higherIsBetter: true,
      delay: 0,
    },
    {
      icon: <Flame size={16} />,
      iconBg: "bg-amber-500/10",
      iconBorder: "border-amber-500/20",
      iconColor: "text-amber-400",
      borderColor: "border-amber-500/50",
      label: "Calorías / día",
      value:
        curCalories > 0
          ? `${Math.round(curCalories).toLocaleString()} kcal`
          : "—",
      change: pctChange(curCalories, prevCalories),
      higherIsBetter: true,
      delay: 0.07,
    },
    {
      icon: <Moon size={16} />,
      iconBg: "bg-blue-500/10",
      iconBorder: "border-blue-500/20",
      iconColor: "text-blue-400",
      borderColor: "border-blue-500/50",
      label: "Efic. sueño",
      value: curEff > 0 ? `${curEff.toFixed(1)}%` : "—",
      subValue:
        curEff >= 85
          ? "Excelente"
          : curEff >= 70
            ? "Aceptable"
            : curEff > 0
              ? "Mejorable"
              : undefined,
      change: pctChange(curEff, prevEff),
      higherIsBetter: true,
      delay: 0.14,
    },
    {
      icon: <Clock size={16} />,
      iconBg: "bg-purple-500/10",
      iconBorder: "border-purple-500/20",
      iconColor: "text-purple-400",
      borderColor: "border-purple-500/50",
      label: "Horas de sueño",
      value: curHours > 0 ? `${curHours.toFixed(1)}h` : "—",
      subValue:
        curHours >= 7
          ? "Objetivo cumplido"
          : curHours > 0
            ? `Falta ${(7 - curHours).toFixed(1)}h`
            : undefined,
      change: pctChange(curHours, prevHours),
      higherIsBetter: true,
      delay: 0.21,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
};

export default HealthKpiCards;
