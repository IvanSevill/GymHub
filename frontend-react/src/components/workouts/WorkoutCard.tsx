import React from "react";
import { motion } from "framer-motion";
import { Workout } from "../../services/workout";
import WorkoutCardHeader from "./WorkoutCardHeader";
import WorkoutCardBody from "./WorkoutCardBody";

interface WorkoutCardProps {
  workout: Workout;
  index: number;
  isUpcoming: boolean;
}

const WorkoutCard: React.FC<WorkoutCardProps> = ({
  workout,
  index,
  isUpcoming,
}) => (
  <motion.div
    key={workout.id}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.04 }}
    className={`p-5 transition-all group relative overflow-hidden ${
      isUpcoming
        ? "upcoming-card hover:border-primary/40"
        : "glass-card hover:border-primary/20"
    }`}
  >
    <WorkoutCardHeader workout={workout} isUpcoming={isUpcoming} />
    <WorkoutCardBody workout={workout} isUpcoming={isUpcoming} />
    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.04] blur-3xl -z-10 group-hover:bg-primary/[0.08] transition-all" />
  </motion.div>
);

export default WorkoutCard;
