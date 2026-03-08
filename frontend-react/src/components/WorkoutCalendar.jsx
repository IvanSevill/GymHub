import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Target, X, Dumbbell, Clock, Plus, Heart, Flame, MapPin, Mountain, Watch } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    format, addMonths, subMonths, startOfMonth, endOfMonth,
    startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays
} from 'date-fns';
import { es } from 'date-fns/locale';
import CreateEventModal from './workouts/CreateEventModal';

const formatValues = (set) => {
    const vals = [set.value1, set.value2, set.value3, set.value4].filter(v => v != null);
    if (vals.length === 0) return '—';
    return vals.join(' - ') + (set.unit ? set.unit : '');
};

const WorkoutPopup = ({ day, workouts, onClose }) => {
    const dayWorkouts = workouts.filter(w => isSameDay(new Date(w.date), day));

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
                                    {w.fitbit_data && (() => {
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
                                                {azmTotal > 0 && (
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <span className="text-[9px] text-gray-600 font-bold uppercase w-10">AZM</span>
                                                        <div className="flex gap-0.5 flex-1">
                                                            {fd.azm_fat_burn > 0 && <div className="h-1.5 bg-yellow-400 rounded-full" style={{ width: `${fd.azm_fat_burn * 4}px`, maxWidth: '50%' }} />}
                                                            {fd.azm_cardio > 0 && <div className="h-1.5 bg-orange-500 rounded-full" style={{ width: `${fd.azm_cardio * 4}px`, maxWidth: '50%' }} />}
                                                            {fd.azm_peak > 0 && <div className="h-1.5 bg-rose-500 rounded-full" style={{ width: `${fd.azm_peak * 4}px`, maxWidth: '50%' }} />}
                                                        </div>
                                                        <span className="text-[9px] text-gray-500">{azmTotal} min</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

const WorkoutCalendar = ({ workouts, onRefresh }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [popupDay, setPopupDay] = useState(null);
    const [showCreate, setShowCreate] = useState(false);

    const workoutDays = workouts.map(w => new Date(w.date));

    const handleDayClick = (day) => {
        const hasWorkout = workoutDays.some(d => isSameDay(d, day));
        if (hasWorkout) setPopupDay(day);
    };

    const renderHeader = () => (
        <div className="flex items-center justify-between mb-8">
            <div>
                <h3 className="text-2xl font-bold flex items-center gap-3">
                    <CalendarIcon className="text-cyan-400 w-6 h-6" />
                    Calendario de Actividad
                </h3>
                <p className="text-gray-500 text-sm font-medium">Haz clic en un día entrenado para ver los detalles</p>
            </div>
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 px-4 py-2.5 rounded-2xl font-bold text-sm transition-all"
                >
                    <Plus className="w-4 h-4" /> Planificar
                </button>
                <button
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors border border-white/5"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-lg font-black min-w-[140px] text-center capitalize">
                    {format(currentMonth, 'MMMM yyyy', { locale: es })}
                </span>
                <button
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors border border-white/5"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>
        </div>
    );

    const renderDays = () => {
        const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        return (
            <div className="grid grid-cols-7 mb-4">
                {days.map(day => (
                    <div key={day} className="text-center text-gray-600 text-xs font-black uppercase tracking-widest pb-2">
                        {day}
                    </div>
                ))}
            </div>
        );
    };

    const renderCells = () => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
        const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

        const rows = [];
        let days = [];
        let day = startDate;

        while (day <= endDate) {
            for (let i = 0; i < 7; i++) {
                const cloneDay = day;
                const formattedDate = format(day, 'd');
                const dayWorkouts = workouts.filter(d => isSameDay(new Date(d.date), cloneDay));
                const hasWorkout = dayWorkouts.length > 0;
                const isCurrentMonth = isSameMonth(day, monthStart);
                const isToday = isSameDay(day, new Date());

                // Decide color based on workout types
                const hasCardio = dayWorkouts.some(w => w.muscle_groups?.includes('Cardio') || w.source === 'fitbit' && !w.exercise_sets?.length);
                const hasMuscle = dayWorkouts.some(w => w.muscle_groups && w.muscle_groups !== 'Cardio');

                const theme = hasMuscle ? 'cyan' : (hasCardio ? 'emerald' : 'cyan');
                const ThemeIcon = hasMuscle ? Target : Heart;

                const classes = {
                    cyan: {
                        hoverBg: 'hover:bg-cyan-500/5',
                        textToday: 'text-cyan-400',
                        bgToday: 'bg-cyan-400/10',
                        bgPulse: 'bg-cyan-500/10',
                        textPrimary: 'text-cyan-400',
                        dropShadow: 'drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]',
                        bgBar: 'bg-cyan-500',
                        shadowBar: 'shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                    },
                    emerald: {
                        hoverBg: 'hover:bg-emerald-500/5',
                        textToday: 'text-emerald-400',
                        bgToday: 'bg-emerald-400/10',
                        bgPulse: 'bg-emerald-500/10',
                        textPrimary: 'text-emerald-400',
                        dropShadow: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]',
                        bgBar: 'bg-emerald-500',
                        shadowBar: 'shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    }
                }[theme];

                days.push(
                    <div
                        key={day.toString()}
                        onClick={() => isCurrentMonth && handleDayClick(cloneDay)}
                        className={`relative h-20 md:h-24 border border-white/[0.03] p-2 transition-all
                            ${!isCurrentMonth ? 'opacity-20 pointer-events-none' : ''}
                            ${hasWorkout && isCurrentMonth ? `cursor-pointer ${classes.hoverBg}` : ''}
                        `}
                    >
                        <span className={`text-sm font-bold ${isToday ? `${classes.textToday} ${classes.bgToday} px-2 py-1 rounded-lg` : 'text-gray-500'}`}>
                            {formattedDate}
                        </span>

                        {hasWorkout && isCurrentMonth && (
                            <>
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className={`w-12 h-12 ${classes.bgPulse} rounded-full blur-md`} />
                                    <div className="absolute w-8 h-8 flex items-center justify-center">
                                        <ThemeIcon className={`${classes.textPrimary} w-6 h-6 ${classes.dropShadow}`} />
                                    </div>
                                </div>
                                <div className="absolute bottom-2 left-2 right-2">
                                    <div className={`h-1 w-full ${classes.bgBar} rounded-full ${classes.shadowBar}`} />
                                </div>
                            </>
                        )}
                    </div>
                );
                day = addDays(day, 1);
            }
            rows.push(
                <div className="grid grid-cols-7" key={day.toString()}>
                    {days}
                </div>
            );
            days = [];
        }
        return <div className="rounded-3xl border border-white/5 overflow-hidden bg-black/20 backdrop-blur-sm">{rows}</div>;
    };

    return (
        <>
            <div className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-[40px] p-8 md:p-12">
                {renderHeader()}
                {renderDays()}
                {renderCells()}
            </div>
            {popupDay && (
                <WorkoutPopup
                    day={popupDay}
                    workouts={workouts}
                    onClose={() => setPopupDay(null)}
                />
            )}
            {showCreate && (
                <CreateEventModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => {
                        setShowCreate(false);
                        if (onRefresh) onRefresh();
                    }}
                />
            )}
        </>
    );
};

export default WorkoutCalendar;
