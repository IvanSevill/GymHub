import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Target } from 'lucide-react';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    isSameMonth,
    isSameDay,
    addDays,
    eachDayOfInterval
} from 'date-fns';
import { es } from 'date-fns/locale';

const WorkoutCalendar = ({ workouts }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(new Date());

    const workoutDays = workouts.map(w => new Date(w.date));

    const workoutsOnSelectedDay = workouts.filter(w => isSameDay(new Date(w.date), selectedDay));

    const renderHeader = () => (
        <div className="flex items-center justify-between mb-8">
            <div>
                <h3 className="text-2xl font-bold flex items-center gap-3">
                    <CalendarIcon className="text-cyan-400 w-6 h-6" />
                    Calendario de Actividad
                </h3>
                <p className="text-gray-500 text-sm font-medium">Consistencia de entrenamiento mensual</p>
            </div>
            <div className="flex items-center gap-4">
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
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
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
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        const dateFormat = "d";
        const rows = [];
        let days = [];
        let day = startDate;
        let formattedDate = "";

        while (day <= endDate) {
            for (let i = 0; i < 7; i++) {
                formattedDate = format(day, dateFormat);
                const cloneDay = day;

                const hasWorkout = workoutDays.some(d => isSameDay(d, cloneDay));
                const isCurrentMonth = isSameMonth(day, monthStart);

                days.push(
                    <div
                        key={day}
                        onClick={() => setSelectedDay(cloneDay)}
                        className={`relative h-20 md:h-24 border border-white/[0.03] p-2 transition-all cursor-pointer ${!isCurrentMonth ? 'opacity-20 pointer-events-none' : 'hover:bg-white/5'
                            } ${isSameDay(day, selectedDay) ? 'bg-cyan-500/5 ring-1 ring-inset ring-cyan-500/30' : ''}`}
                    >
                        <span className={`text-sm font-bold ${isSameDay(day, new Date()) ? 'text-cyan-400 bg-cyan-400/10 px-2 py-1 rounded-lg' : 'text-gray-500'}`}>
                            {formattedDate}
                        </span>

                        {hasWorkout && isCurrentMonth && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-12 h-12 bg-cyan-500/10 rounded-full animate-pulse blur-md" />
                                <div className="absolute w-8 h-8 flex items-center justify-center">
                                    <Target className="text-cyan-400 w-6 h-6 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                                </div>
                            </div>
                        )}

                        {hasWorkout && isCurrentMonth && (
                            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                                <div className="h-1 flex-1 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.3)]" />
                            </div>
                        )}
                    </div>
                );
                day = addDays(day, 1);
            }
            rows.push(
                <div className="grid grid-cols-7" key={day}>
                    {days}
                </div>
            );
            days = [];
        }
        return <div className="rounded-3xl border border-white/5 overflow-hidden bg-black/20 backdrop-blur-sm">{rows}</div>;
    };

    return (
        <div className="space-y-8">
            <div className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-[40px] p-8 md:p-12">
                {renderHeader()}
                {renderDays()}
                {renderCells()}
            </div>

            {/* Daily Details */}
            <div className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-[40px] p-8">
                <h4 className="text-xl font-bold mb-6 flex items-center gap-2">
                    Entrenamientos del {format(selectedDay, "d 'de' MMMM", { locale: es })}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {workoutsOnSelectedDay.length > 0 ? (
                        workoutsOnSelectedDay.map((w, idx) => (
                            <div key={idx} className="p-6 bg-white/5 rounded-3xl border border-white/5">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-cyan-400 font-bold">●</span>
                                    <span className="font-bold text-lg">{w.title}</span>
                                </div>
                                <div className="space-y-2">
                                    {w.exercise_sets.map((s, i) => (
                                        <div key={i} className="flex justify-between text-sm">
                                            <span className="text-gray-400">{s.exercise_name}</span>
                                            <span className="font-bold text-purple-400">{s.weight_kg}kg</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500 italic p-4">No hay entrenamientos registrados para este día.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorkoutCalendar;
