import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Dumbbell, Loader2, Check, ChevronDown } from "lucide-react";
import { exerciseService } from "../../services/exercise";
import type { Muscle } from "../../services/exercise";
import { useToast } from "../../context/ToastContext";

type Mode = "exercise" | "muscle";

const ExerciseManager: React.FC = () => {
  const { addToast } = useToast();

  const [mode, setMode] = useState<Mode>("exercise");
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [loadingMuscles, setLoadingMuscles] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // exercise mode
  const [selectedMuscleId, setSelectedMuscleId] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [muscleDropdownOpen, setMuscleDropdownOpen] = useState(false);

  // muscle mode
  const [newMuscleName, setNewMuscleName] = useState("");
  const [firstExerciseName, setFirstExerciseName] = useState("");

  const [error, setError] = useState("");

  useEffect(() => {
    exerciseService
      .getMuscles()
      .then((data) => {
        setMuscles(data);
        if (data.length > 0) setSelectedMuscleId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingMuscles(false));
  }, []);

  const selectedMuscle = muscles.find((m) => m.id === selectedMuscleId);

  const handleAddExercise = async () => {
    const name = exerciseName.trim();
    if (!name) {
      setError("Escribe el nombre del ejercicio");
      return;
    }
    if (!selectedMuscleId) {
      setError("Selecciona un grupo muscular");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await exerciseService.createExercise(name, selectedMuscleId);
      setExerciseName("");
      addToast(`Ejercicio "${name}" añadido correctamente`, "success");
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al crear el ejercicio");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMuscle = async () => {
    const mName = newMuscleName.trim();
    const eName = firstExerciseName.trim();
    if (!mName) {
      setError("Escribe el nombre del grupo muscular");
      return;
    }
    if (!eName) {
      setError("Escribe el nombre del primer ejercicio");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      const newMuscle = await exerciseService.createMuscle(mName);
      await exerciseService.createExercise(eName, newMuscle.id);
      setMuscles((prev) => [...prev, newMuscle]);
      setNewMuscleName("");
      setFirstExerciseName("");
      addToast(`Grupo "${mName}" y ejercicio "${eName}" creados`, "success");
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al crear el grupo muscular");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (mode === "exercise") handleAddExercise();
    else handleAddMuscle();
  };

  const inputClass =
    "w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600";

  return (
    <section className="glass-card p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center border border-primary/20 shrink-0">
          <Dumbbell size={18} />
        </div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-tighter">
            Gestión de ejercicios
          </h3>
          <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
            Añade grupos musculares y ejercicios manualmente
          </p>
        </div>
      </div>

      {/* Mode switcher */}
      <div className="flex gap-1 p-1 bg-black/30 rounded-2xl border border-white/[0.05]">
        <button
          onClick={() => {
            setMode("exercise");
            setError("");
          }}
          className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
            mode === "exercise"
              ? "bg-primary text-white shadow-lg shadow-primary/20"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Añadir ejercicio
        </button>
        <button
          onClick={() => {
            setMode("muscle");
            setError("");
          }}
          className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
            mode === "muscle"
              ? "bg-primary text-white shadow-lg shadow-primary/20"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Nuevo grupo muscular
        </button>
      </div>

      {/* Form body */}
      <AnimatePresence mode="wait">
        {mode === "exercise" ? (
          <motion.div
            key="exercise"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {/* Muscle selector */}
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                Grupo muscular
              </p>
              {loadingMuscles ? (
                <div className="h-9 bg-white/5 rounded-xl animate-pulse" />
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMuscleDropdownOpen((o) => !o)}
                    className="w-full flex items-center justify-between bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white hover:border-primary/40 transition-colors capitalize"
                  >
                    <span>{selectedMuscle?.name ?? "Seleccionar"}</span>
                    <ChevronDown
                      size={13}
                      className={`text-slate-500 transition-transform ${muscleDropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence>
                    {muscleDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="absolute top-full left-0 right-0 mt-1 bg-surface border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                      >
                        <div className="max-h-44 overflow-y-auto py-1">
                          {muscles.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => {
                                setSelectedMuscleId(m.id);
                                setMuscleDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors text-[10px] font-black uppercase tracking-widest capitalize ${
                                m.id === selectedMuscleId
                                  ? "text-primary"
                                  : "text-slate-400"
                              }`}
                            >
                              {m.name}
                              {m.id === selectedMuscleId && <Check size={10} />}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Exercise name */}
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                Nombre del ejercicio
              </p>
              <input
                type="text"
                value={exerciseName}
                onChange={(e) => setExerciseName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Ej: Press de banca"
                className={inputClass}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="muscle"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            <div className="px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-[9px] text-slate-500 leading-relaxed">
                Un grupo muscular debe tener al menos un ejercicio. Ambos campos
                son obligatorios.
              </p>
            </div>

            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                Nombre del grupo muscular
              </p>
              <input
                type="text"
                value={newMuscleName}
                onChange={(e) => setNewMuscleName(e.target.value)}
                placeholder="Ej: antebrazo"
                className={inputClass}
              />
            </div>

            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                Primer ejercicio
              </p>
              <input
                type="text"
                value={firstExerciseName}
                onChange={(e) => setFirstExerciseName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Ej: Curl de muñeca"
                className={inputClass}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="text-[10px] text-danger font-semibold">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-primary/90 transition-all disabled:opacity-50"
      >
        {isSubmitting ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Plus size={13} />
        )}
        {mode === "exercise" ? "Añadir ejercicio" : "Crear grupo y ejercicio"}
      </button>
    </section>
  );
};

export default ExerciseManager;
