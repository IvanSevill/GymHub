import React, { useState, useEffect, useMemo } from "react";
import api from "../services/api";
import { Check, Loader2, Search, X, AlertTriangle, Link2 } from "lucide-react";

interface Exercise {
  id: string;
  name: string;
  muscle_id: string;
  muscle_name: string;
  usage_count: number;
}

const MUSCLE_ORDER = [
  "pecho",
  "espalda",
  "hombro",
  "biceps",
  "triceps",
  "abdominales",
  "gluteos",
  "cuadriceps",
  "femoral",
  "gemelos",
];

const StandardizeExercises: React.FC = () => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [standardName, setStandardName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [activeMuscle, setActiveMuscle] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    setLoading(true);
    try {
      const res = await api.get("/exercises/unique");
      setExercises(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error("Failed to load exercises:", err);
      setMessage({
        text: err.response?.data?.detail || "Error al cargar ejercicios",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const g: Record<string, Exercise[]> = {};
    for (const ex of exercises) {
      if (!g[ex.muscle_name]) g[ex.muscle_name] = [];
      g[ex.muscle_name].push(ex);
    }
    for (const m of Object.keys(g)) {
      g[m].sort((a, b) => a.name.localeCompare(b.name));
    }
    return g;
  }, [exercises]);

  const muscles = useMemo(() => {
    return Object.keys(grouped).sort((a, b) => {
      const ia = MUSCLE_ORDER.indexOf(a.toLowerCase());
      const ib = MUSCLE_ORDER.indexOf(b.toLowerCase());
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [grouped]);

  useEffect(() => {
    if (!activeMuscle && muscles.length > 0) setActiveMuscle(muscles[0]);
  }, [muscles, activeMuscle]);

  const visibleExercises = useMemo(() => {
    if (!activeMuscle) return [];
    const list = grouped[activeMuscle] || [];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter((ex) => ex.name.toLowerCase().includes(s));
  }, [grouped, activeMuscle, search]);

  const selectedExercises = useMemo(
    () => exercises.filter((e) => selectedIds.has(e.id)),
    [exercises, selectedIds],
  );

  const selectedMuscles = useMemo(
    () => new Set(selectedExercises.map((e) => e.muscle_name)),
    [selectedExercises],
  );

  const crossMuscleWarning = selectedMuscles.size > 1;

  const toggleSelect = (ex: Exercise) => {
    const next = new Set(selectedIds);
    if (next.has(ex.id)) {
      next.delete(ex.id);
      if (next.size === 0) setStandardName("");
    } else {
      next.add(ex.id);
      if (next.size === 1) setStandardName(ex.name);
    }
    setSelectedIds(next);
    setMessage(null);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setStandardName("");
    setMessage(null);
  };

  const handleMerge = async () => {
    if (selectedIds.size < 2) {
      setMessage({ text: "Selecciona al menos 2 ejercicios", type: "error" });
      return;
    }
    if (!standardName.trim()) {
      setMessage({ text: "Escribe el nombre canónico", type: "error" });
      return;
    }

    const firstSelected = selectedExercises[0];
    if (!firstSelected) return;

    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await api.post("/exercises/standardize", {
        standard_name: standardName.trim(),
        exercise_ids_to_merge: Array.from(selectedIds),
        muscle_id: firstSelected.muscle_id,
      });
      setMessage({ text: res.data.message, type: "success" });
      clearSelection();
      await fetchExercises();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : ((err as { response?: { data?: { detail?: string } } })?.response
              ?.data?.detail ?? "Error al estandarizar");
      setMessage({ text: msg, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight">
          Estandarizar Ejercicios
        </h1>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">
          Selecciona ejercicios equivalentes y unificalos bajo un nombre
          canonico
        </p>
      </div>

      <div className="flex gap-5">
        {/* Muscle sidebar */}
        <nav className="w-44 shrink-0 space-y-0.5">
          {muscles.map((muscle) => {
            const count = grouped[muscle]?.length ?? 0;
            const isActive = activeMuscle === muscle;
            const hasSelected = grouped[muscle]?.some((e) =>
              selectedIds.has(e.id),
            );
            return (
              <button
                key={muscle}
                onClick={() => {
                  setActiveMuscle(muscle);
                  setSearch("");
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="capitalize">{muscle}</span>
                <div className="flex items-center gap-1.5">
                  {hasSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                  )}
                  <span
                    className={`text-[11px] tabular-nums ${isActive ? "text-white/60" : "text-slate-600"}`}
                  >
                    {count}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Exercise list */}
        <div className="flex-1 min-w-0">
          <div className="glass-card overflow-hidden">
            {/* Search bar */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
              <Search size={15} className="text-slate-500 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Buscar en ${activeMuscle ?? ""}…`}
                className="flex-1 bg-transparent text-white placeholder:text-slate-600 focus:outline-none text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="text-slate-600 hover:text-white transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* List */}
            <div className="divide-y divide-white/[0.04] max-h-[65vh] overflow-y-auto">
              {visibleExercises.length === 0 ? (
                <div className="py-12 text-center text-slate-600 text-sm">
                  {search ? "Sin coincidencias" : "Sin ejercicios"}
                </div>
              ) : (
                visibleExercises.map((ex) => {
                  const isSelected = selectedIds.has(ex.id);
                  return (
                    <div
                      key={ex.id}
                      onClick={() => toggleSelect(ex)}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/10" : "hover:bg-white/[0.025]"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${
                          isSelected
                            ? "bg-primary border-primary"
                            : "border-slate-700"
                        }`}
                      >
                        {isSelected && (
                          <Check size={10} className="text-white" />
                        )}
                      </div>
                      <span
                        className={`flex-1 text-sm capitalize transition-colors ${
                          isSelected
                            ? "text-white font-medium"
                            : "text-slate-300"
                        }`}
                      >
                        {ex.name}
                      </span>
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded-full tabular-nums ${
                          ex.usage_count > 0
                            ? "bg-white/5 text-slate-500"
                            : "bg-red-500/10 text-red-500/60"
                        }`}
                      >
                        {ex.usage_count}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Merge panel */}
        <div className="w-68 shrink-0 space-y-3" style={{ width: "17rem" }}>
          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Seleccionados ({selectedIds.size})
              </h3>
              {selectedIds.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-slate-600 hover:text-white transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {selectedIds.size === 0 ? (
              <p className="text-slate-600 text-xs text-center py-4 leading-relaxed">
                Haz click en dos o mas ejercicios equivalentes para unificarlos
              </p>
            ) : (
              <div className="space-y-1.5">
                {selectedExercises.map((ex) => (
                  <div key={ex.id} className="flex items-center gap-2 group">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span className="flex-1 text-xs text-white capitalize truncate">
                      {ex.name}
                    </span>
                    <span className="text-[10px] text-slate-600 shrink-0">
                      {ex.muscle_name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(ex);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all shrink-0"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {crossMuscleWarning && (
              <div className="flex items-start gap-2 p-2.5 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                <AlertTriangle
                  size={12}
                  className="text-yellow-400 shrink-0 mt-0.5"
                />
                <p className="text-[11px] text-yellow-400 leading-snug">
                  Ejercicios de grupos musculares distintos
                </p>
              </div>
            )}

            {selectedIds.size >= 1 && (
              <div className="space-y-3 pt-3 border-t border-white/5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Nombre Canonico
                </label>
                <input
                  type="text"
                  value={standardName}
                  onChange={(e) => setStandardName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleMerge()}
                  placeholder="ej: press de banca"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-primary/50 transition-colors text-sm"
                />
                <button
                  onClick={handleMerge}
                  disabled={
                    isSubmitting || selectedIds.size < 2 || !standardName.trim()
                  }
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Link2 size={13} />
                  )}
                  Unificar ({selectedIds.size})
                </button>
              </div>
            )}
          </div>

          {message && (
            <div
              className={`p-3 rounded-lg text-xs font-bold border leading-relaxed ${
                message.type === "success"
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StandardizeExercises;
