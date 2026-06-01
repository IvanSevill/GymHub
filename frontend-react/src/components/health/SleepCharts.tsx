import React from "react";
import { Moon } from "lucide-react";
import type { SleepLog } from "../../services/fitbit";
import SectionHeader from "./components/SectionHeader";
import SleepTrendChart from "./SleepTrendChart";
import EfficiencyHistogram from "./EfficiencyHistogram";
import SleepStagesChart from "./SleepStagesChart";

interface Props {
  data: SleepLog[];
}

const SleepCharts: React.FC<Props> = ({ data }) => {
  if (!data.length) {
    return (
      <p className="text-slate-500 text-sm py-6 text-center">
        Sin datos de sueño en el período seleccionado.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={
          <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 border border-blue-500/20">
            <Moon size={16} />
          </div>
        }
        title="Sueño"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SleepTrendChart data={data} />
        <EfficiencyHistogram data={data} />
      </div>

      <SleepStagesChart data={data} />
    </div>
  );
};

export default SleepCharts;
