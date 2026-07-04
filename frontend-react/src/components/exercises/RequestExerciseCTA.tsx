import React, { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Layers, Plus, Search } from "lucide-react";
import { exerciseService, type Muscle } from "../../services/exercise";
import {
  ExerciseRequestModal,
  MuscleRequestModal,
} from "./ExerciseRequestModals";

/**
 * Entry point on the Exercises page: when a user can't find the exercise they
 * are looking for, they can request it (or a whole new muscle group) right here.
 * Approval still happens in the admin panel; request tracking lives in Settings.
 */
const RequestExerciseCTA: React.FC = () => {
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [showMuscleModal, setShowMuscleModal] = useState(false);

  useEffect(() => {
    exerciseService
      .getMuscles()
      .then(setMuscles)
      .catch(() => {});
  }, []);

  return (
    <>
      <section className="glass-card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center border border-primary/20 shrink-0">
            <Search size={18} />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-tighter">
              ¿No encuentras tu ejercicio?
            </h3>
            <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
              Solicítalo y el administrador lo añadirá al catálogo
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => setShowExerciseModal(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-primary/10 hover:border-primary/30 text-slate-400 hover:text-primary font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Plus size={12} />
            Solicitar ejercicio
          </button>
          <button
            onClick={() => setShowMuscleModal(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-primary/10 hover:border-primary/30 text-slate-400 hover:text-primary font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Layers size={12} />
            Solicitar músculo
          </button>
        </div>
      </section>

      <AnimatePresence>
        {showExerciseModal && (
          <ExerciseRequestModal
            muscles={muscles}
            onClose={() => setShowExerciseModal(false)}
            onSuccess={() => {}}
          />
        )}
        {showMuscleModal && (
          <MuscleRequestModal
            onClose={() => setShowMuscleModal(false)}
            onSuccess={() => {}}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default RequestExerciseCTA;
