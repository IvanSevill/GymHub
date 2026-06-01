import React, { useEffect, useState } from "react";
import { format, parseISO, isFuture } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  Loader2,
  Pencil,
  Trash2,
  Activity,
  Calendar as CalIcon,
  Clock,
} from "lucide-react";
import type { Workout } from "../../services/workout";
import type { DraftSet } from "./types";
import {
  CardioBody,
  FutureBody,
  MuscleLabel,
  WeightsBody,
} from "./WorkoutBodies";
import EditBody from "./EditBody";
import WheelPicker from "./WheelPicker";
import { groupWorkoutSets, isCardioWorkout } from "./helpers";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);

interface TimeEdit {
  startH: number;
  startM: number;
  endH: number;
  endM: number;
}

interface Props {
  selectedDay: { date: Date; workouts: Workout[] } | null;
  editingWorkoutId: string | null;
  draftSets: DraftSet[];
  isSaving: boolean;
  onClose: () => void;
  onEnterEdit: (workout: Workout) => void;
  onCancelEdit: () => void;
  onSaveEdit: (workout: Workout) => void;
  onDraftChange: (sets: DraftSet[]) => void;
  onDelete: (workoutId: string) => Promise<void>;
  onUpdateTime: (
    workoutId: string,
    startTime: string,
    endTime: string,
  ) => Promise<void>;
}

