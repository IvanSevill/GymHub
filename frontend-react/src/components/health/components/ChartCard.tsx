import React from "react";
import { motion } from "framer-motion";

interface Props {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

const ChartCard: React.FC<Props> = ({
  children,
  delay = 0,
  className = "",
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={`glass-card p-6 ${className}`}
  >
    {children}
  </motion.div>
);

export default ChartCard;
