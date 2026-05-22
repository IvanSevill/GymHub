import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { exerciseService } from "../../services/exercise";
import type { Muscle, Exercise } from "../../services/exercise";
import { useToast } from "../../context/ToastContext";

interface MuscleWithExercises extends Muscle {
  exercises: Exercise[];
}

type EditTarget =
  | { kind: "muscle"; id: string }
  | { kind: "exercise"; id: string };
type DeleteTarget =
  | { kind: "muscle"; id: string; name: string; exerciseCount: number }
  | { kind: "exercise"; id: string; name: string };

const inputClass =
  "bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-primary/60 transition-colors w-full";

const ExerciseLibrary: React.FC = () => {
  const { addToast } = useToast();

  const [muscles, setMuscles] = useState<MuscleWithExercises[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [addExerciseMuscleId, setAddExerciseMuscleId] = useState<string | null>(
    null,
  );
  const [newExerciseName, setNewExerciseName] = useState("");
  const [isAddingExercise, setIsAddingExercise] = useState(false);

  const [showAddMuscle, setShowAddMuscle] = useState(false);
  const [newMuscleName, setNewMuscleName] = useState("");
  const [isAddingMuscle, setIsAddingMuscle] = useState(false);

  const [formError, setFormError] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (editTarget) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editTarget]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [muscleList, exerciseList] = await Promise.all([
        exerciseService.getMuscles(),
        exerciseService.getExercises(),
      ]);
      const map: Record<string, Exercise[]> = {};
      for (const ex of exerciseList) {
        if (!map[ex.muscle_id]) map[ex.muscle_id] = [];
        map[ex.muscle_id].push(ex);
      }
      setMuscles(
        muscleList.map((m) => ({
          ...m,
          exercises: (map[m.id] ?? []).sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        })),
      );
    } catch {
      addToast("Error al cargar la biblioteca", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Inline edit ─────────────────────────────────────────────────────────────

  const startEdit = (target: EditTarget, currentName: string) => {
    setEditTarget(target);
    setEditValue(currentName);
    setFormError("");
  };

  const cancelEdit = () => {
    setEditTarget(null);
    setEditValue("");
    setFormError("");
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      setFormError("El nombre no puede estar vacío");
      return;
    }
    setIsSavingEdit(true);
    setFormError("");
    try {
      if (editTarget.kind === "muscle") {
        const updated = await exerciseService.updateMuscle(
          editTarget.id,
          trimmed,
        );
        setMuscles((prev) =>
          prev.map((m) =>
            m.id === editTarget.id ? { ...m, name: updated.name } : m,
          ),
        );
        addToast("Grupo muscular renombrado", "success");
      } else {
        const updated = await exerciseService.updateExercise(
          editTarget.id,
          trimmed,
        );
        setMuscles((prev) =>
          prev.map((m) => ({
            ...m,
            exercises: m.exercises.map((ex) =>
              ex.id === editTarget.id ? { ...ex, name: updated.name } : ex,
            ),
          })),
        );
        addToast("Ejercicio renombrado", "success");
      }
      cancelEdit();
    } catch (e: any) {
      setFormError(e.response?.data?.detail || "Error al guardar");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const onEditKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.kind === "muscle") {
        await exerciseService.deleteMuscle(deleteTarget.id);
        setMuscles((prev) => prev.filter((m) => m.id !== deleteTarget.id));
        if (expandedId === deleteTarget.id) setExpandedId(null);
        addToast(`Grupo "${deleteTarget.name}" eliminado`, "success");
      } else {
        await exerciseService.deleteExercise(deleteTarget.id);
        setMuscles((prev) =>
          prev.map((m) => ({
            ...m,
            exercises: m.exercises.filter((ex) => ex.id !== deleteTarget.id),
          })),
        );
        addToast(`Ejercicio "${deleteTarget.name}" eliminado`, "success");
      }
      setDeleteTarget(null);
    } catch (e: any) {
      addToast(e.response?.data?.detail || "Error al eliminar", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Add exercise ─────────────────────────────────────────────────────────────

  const handleAddExercise = async (muscleId: string) => {
    const name = newExerciseName.trim();
    if (!name) {
      setFormError("Escribe el nombre del ejercicio");
      return;
    }
    setFormError("");
    setIsAddingExercise(true);
    try {
      const ex = await exerciseService.createExercise(name, muscleId);
      setMuscles((prev) =>
        prev.map((m) =>
          m.id === muscleId
            ? {
                ...m,
                exercises: [...m.exercises, ex].sort((a, b) =>
                  a.name.localeCompare(b.name),
                ),
              }
            : m,
        ),
      );
      setNewExerciseName("");
      setAddExerciseMuscleId(null);
      addToast(`Ejercicio "${name}" añadido`, "success");
    } catch (e: any) {
      setFormError(e.response?.data?.detail || "Error al crear el ejercicio");
    } finally {
      setIsAddingExercise(false);
    }
  };

  // ── Add muscle ───────────────────────────────────────────────────────────────

  const handleAddMuscle = async () => {
    const name = newMuscleName.trim();
    if (!name) {
      setFormError("Escribe el nombre del grupo muscular");
      return;
    }
    setFormError("");
    setIsAddingMuscle(true);
    try {
      const m = await exerciseService.createMuscle(name);
      setMuscles((prev) => [...prev, { ...m, exercises: [] }]);
      setNewMuscleName("");
      setShowAddMuscle(false);
      setExpandedId(m.id);
      addToast(`Grupo "${name}" creado`, "success");
    } catch (e: any) {
      setFormError(e.response?.data?.detail || "Error al crear el grupo");
    } finally {
      setIsAddingMuscle(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {muscles.map((muscle) => {
        const isExpanded = expandedId === muscle.id;
        const isEditingMuscle =
          editTarget?.kind === "muscle" && editTarget.id === muscle.id;
        const isDeletingMuscle =
          deleteTarget?.kind === "muscle" && deleteTarget.id === muscle.id;

        return (
          <div
            key={muscle.id}
            className="bg-black/20 border border-white/[0.06] rounded-2xl overflow-hidden"
          >
            {/* Muscle row header */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                onClick={() =>
                  !isEditingMuscle &&
                  setExpandedId(isExpanded ? null : muscle.id)
                }
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <ChevronDown
                  size={13}
                  className={`text-slate-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
                {isEditingMuscle ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={onEditKey}
                      className={inputClass}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {isSavingEdit ? (
                      <Loader2
                        size={12}
                        className="animate-spin text-slate-400 shrink-0"
                      />
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            saveEdit();
                          }}
                          className="text-primary hover:text-primary/80 shrink-0"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEdit();
                          }}
                          className="text-slate-500 hover:text-white shrink-0"
                        >
                          <X size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <span className="text-xs font-black text-white uppercase tracking-widest capitalize truncate">
                    {muscle.name}
                  </span>
                )}
              </button>

              {!isEditingMuscle && !isDeletingMuscle && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-slate-600 tabular-nums mr-1">
                    {muscle.exercises.length}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit({ kind: "muscle", id: muscle.id }, muscle.name);
                    }}
                    className="p-1 text-slate-600 hover:text-primary transition-colors rounded-lg hover:bg-primary/10"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({
                        kind: "muscle",
                        id: muscle.id,
                        name: muscle.name,
                        exerciseCount: muscle.exercises.length,
                      });
                    }}
                    className="p-1 text-slate-600 hover:text-danger transition-colors rounded-lg hover:bg-danger/10"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>

            {/* Edit error */}
            {isEditingMuscle && formError && (
              <p className="px-4 pb-2 text-[10px] text-danger font-semibold">
                {formError}
              </p>
            )}

            {/* Delete confirm */}
            <AnimatePresence>
              {isDeletingMuscle && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-white/[0.06] overflow-hidden"
                >
                  <div className="p-3 space-y-2.5">
                    <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20">
                      <AlertTriangle
                        size={12}
                        className="text-amber-400 shrink-0 mt-0.5"
                      />
                      <p className="text-[10px] text-amber-400 leading-relaxed">
                        Esto eliminará el grupo{" "}
                        <strong>"{deleteTarget?.name}"</strong>,{" "}
                        {deleteTarget?.kind === "muscle" &&
                          deleteTarget.exerciseCount > 0 && (
                            <>
                              sus{" "}
                              <strong>
                                {deleteTarget.exerciseCount} ejercicio
                                {deleteTarget.exerciseCount !== 1 ? "s" : ""}
                              </strong>{" "}
                              y{" "}
                            </>
                          )}
                        todos sus registros de series. No se puede deshacer.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeleteTarget(null)}
                        disabled={isDeleting}
                        className="flex-1 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={confirmDelete}
                        disabled={isDeleting}
                        className="flex-1 py-1.5 rounded-xl bg-danger text-white font-black text-[9px] uppercase tracking-widest hover:bg-danger/90 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                      >
                        {isDeleting ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Trash2 size={11} />
                        )}
                        Eliminar
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Exercise list */}
            <AnimatePresence>
              {isExpanded && !isDeletingMuscle && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-white/[0.06] overflow-hidden"
                >
                  {muscle.exercises.length === 0 && (
                    <p className="px-4 py-3 text-[10px] text-slate-600 font-semibold">
                      Sin ejercicios
                    </p>
                  )}
                  {muscle.exercises.map((ex) => {
                    const isEditingEx =
                      editTarget?.kind === "exercise" &&
                      editTarget.id === ex.id;
                    const isDeletingEx =
                      deleteTarget?.kind === "exercise" &&
                      deleteTarget.id === ex.id;

                    return (
                      <div key={ex.id}>
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] last:border-b-0">
                          <div className="w-1 h-1 rounded-full bg-slate-700 shrink-0" />

                          {isEditingEx ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <input
                                ref={editInputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={onEditKey}
                                className={inputClass}
                              />
                              {isSavingEdit ? (
                                <Loader2
                                  size={11}
                                  className="animate-spin text-slate-400 shrink-0"
                                />
                              ) : (
                                <>
                                  <button
                                    onClick={saveEdit}
                                    className="text-primary hover:text-primary/80 shrink-0"
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="text-slate-500 hover:text-white shrink-0"
                                  >
                                    <X size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="flex-1 text-xs text-slate-300 capitalize truncate">
                              {ex.name}
                            </span>
                          )}

                          {!isEditingEx && !isDeletingEx && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={() =>
                                  startEdit(
                                    { kind: "exercise", id: ex.id },
                                    ex.name,
                                  )
                                }
                                className="p-1 text-slate-700 hover:text-primary transition-colors rounded hover:bg-primary/10"
                              >
                                <Pencil size={10} />
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteTarget({
                                    kind: "exercise",
                                    id: ex.id,
                                    name: ex.name,
                                  })
                                }
                                className="p-1 text-slate-700 hover:text-danger transition-colors rounded hover:bg-danger/10"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Exercise edit error */}
                        {isEditingEx && formError && (
                          <p className="px-4 pb-1.5 text-[10px] text-danger font-semibold">
                            {formError}
                          </p>
                        )}

                        {/* Exercise delete confirm */}
                        <AnimatePresence>
                          {isDeletingEx && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 py-2.5 space-y-2 bg-danger/5 border-b border-danger/10">
                                <p className="text-[10px] text-danger/80 leading-snug">
                                  Eliminar{" "}
                                  <strong className="text-danger">
                                    "{ex.name}"
                                  </strong>{" "}
                                  borrará todos sus registros de series.
                                  ¿Continuar?
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setDeleteTarget(null)}
                                    disabled={isDeleting}
                                    className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={confirmDelete}
                                    disabled={isDeleting}
                                    className="flex-1 py-1.5 rounded-lg bg-danger text-white font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5 disabled:opacity-40"
                                  >
                                    {isDeleting ? (
                                      <Loader2
                                        size={10}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <Trash2 size={10} />
                                    )}
                                    Eliminar
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}

                  {/* Add exercise form */}
                  <div className="px-4 py-2.5 border-t border-white/[0.04]">
                    {addExerciseMuscleId === muscle.id ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={newExerciseName}
                            onChange={(e) => {
                              setNewExerciseName(e.target.value);
                              setFormError("");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                handleAddExercise(muscle.id);
                              if (e.key === "Escape") {
                                setAddExerciseMuscleId(null);
                                setNewExerciseName("");
                                setFormError("");
                              }
                            }}
                            placeholder="Nombre del ejercicio…"
                            className={inputClass}
                          />
                          <button
                            onClick={() => handleAddExercise(muscle.id)}
                            disabled={isAddingExercise}
                            className="shrink-0 p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40"
                          >
                            {isAddingExercise ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Check size={12} />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setAddExerciseMuscleId(null);
                              setNewExerciseName("");
                              setFormError("");
                            }}
                            className="shrink-0 p-1.5 rounded-lg text-slate-600 hover:text-white transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        {addExerciseMuscleId === muscle.id && formError && (
                          <p className="text-[10px] text-danger font-semibold">
                            {formError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAddExerciseMuscleId(muscle.id);
                          setNewExerciseName("");
                          setFormError("");
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-black text-slate-600 hover:text-primary uppercase tracking-widest transition-colors"
                      >
                        <Plus size={11} />
                        Añadir ejercicio
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Add muscle group */}
      <div className="pt-1">
        {showAddMuscle ? (
          <div className="bg-black/20 border border-white/[0.06] rounded-2xl p-3 space-y-1.5">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Nuevo grupo muscular
            </p>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newMuscleName}
                onChange={(e) => {
                  setNewMuscleName(e.target.value);
                  setFormError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddMuscle();
                  if (e.key === "Escape") {
                    setShowAddMuscle(false);
                    setNewMuscleName("");
                    setFormError("");
                  }
                }}
                placeholder="Ej: antebrazo"
                className={inputClass}
              />
              <button
                onClick={handleAddMuscle}
                disabled={isAddingMuscle}
                className="shrink-0 p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40"
              >
                {isAddingMuscle ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
              </button>
              <button
                onClick={() => {
                  setShowAddMuscle(false);
                  setNewMuscleName("");
                  setFormError("");
                }}
                className="shrink-0 p-1.5 rounded-lg text-slate-600 hover:text-white transition-colors"
              >
                <X size={12} />
              </button>
            </div>
            {formError && !editTarget && !addExerciseMuscleId && (
              <p className="text-[10px] text-danger font-semibold">
                {formError}
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={() => {
              setShowAddMuscle(true);
              setFormError("");
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-white/10 text-[10px] font-black text-slate-600 hover:text-primary hover:border-primary/30 uppercase tracking-widest transition-colors"
          >
            <Plus size={12} />
            Nuevo grupo muscular
          </button>
        )}
      </div>
    </div>
  );
};

export default ExerciseLibrary;
