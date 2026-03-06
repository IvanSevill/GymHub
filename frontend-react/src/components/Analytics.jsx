import React, { useState, useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { TrendingUp, Activity } from 'lucide-react';
import { subWeeks, subMonths, subYears, isAfter } from 'date-fns';

// Use muscle_groups from the workout title (set by the backend), fall back to 'Otros'
function classifyMuscle(workout) {
    if (workout.muscle_groups) return workout.muscle_groups.split(',')[0].trim()
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

const CustomTooltip = ({ active, payload, label, unit = 'kg total' }) => {
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

    // Build sorted + muscle-annotated workouts
    const annotated = useMemo(() => workouts.map(w => ({
        ...w,
        muscle: classifyMuscle(w),
        totalVol: w.exercise_sets.reduce((acc, s) => acc + getTotalVolume(s), 0)
    })), [workouts]);

    const availableMuscles = useMemo(() => {
        const set = new Set(annotated.map(w => w.muscle));
        return [...set].sort();
    }, [annotated]);

    // ── Volume chart data ──────────────────────────────
    const volumeData = useMemo(() => {
        const periodStart = getPeriodStart(volumePeriod);
        return annotated
            .filter(w => isAfter(new Date(w.date), periodStart))
            .filter(w => muscleVolume === 'all' || w.muscle === muscleVolume)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map(w => ({
                date: new Date(w.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                totalWeight: Math.round(w.totalVol),
                sets: w.exercise_sets.length
            }));
    }, [annotated, volumePeriod, muscleVolume]);

    // ── Frequency chart data ──────────────────────────────
    const freqData = useMemo(() => {
        const periodStart = getPeriodStart(freqPeriod);
        const filtered = annotated
            .filter(w => isAfter(new Date(w.date), periodStart))
            .filter(w => muscleFreq === 'all' || w.muscle === muscleFreq);

        const groups = filtered.reduce((acc, w) => {
            acc[w.muscle] = (acc[w.muscle] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(groups).map(([name, value]) => ({ name, value }));
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
