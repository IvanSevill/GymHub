import React from "react";

interface SkeletonBlockProps {
  className?: string;
}

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({
  className = "",
}) => <div className={`animate-pulse bg-white/5 rounded-xl ${className}`} />;

export const SkeletonCard: React.FC = () => (
  <div className="glass-card flex flex-col gap-3">
    <SkeletonBlock className="h-4 w-1/2" />
    <SkeletonBlock className="h-8 w-3/4" />
    <SkeletonBlock className="h-3 w-1/3" />
  </div>
);

export const SkeletonWorkoutRow: React.FC = () => (
  <div className="glass-card flex items-center gap-4">
    <SkeletonBlock className="h-10 w-10 rounded-xl shrink-0" />
    <div className="flex-1 flex flex-col gap-2">
      <SkeletonBlock className="h-4 w-1/3" />
      <SkeletonBlock className="h-3 w-1/4" />
    </div>
    <SkeletonBlock className="h-6 w-16 rounded-full" />
  </div>
);

export const SkeletonChartArea: React.FC<{ height?: string }> = ({
  height = "h-64",
}) => <SkeletonBlock className={`w-full ${height} rounded-2xl`} />;
