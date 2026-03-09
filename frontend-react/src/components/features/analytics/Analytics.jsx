import React, { useState, useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { TrendingUp, Activity } from 'lucide-react';
import { subWeeks, subMonths, subYears, isAfter } from 'date-fns';

function cleanMuscle(text) {
    if (!text) return 'Otros'
    text = text.trim()
    let clean = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    clean = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()

    if (clean === 'Hombros') clean = 'Hombro'
    if (clean === 'Bicep') clean = 'Biceps'
    if (clean === 'Tricep') clean = 'Triceps'
    if (clean === 'Abdomen') clean = 'Abdominales'
    if (['Gemelos', 'Gemelo'].includes(clean)) clean = 'Gemelo'
    if (clean === 'Piernas') clean = 'Pierna'
    if (['Cuadiceps', 'Sentadilla', 'Sentadillas'].includes(clean)) clean = 'Cuadriceps'

    return clean
}

function getSetMuscle(set, workout) {
    let muscle = 'Otros'
    if (set.muscle_group) muscle = set.muscle_group
    else if (workout.muscle_groups) muscle = workout.muscle_groups.split(',')[0].trim()
    return cleanMuscle(muscle)
}

const LEG_MUSCLES = ['Pierna', 'Cuadriceps', 'Femoral', 'Gluteo', 'Gemelo', 'Aductores', 'Isquios'];

function getMacroMuscle(muscle) {
    if (LEG_MUSCLES.includes(muscle)) return 'Pierna';
    return muscle;
}

// Use muscle_groups from the workout title (set by the backend), fall back to 'Otros'
function classifyMuscle(workout) {
    if (workout.muscle_groups) return cleanMuscle(workout.muscle_groups.split(',')[0])
    return 'Otros'
}

const PERIOD_OPTIONS = [
    { label: 'Semana', value: 'week' },
    { label: 'Mes', value: 'month' },
    { label: 'Año', value: 'year' },
];

const MUSCLE_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#ef4444', '#a3e635'];

function getPeriodStart(period) {
    const now = new Date();
    if (period === 'week') return subWeeks(now, 1);
    if (period === 'month') return subMonths(now, 1);
    return subYears(now, 1);
}


function getTotalVolume(set) {
    const vals = [set.value1, set.value2, set.value3, set.value4].filter(v => v != null);
    if (vals.length === 0) return 0;
    const totalWeight = vals.reduce((a, b) => a + b, 0);
    // If reps are recorded, multiply for true volume load; otherwise just sum of set weights
    const reps = set.reps && set.reps > 0 ? set.reps : 1;
    return totalWeight * reps;
}

const PeriodSelector = ({ value, onChange }) => (
    <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
        {PERIOD_OPTIONS.map(opt => (
            <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${value === opt.value
                    ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                    : 'text-gray-500 hover:text-white'
                    }`}
            >
                {opt.label}
            </button>
        ))}
    </div>
);

const MuscleSelector = ({ selected, onChange, muscles }) => (
    <div className="flex flex-wrap gap-2 mb-4">
        <button
            onClick={() => onChange('all')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${selected === 'all'
                ? 'bg-cyan-500 border-cyan-500 text-white'
                : 'border-white/10 text-gray-500 hover:text-white'}`}
        >
            Todos
        </button>
        {muscles.map((m, i) => (
            <button
                key={m}
                onClick={() => onChange(m)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${selected === m
                    ? 'text-white border-transparent'
                    : 'border-white/10 text-gray-500 hover:text-white'}`}
                style={selected === m ? { backgroundColor: MUSCLE_COLORS[i % MUSCLE_COLORS.length] } : {}}
            >
                {m}
            </button>
        ))}
    </div>
);

const CustomTooltip = ({ active, payload, label, unit = 'kg totales' }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#1e293b] border border-white/10 p-4 rounded-2xl shadow-2xl backdrop-blur-md">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">{label}</p>
                <p className="text-white font-black text-xl">{payload[0].value} <span className="text-sm font-normal text-gray-400">{unit}</span></p>
            </div>
        );
    }
    return null;
};

const Analytics = ({ workouts }) => {
    const [volumePeriod, setVolumePeriod] = useState('month');
    const [muscleVolume, setMuscleVolume] = useState('all');
    const [freqPeriod, setFreqPeriod] = useState('month');
    const [muscleFreq, setMuscleFreq] = useState('all');

    // Build sorted + muscle-annotated workouts (only past workouts)
    const annotated = useMemo(() => {
        const now = new Date();
        return (workouts || [])
            .filter(w => new Date(w.date) <= now)
            .map(w => ({
                ...w,
                muscle: classifyMuscle(w),
                totalVol: (w.exercise_sets || []).reduce((acc, s) => acc + getTotalVolume(s), 0)
            }));
    }, [workouts]);

    const IGNORED_MUSCLES = ['Extra', 'Circuito', 'Otros'];

    const availableMuscles = useMemo(() => {
        const set = new Set();
        annotated.forEach(w => {
            set.add(getMacroMuscle(w.muscle)); // Main workout muscle
            w.exercise_sets.forEach(s => {
                set.add(getMacroMuscle(getSetMuscle(s, w))); // Muscles of individual sets
            });
        });
        IGNORED_MUSCLES.forEach(m => set.delete(m));
        return [...set].sort();
    }, [annotated]);

    // ── Volume chart data ──────────────────────────────
    const volumeData = useMemo(() => {
        const periodStart = getPeriodStart(volumePeriod);
        const dailyVolume = {};

        annotated.forEach(w => {
            if (!isAfter(new Date(w.date), periodStart)) return;

            let workoutVol = 0;
            let setsCount = 0;

            if (muscleVolume === 'all') {
                workoutVol = w.totalVol;
                setsCount = w.exercise_sets.length;
            } else {
                w.exercise_sets.forEach(s => {
                    const sMuscle = getMacroMuscle(getSetMuscle(s, w));
                    if (sMuscle === muscleVolume) {
                        workoutVol += getTotalVolume(s);
                        setsCount++;
                    }
                });
            }

            if (setsCount > 0) {
                const dateKey = new Date(w.date).toISOString().split('T')[0];
                if (!dailyVolume[dateKey]) {
                    dailyVolume[dateKey] = {
                        dateObj: new Date(w.date),
                        date: new Date(w.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                        totalWeight: 0,
                        sets: 0
                    };
                }
                dailyVolume[dateKey].totalWeight += workoutVol;
                dailyVolume[dateKey].sets += setsCount;
            }
        });

        return Object.values(dailyVolume)
            .sort((a, b) => a.dateObj - b.dateObj)
            .map(d => ({
                date: d.date,
                totalWeight: Math.round(d.totalWeight),
                sets: d.sets
            }));
    }, [annotated, volumePeriod, muscleVolume]);

    // ── Frequency chart data ──────────────────────────────
    const freqData = useMemo(() => {
        const periodStart = getPeriodStart(freqPeriod);

        // Si estamos viendo "all", contamos en cuántos entrenamientos se ha tocado cada grupo muscular
        if (muscleFreq === 'all') {
            const groups = {};
            annotated.forEach(w => {
                if (isAfter(new Date(w.date), periodStart)) {
                    const musclesInWorkout = new Set();

                    // Extraemos los músculos de todos los ejercicios hechos ese día
                    w.exercise_sets.forEach(s => {
                        musclesInWorkout.add(getMacroMuscle(getSetMuscle(s, w)));
                    });

                    // Por si no hay ejercicios, añadimos también los del título por si acaso
                    if (w.muscle_groups) {
                        w.muscle_groups.split(',').forEach(m => {
                            musclesInWorkout.add(getMacroMuscle(cleanMuscle(m)));
                        });
                    }

                    // Sumamos 1 sesión a cada grupo muscular que se haya tocado ese día
                    musclesInWorkout.forEach(macro => {
                        if (!IGNORED_MUSCLES.includes(macro)) {
                            groups[macro] = (groups[macro] || 0) + 1;
                        }
                    });
                }
            });
            return Object.entries(groups)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value); // Ordenar de más a menos
        }

        // Si hay seleccionado un músculo específico, contamos la frecuencia de cada ejercicio exacto de ese músculo
        const exerciseGroups = {};
        annotated.forEach(w => {
            if (isAfter(new Date(w.date), periodStart)) {
                // Buscamos dentro de los sets los que sean de este músculo
                const exercisesInWorkout = new Set();
                w.exercise_sets.forEach(s => {
                    const sMuscle = getMacroMuscle(getSetMuscle(s, w));
                    if (sMuscle === muscleFreq) {
                        const rawName = s.exercise_name?.trim();
                        if (rawName) {
                            const exName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
                            exercisesInWorkout.add(exName);
                        }
                    }
                });
                exercisesInWorkout.forEach(exName => {
                    exerciseGroups[exName] = (exerciseGroups[exName] || 0) + 1;
                });
            }
        });

        return Object.entries(exerciseGroups)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value); // Ordenar de mayor frecuencia a menor

    }, [annotated, freqPeriod, muscleFreq]);

    return (
        <div className="space-y-8">
            {/* Volume Chart */}
            <div className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-3xl p-8">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <TrendingUp className="text-cyan-400 w-5 h-5" />
                            Volumen de Carga
                        </h3>
                        <p className="text-gray-500 text-xs">Peso máximo por sesión (kg)</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <PeriodSelector value={volumePeriod} onChange={setVolumePeriod} />
                    </div>
                </div>

                <MuscleSelector selected={muscleVolume} onChange={setMuscleVolume} muscles={availableMuscles} />

                <div className="h-[250px] w-full">
                    {volumeData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                            Sin datos para el período seleccionado
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={volumeData}>
                                <defs>
                                    <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#4b5563', fontSize: 10 }} />
                                <YAxis hide />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="totalWeight" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#colorWeight)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Frequency Chart */}
            <div className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-3xl p-8">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <Activity className="text-purple-400 w-5 h-5" />
                            Frecuencia de Entrenamiento
                        </h3>
                        <p className="text-gray-500 text-xs">Sesiones por grupo muscular</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <PeriodSelector value={freqPeriod} onChange={setFreqPeriod} />
                    </div>
                </div>

                <MuscleSelector selected={muscleFreq} onChange={setMuscleFreq} muscles={availableMuscles} />

                <div className="h-[250px] w-full">
                    {freqData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                            Sin datos para el período seleccionado
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={freqData}>
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#4b5563', fontSize: 12 }} />
                                <Tooltip
                                    cursor={{ fill: '#ffffff05' }}
                                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px' }}
                                    formatter={(v) => [v, 'sesiones']}
                                />
                                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                    {freqData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={MUSCLE_COLORS[index % MUSCLE_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Analytics;
