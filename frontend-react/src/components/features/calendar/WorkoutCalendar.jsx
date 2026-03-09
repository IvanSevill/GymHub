import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Target, X, Dumbbell, Clock, Plus, Heart, Flame, MapPin, Mountain, Watch } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    format, addMonths, subMonths, startOfMonth, endOfMonth,
    startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, startOfDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import CreateEventModal from '../workouts/CreateEventModal';
import WorkoutPopup from './WorkoutPopup';

const WorkoutCalendar = ({ workouts, onRefresh, isFitbitConnected }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(null);
    const [showCreate, setShowCreate] = useState(false);

    const workoutDays = workouts.map(w => new Date(w.date));

    const handleDayClick = (day) => {
        const hasWorkout = workoutDays.some(d => isSameDay(d, day));
        if (hasWorkout) setSelectedDay(day);
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

        const monthWorkouts = (workouts || []).filter(w => {
            const d = new Date(w.date);
            return !isNaN(d) && isSameMonth(d, monthStart);
        });

        const rows = [];
        let days = [];
        let day = startDate;

        while (day <= endDate) {
            for (let i = 0; i < 7; i++) {
                const cloneDay = day;
                const formattedDate = format(day, 'd');
                const dayWorkouts = (workouts || []).filter(w => {
                    const wDate = new Date(w.date);
                    return !isNaN(wDate) && isSameDay(wDate, cloneDay);
                });
                const hasWorkout = dayWorkouts.length > 0;
                const isCurrentMonth = isSameMonth(day, monthStart);
                const isToday = isSameDay(day, new Date());
                const isFutureOrToday = startOfDay(day) >= startOfDay(new Date());

                // Un entrenamiento "planeado" es de origen calendar y aún no tiene métricas reales registradas
                const isAllPlanned = hasWorkout && dayWorkouts.every(w => {
                    if (w.source !== 'calendar') return false;
                    if (w.fitbit_data) return false;
                    if (w.exercise_sets && w.exercise_sets.length > 0) {
                        const hasValues = w.exercise_sets.some(s => s.value1 !== null || s.value2 !== null || s.value3 !== null || s.value4 !== null);
                        if (hasValues) return false;
                    }
                    return true;
                });

                // Decide color based on workout types
                const hasCardio = dayWorkouts.some(w => (w.muscle_groups && String(w.muscle_groups).includes('Cardio')) || (w.source === 'fitbit' && (!w.exercise_sets || w.exercise_sets.length === 0)));
                const hasMuscle = dayWorkouts.some(w => w.muscle_groups && !String(w.muscle_groups).includes('Cardio'));

                let theme = hasMuscle ? 'cyan' : (hasCardio ? 'emerald' : 'cyan');
                let ThemeIcon = hasMuscle ? Target : Heart;

                // Solo vemos como "Planeado" si es hoy o en el futuro y NO se ha completado
                if (isAllPlanned && isFutureOrToday) {
                    theme = 'indigo';
                    ThemeIcon = Watch; // Use Watch or Clock to indicate "Planned"
                }

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
                    },
                    indigo: {
                        hoverBg: 'hover:bg-indigo-500/5',
                        textToday: 'text-indigo-400',
                        bgToday: 'bg-indigo-400/10',
                        bgPulse: 'bg-indigo-500/10',
                        textPrimary: 'text-indigo-400',
                        dropShadow: 'drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]',
                        bgBar: 'bg-indigo-500/50',
                        shadowBar: 'shadow-[0_0_10px_rgba(99,102,241,0.2)]',
                        border: 'border-indigo-500/30 border-dashed bg-indigo-500/5'
                    }
                }[theme];

                days.push(
                    <div
                        key={day.toString()}
                        onClick={() => isCurrentMonth && handleDayClick(cloneDay)}
                        className={`relative h-20 md:h-24 border border-white/[0.03] p-2 transition-all
                            ${!isCurrentMonth ? 'opacity-20 pointer-events-none' : ''}
                            ${hasWorkout && isCurrentMonth ? `cursor-pointer ${classes.hoverBg} ${classes.border || ''}` : ''}
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
        return (
            <div className="rounded-3xl border border-white/5 overflow-hidden bg-black/20 backdrop-blur-sm relative">
                {rows}
                {monthWorkouts.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">No hay actividad este mes</p>
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <div className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-[40px] p-8 md:p-12">
                {renderHeader()}
                {renderDays()}
                {renderCells()}
            </div>
            {selectedDay && (
                <WorkoutPopup
                    day={selectedDay}
                    workouts={workouts}
                    onClose={() => setSelectedDay(null)}
                    onUpdated={onRefresh}
                    isFitbitConnected={isFitbitConnected}
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