const DayDetailModal: React.FC<Props> = ({
  selectedDay,
  editingWorkoutId,
  draftSets,
  isSaving,
  onClose,
  onEnterEdit,
  onCancelEdit,
  onSaveEdit,
  onDraftChange,
  onDelete,
  onUpdateTime,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [timeEditId, setTimeEditId] = useState<string | null>(null);
  const [timeEdit, setTimeEdit] = useState<TimeEdit | null>(null);
  const [isSavingTime, setIsSavingTime] = useState(false);

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteConfirmId);
      setDeleteConfirmId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setDeleteConfirmId(null);
    setTimeEditId(null);
    setTimeEdit(null);
    onClose();
  };

  const startTimeEdit = (w: Workout) => {
    const start = parseISO(w.start_time);
    const end = parseISO(w.end_time);
    setTimeEdit({
      startH: start.getHours(),
      startM: start.getMinutes(),
      endH: end.getHours(),
      endM: end.getMinutes(),
    });
    setTimeEditId(w.id);
  };

  const cancelTimeEdit = () => {
    setTimeEditId(null);
    setTimeEdit(null);
  };

  const saveTime = async () => {
    if (!timeEditId || !timeEdit || !selectedDay) return;
    const w = selectedDay.workouts.find((x) => x.id === timeEditId);
    if (!w) return;

    const base = parseISO(w.start_time);
    const makeISO = (h: number, m: number) => {
      const d = new Date(base);
      d.setHours(h, m, 0, 0);
      return d.toISOString().replace(/\.\d{3}Z$/, "");
    };

    setIsSavingTime(true);
    try {
      await onUpdateTime(
        timeEditId,
        makeISO(timeEdit.startH, timeEdit.startM),
        makeISO(timeEdit.endH, timeEdit.endM),
      );
      cancelTimeEdit();
    } finally {
      setIsSavingTime(false);
    }
  };

  // Auto-open time editor when the selected day has only future workouts
  useEffect(() => {
    if (!selectedDay) return;
    const futureWorkouts = selectedDay.workouts.filter((w) =>
      isFuture(parseISO(w.start_time)),
    );
    if (futureWorkouts.length > 0 && !timeEditId && !editingWorkoutId) {
      startTimeEdit(futureWorkouts[0]);
    }
  }, [selectedDay?.workouts.map((w) => w.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const isInTimeEdit = (wId: string) => timeEditId === wId;

  return (
    <AnimatePresence>
      {selectedDay && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/95 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-surface rounded-t-[2.5rem] sm:rounded-[2.5rem] border border-white/10 shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col z-10"
          >
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02] rounded-t-[2.5rem]">
              <div>
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">
                  {format(selectedDay.date, "PPP", { locale: es })}
                </p>
                <h3 className="text-lg font-black text-white tracking-tight uppercase leading-none">
                  {selectedDay.workouts[0]?.title || "Sesión"}
                </h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                    <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">
                      BD
                    </span>
                  </span>
                  {selectedDay.workouts.some((w) => w.google_event_id) && (
                    <span className="flex items-center gap-1">
                      <CalIcon size={9} className="text-slate-500" />
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                        Calendar
                      </span>
                    </span>
                  )}
                  {selectedDay.workouts.some((w) => w.fitbit_data) && (
                    <span className="flex items-center gap-1">
                      <Activity size={9} className="text-blue-400/70" />
                      <span className="text-[8px] font-bold text-blue-400/70 uppercase tracking-widest">
                        Fitbit
                      </span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {selectedDay.workouts.map((w) => {
                  const future = isFuture(parseISO(w.start_time));
                  const notEditing =
                    editingWorkoutId !== w.id && timeEditId !== w.id;
                  return (
                    <React.Fragment key={w.id}>
                      {/* Pencil — only for past workouts that are not cardio */}
                      {!future && !isCardioWorkout(w) && notEditing && (
                        <button
                          onClick={() => onEnterEdit(w)}
                          className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-500 hover:text-primary"
                          title="Editar ejercicios"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {/* Clock — only for future workouts */}
                      {future && notEditing && (
                        <button
                          onClick={() => startTimeEdit(w)}
                          className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-500 hover:text-primary"
                          title="Editar horario"
                        >
                          <Clock size={15} />
                        </button>
                      )}
                      {/* Trash — always shown when not editing */}
                      {notEditing && (
                        <button
                          onClick={() =>
                            setDeleteConfirmId(
                              deleteConfirmId === w.id ? null : w.id,
                            )
                          }
                          className={`p-2 rounded-xl transition-colors ${
                            deleteConfirmId === w.id
                              ? "bg-danger/15 text-danger"
                              : "hover:bg-white/5 text-slate-500 hover:text-danger"
                          }`}
                          title="Eliminar"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </React.Fragment>
                  );
                })}
                <button
                  onClick={handleClose}
                  className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-500 hover:text-white ml-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Workout bodies */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {selectedDay.workouts.map((workout, wIdx) => {
                const future = isFuture(parseISO(workout.start_time));
                const cardio = isCardioWorkout(workout);
                const isEditing = editingWorkoutId === workout.id;
                const isTimeEditing = isInTimeEdit(workout.id);

                return (
                  <div key={wIdx}>
                    {selectedDay.workouts.length > 1 && (
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3">
                        {workout.title} ·{" "}
                        {format(parseISO(workout.start_time), "HH:mm")}
                      </p>
                    )}

                    {isTimeEditing && timeEdit ? (
                      <TimeEditView
                        workout={workout}
                        timeEdit={timeEdit}
                        onChange={setTimeEdit}
                      />
                    ) : isEditing ? (
                      <EditBody
                        draftSets={draftSets}
                        onChange={onDraftChange}
                      />
                    ) : future ? (
                      <FutureBody workout={workout} />
                    ) : cardio ? (
                      <CardioBody workout={workout} />
                    ) : (
                      <WeightsBody workout={workout} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/5 bg-black/20 rounded-b-[2.5rem]">
              {deleteConfirmId ? (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-danger text-center leading-relaxed">
                    ¿Eliminar esta sesión?
                    {selectedDay.workouts.find((w) => w.id === deleteConfirmId)
                      ?.google_event_id && (
                      <span className="block text-slate-500 mt-0.5">
                        También se borrará el evento de Google Calendar.
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      disabled={isDeleting}
                      className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="flex-1 py-3 rounded-2xl bg-danger text-white font-black text-[10px] uppercase tracking-widest hover:bg-danger/90 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {isDeleting ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Eliminar
                    </button>
                  </div>
                </div>
              ) : timeEditId ? (
                <div className="flex gap-2">
                  <button
                    onClick={cancelTimeEdit}
                    disabled={isSavingTime}
                    className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveTime}
                    disabled={isSavingTime}
                    className="flex-1 py-3 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {isSavingTime ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    Guardar hora
                  </button>
                </div>
              ) : editingWorkoutId ? (
                <div className="flex gap-2">
                  <button
                    onClick={onCancelEdit}
                    disabled={isSaving}
                    className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      const w = selectedDay.workouts.find(
                        (w) => w.id === editingWorkoutId,
                      );
                      if (w) onSaveEdit(w);
                    }}
                    disabled={isSaving}
                    className="flex-1 py-3 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {isSaving ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    Guardar
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all"
                >
                  Cerrar
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/* ── Time edit view ─────────────────────────────────────────── */

interface TimeEditViewProps {
  workout: Workout;
  timeEdit: TimeEdit;
  onChange: (t: TimeEdit) => void;
}

const TimeEditView: React.FC<TimeEditViewProps> = ({
  workout,
  timeEdit,
  onChange,
}) => {
  const muscleGroups = groupWorkoutSets(workout.exercise_sets);

  return (
    <div className="space-y-6">
      {/* Two-wheel time pickers */}
      <div className="grid grid-cols-2 gap-4">
        {/* Start time */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            Inicio
          </p>
          <div
            className="flex items-center gap-1 rounded-2xl px-2 py-1"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <WheelPicker
              items={HOURS}
              selectedIndex={timeEdit.startH}
              onChange={(h) => onChange({ ...timeEdit, startH: h })}
            />
            <span className="text-2xl font-black text-slate-600 pb-0.5">:</span>
            <WheelPicker
              items={MINUTES}
              selectedIndex={timeEdit.startM}
              onChange={(m) => onChange({ ...timeEdit, startM: m })}
            />
          </div>
        </div>

        {/* End time */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
            Fin
          </p>
          <div
            className="flex items-center gap-1 rounded-2xl px-2 py-1"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <WheelPicker
              items={HOURS}
              selectedIndex={timeEdit.endH}
              onChange={(h) => onChange({ ...timeEdit, endH: h })}
            />
            <span className="text-2xl font-black text-slate-600 pb-0.5">:</span>
            <WheelPicker
              items={MINUTES}
              selectedIndex={timeEdit.endM}
              onChange={(m) => onChange({ ...timeEdit, endM: m })}
            />
          </div>
        </div>
      </div>

      {/* Muscle groups — read only */}
      {muscleGroups.length > 0 && (
        <div className="space-y-3">
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
            Grupos musculares
          </p>
          {muscleGroups.map((mg) => (
            <div key={mg.name}>
              <MuscleLabel name={mg.name} />
              <div className="mt-1 flex flex-wrap gap-1.5 px-1">
                {mg.exercises.map((eg) => (
                  <span
                    key={eg.name}
                    className="px-2.5 py-1 rounded-xl bg-white/[0.04] border border-white/8 text-[10px] font-semibold text-slate-400 capitalize"
                  >
                    {eg.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DayDetailModal;
