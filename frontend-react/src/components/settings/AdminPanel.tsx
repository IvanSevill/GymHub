import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Dumbbell, GitMerge, DatabaseZap } from "lucide-react";
import ExerciseLibrary from "./ExerciseLibrary";
import DataResetPanel from "./DataResetPanel";
import { StandardizeExercisesContent } from "../../pages/StandardizeExercises";

type AdminTab = "biblioteca" | "estandarizar" | "datos";

const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: "biblioteca", label: "Biblioteca", icon: <Dumbbell size={11} /> },
  { id: "estandarizar", label: "Estandarizar", icon: <GitMerge size={11} /> },
  { id: "datos", label: "Base de datos", icon: <DatabaseZap size={11} /> },
];

const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>("biblioteca");

  return (
    <section className="glass-card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-danger/10 text-danger rounded-xl flex items-center justify-center border border-danger/20 shrink-0">
          <Shield size={18} />
        </div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-tighter">
            Panel de administración
          </h3>
          <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
            Gestión de biblioteca, estandarización y datos
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-black/30 rounded-2xl border border-white/[0.05]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? "bg-primary text-white shadow-lg shadow-primary/20"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === "biblioteca" && <ExerciseLibrary />}
          {activeTab === "estandarizar" && <StandardizeExercisesContent />}
          {activeTab === "datos" && <DataResetPanel />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
};

export default AdminPanel;
