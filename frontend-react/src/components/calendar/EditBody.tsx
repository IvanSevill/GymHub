import React, { useMemo } from "react";
import { X, Check, Plus } from "lucide-react";
import type { DraftSet } from "./types";
import { MEASUREMENTS } from "./types";
import { groupDraftSets } from "./helpers";
import { MuscleLabel } from "./WorkoutBodies";

const DraftSetRow: React.FC<{
  set: DraftSet;
  onUpdate: (patch: Partial<DraftSet>) => void;
  onRemove: () => void;
}> = ({ set, onUpdate, onRemove }) => (
  <div className="flex items-center gap-1.5 bg-black/20 rounded-lg px-2 py-1.5">
    <button
      onClick={() => onUpdate({ is_completed: !set.is_completed })}
      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
        set.is_completed
          ? "bg-primary border-primary"
          : "border-slate-700 hover:border-slate-500"
      }`}
    >
      {set.is_completed && <Check size={10} className="text-white" />}
    </button>
    <input
      type="text"
      value={set.value}
      onChange={(e) => onUpdate({ value: e.target.value })}
      placeholder="0"
      className="w-16 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs font-black text-white placeholder:text-slate-700 focus:outline-none focus:border-primary/50 text-center tabular-nums"
    />
    <select
      value={set.measurement}
      onChange={(e) => onUpdate({ measurement: e.target.value })}
      className="bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-xs font-black text-slate-400 focus:outline-none focus:border-primary/50"
    >
      {MEASUREMENTS.map((m) => (
        <option key={m} value={m} className="bg-surface text-white">
          {m}
        </option>
      ))}
    </select>
    <button
      onClick={onRemove}
      className="ml-auto text-slate-700 hover:text-red-400 transition-colors"
    >
      <X size={13} />
    </button>
  </div>
);

const EditBody: React.FC<{
  draftSets: DraftSet[];
  onChange: (sets: DraftSet[]) => void;
}> = ({ draftSets, onChange }) => {
  const groups = useMemo(() => groupDraftSets(draftSets), [draftSets]);
  const sortedMuscles = useMemo(() => Object.keys(groups).sort(), [groups]);

  const updateSet = (idx: number, patch: Partial<DraftSet>) => {
    const next = [...draftSets];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeSet = (idx: number) =>
    onChange(draftSets.filter((_, i) => i !== idx));

  const addSet = (
    exercise_id: string,
    exercise_name: string,
    muscle_name: string,
    muscle_id: string,
  ) => {
    const existing = draftSets.filter((s) => s.exercise_id === exercise_id);
    const meas =
      existing.length > 0 ? existing[existing.length - 1].measurement : "kg";
    onChange([
      ...draftSets,
      {
        exercise_id,
        exercise_name,
        muscle_name,
        muscle_id,
        value: "",
        measurement: meas,
        is_completed: false,
      },
    ]);
  };

  return (
    <div className="space-y-5">
      {sortedMuscles.map((muscleName) => {
        const { muscle_id, exercises } = groups[muscleName];
        const sortedExIds = Object.keys(exercises).sort();
        return (
          <div key={muscleName} className="space-y-2">
            <MuscleLabel name={muscleName} />
            {sortedExIds.map((exId) => {
              const sets = exercises[exId];
              const exName = sets[0].exercise_name;
              const globalIndices = sets.map((s) => draftSets.indexOf(s));
              return (
                <div
                  key={exId}
                  className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden"
                >
                  <p className="text-xs font-black text-white capitalize px-3 pt-2.5 pb-1">
                    {exName}
                  </p>
                  <div className="px-2 pb-2 space-y-1">
                    {globalIndices.map((gIdx) => (
                      <DraftSetRow
                        key={gIdx}
                        set={draftSets[gIdx]}
                        onUpdate={(patch) => updateSet(gIdx, patch)}
                        onRemove={() => removeSet(gIdx)}
                      />
                    ))}
                    <button
                      onClick={() =>
                        addSet(exId, exName, muscleName, muscle_id)
                      }
                      className="flex items-center gap-1 text-[10px] font-black text-slate-600 hover:text-primary transition-colors px-1 pt-0.5"
                    >
                      <Plus size={11} />
                      set
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default EditBody;
