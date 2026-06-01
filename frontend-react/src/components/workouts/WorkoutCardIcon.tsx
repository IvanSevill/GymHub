import React from "react";
import { Calendar as CalendarIcon, Zap, Dumbbell } from "lucide-react";

interface WorkoutCardIconProps {
  isUpcoming: boolean;
  isCardio: boolean;
}

const WorkoutCardIcon: React.FC<WorkoutCardIconProps> = ({
  isUpcoming,
  isCardio,
}) => {
  if (isUpcoming) return <CalendarIcon size={20} />;
  if (isCardio) return <Zap size={20} className="fill-accent" />;
  return <Dumbbell size={20} />;
};

export default WorkoutCardIcon;
