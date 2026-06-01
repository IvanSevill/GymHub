import React from "react";
import { Activity } from "lucide-react";
import type { DailyHealth } from "../../services/fitbit";
import SectionHeader from "./components/SectionHeader";
import StepsChart from "./StepsChart";
import ActivityDistributionChart from "./ActivityDistributionChart";
import CaloriesHeartRateChart from "./CaloriesHeartRateChart";

interface Props {
  data: DailyHealth[];
}

const ActivityCharts: React.FC<Props> = ({ data }) => {
  if (!data.length) {
    return (
      <p className="text-slate-500 text-sm py-6 text-center">
        Sin datos de actividad en el período seleccionado.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={
          <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
            <Activity size={16} />
          </div>
        }
        title="Actividad Física"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <StepsChart data={data} />
        <ActivityDistributionChart data={data} />
      </div>

      <CaloriesHeartRateChart data={data} />
    </div>
  );
};

export default ActivityCharts;
