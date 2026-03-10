import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Dumbbell, Clock, Watch, Heart, Flame, MapPin, Mountain } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import WorkoutEditorModal from '../workouts/WorkoutEditorModal';

const formatValues = (set) => {
    return set.weight_display || '—';
};

const WorkoutPopup = ({ day, workouts, onClose, isFitbitConnected, onUpdated }) => {
    const [editingWorkout, setEditingWorkout] = React.useState(null);

    const dayWorkouts = (workouts || []).filter(w => {
        const d = new Date(w.date);
        return !isNaN(d) && isSameDay(d, day);
    });

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    onClick={e => e.stopPropagation()}
                    className="bg-[#0f172a] border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-2xl font-black capitalize">
                                {format(day, "EEEE d 'de' MMMM", { locale: es })}
                            </h3>
                            <p className="text-gray-500 text-sm">{dayWorkouts.length} sesión(es)</p>
                        </div>
                        <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    {dayWorkouts.length === 0 ? (
                        <p className="text-gray-500 italic text-center py-8">Sin entrenamientos este día.</p>
                    ) : (
                        <div className="space-y-6">
                            {dayWorkouts.map((w, idx) => (
                                <div key={idx}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-cyan-500/20 rounded-2xl flex items-center justify-center">
                                            <Dumbbell className="w-5 h-5 text-cyan-400" />
                                        </div>
                                        <div>
                                            <p className="font-black text-lg">{w.title}</p>
                                            {w.start_time && w.end_time && (
                                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {format(new Date(w.start_time), 'HH:mm')} – {format(new Date(w.end_time), 'HH:mm')}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => setEditingWorkout(w)}
                                            className="ml-auto px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase rounded-lg border border-cyan-500/20 transition-all"
                                        >
                                            Actualizar
                                        </button>
                                    </div>

                                    {w.exercise_sets.length > 0 ? (
                                        <div className="space-y-2 pl-2">
                                            {w.exercise_sets.map((s, i) => (
                                                <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                                                    <div className="flex items-center gap-2">
                                                        {s.is_pr === 1 && (
                                                            <span className="text-[9px] font-black bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">PR</span>
                                                        )}
                                                        <span className="text-gray-300 text-sm font-medium">{s.exercise_name}</span>
                                                    </div>
                                                    <span className="font-black text-cyan-300 text-sm">{formatValues(s)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-gray-600 text-sm italic pl-2">Sin ejercicios registrados.</p>
                                    )}

                                    {/* Fitbit metrics */}
                                    {isFitbitConnected && w.fitbit_data && (() => {
                                        const fd = w.fitbit_data;
                                        const azmTotal = (fd.azm_fat_burn || 0) + (fd.azm_cardio || 0) + (fd.azm_peak || 0);
                                        return (
                                            <div className="mt-4 p-3 bg-cyan-500/5 rounded-2xl border border-cyan-500/10 space-y-2">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Watch className="text-cyan-400 w-3 h-3" />
                                                    <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Fitbit</span>
                                                    {fd.activity_name && (
                                                        <span className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded-full text-gray-500">{fd.activity_name}</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                                    {fd.heart_rate_avg && (
                                                        <span className="flex items-center gap-1 text-xs text-gray-300">
                                                            <Heart className="text-rose-400 w-3 h-3" />{fd.heart_rate_avg} bpm
                                                        </span>
                                                    )}
                                                    {fd.calories && (
                                                        <span className="flex items-center gap-1 text-xs text-gray-300">
                                                            <Flame className="text-orange-400 w-3 h-3" />{fd.calories} kcal
                                                        </span>
                                                    )}
                                                    {fd.duration_ms && (
                                                        <span className="flex items-center gap-1 text-xs text-gray-300">
                                                            <Clock className="text-blue-400 w-3 h-3" />{Math.round(fd.duration_ms / 60000)} min
                                                        </span>
                                                    )}
                                                    {fd.distance_km && (
                                                        <span className="flex items-center gap-1 text-xs text-gray-300">
                                                            <MapPin className="text-cyan-400 w-3 h-3" />{fd.distance_km.toFixed(2)} km
                                                        </span>
                                                    )}
                                                    {fd.elevation_gain_m > 0 && (
                                                        <span className="flex items-center gap-1 text-xs text-gray-300">
                                                            <Mountain className="text-purple-400 w-3 h-3" />{Math.round(fd.elevation_gain_m)} m
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            </motion.div>

            {editingWorkout && (
                <WorkoutEditorModal
                    workout={editingWorkout}
                    onClose={() => setEditingWorkout(null)}
                    onUpdated={() => {
                        onUpdated();
                        onClose();
                    }}
                />
            )}
        </AnimatePresence>
    );
};

export default WorkoutPopup;
