import React, { useMemo } from 'react';
import { Heart, Footprints, Flame, Activity, Mountain, MapPin, Timer, Zap, TrendingUp, Watch } from 'lucide-react';
import { motion } from 'framer-motion';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#1e293b] border border-white/10 p-4 rounded-2xl shadow-2xl backdrop-blur-md">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">{label}</p>
                {payload.map((p, idx) => (
                    <p key={idx} className="text-white font-black text-sm flex justify-between items-center gap-4">
                        <span style={{ color: p.color }}>{p.name}:</span>
                        <span>{p.value} {p.unit || ''}</span>
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

const StatCard = ({ icon, label, value, unit, color, accent, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        className="bg-[#1e293b]/40 border border-white/5 p-5 rounded-3xl relative overflow-hidden group hover:border-white/20 transition-all"
    >
        <div className={`absolute top-0 right-0 p-5 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
            {React.cloneElement(icon, { size: 56 })}
        </div>
        <div className="relative z-10">
            <div className={`p-2.5 bg-white/5 rounded-xl inline-flex mb-3 ${color}`}>{icon}</div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">{label}</p>
            <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black">{value ?? '–'}</span>
                <span className="text-gray-500 text-sm">{unit}</span>
            </div>
        </div>
    </motion.div>
);

const AzmBar = ({ label, minutes, color }) => (
    <div className="flex items-center gap-3">
        <div className="w-20 text-right">
            <span className="text-xs font-bold text-gray-400">{label}</span>
        </div>
        <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(minutes * 3, 100)}%` }}
                transition={{ duration: 0.8 }}
                className={`h-full rounded-full ${color}`}
            />
        </div>
        <span className="text-xs font-black text-white w-12">{minutes ?? 0} min</span>
    </div>
);

const FitbitPanel = ({ workouts = [], userName }) => {
    const fitbitWorkouts = useMemo(() =>
        [...workouts]
            .filter(w => w.fitbit_data)
            .sort((a, b) => new Date(a.date) - new Date(b.date)),
        [workouts]
    );

    const hasRealData = fitbitWorkouts.length > 0;
    const lastSession = hasRealData ? fitbitWorkouts[fitbitWorkouts.length - 1]?.fitbit_data : null;

    const chartData = useMemo(() =>
        fitbitWorkouts.map(w => ({
            dateStr: new Date(w.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            heartRate: w.fitbit_data.heart_rate_avg || 0,
            calories: w.fitbit_data.calories || 0,
            steps: w.fitbit_data.steps || 0,
            title: w.title,
        })),
        [fitbitWorkouts]
    );

    const totalStats = useMemo(() => {
        if (!hasRealData) return null;
        return {
            totalCalories: fitbitWorkouts.reduce((s, w) => s + (w.fitbit_data.calories || 0), 0),
            avgHR: Math.round(fitbitWorkouts.reduce((s, w) => s + (w.fitbit_data.heart_rate_avg || 0), 0) / fitbitWorkouts.length),
            totalKm: fitbitWorkouts.reduce((s, w) => s + (w.fitbit_data.distance_km || 0), 0).toFixed(1),
            totalElevation: Math.round(fitbitWorkouts.reduce((s, w) => s + (w.fitbit_data.elevation_gain_m || 0), 0)),
            sessions: fitbitWorkouts.length,
        };
    }, [fitbitWorkouts, hasRealData]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-2xl font-bold flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/10 rounded-xl">
                        <Watch className="text-cyan-400 w-6 h-6" />
                    </div>
                    Fitbit — {userName || 'Dashboard'}
                </h3>
                {hasRealData && (
                    <span className="text-xs font-bold px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                        {totalStats.sessions} sesiones con datos reales
                    </span>
                )}
            </div>

            {!hasRealData ? (
                <div className="bg-[#1e293b]/30 border border-white/5 rounded-3xl p-12 text-center">
                    <Watch className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400 font-bold text-lg">Sin datos de Fitbit aún</p>
                    <p className="text-gray-600 text-sm mt-2">Sincroniza tu cuenta desde los Ajustes para ver tus métricas reales aquí.</p>
                </div>
            ) : (
                <>
                    {/* Totals */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard icon={<Flame className="w-5 h-5" />} label="Calorías Totales" value={totalStats.totalCalories.toLocaleString('es-ES')} unit="kcal" color="text-orange-400" delay={0} />
                        <StatCard icon={<Heart className="w-5 h-5" />} label="Media Cardíaca" value={totalStats.avgHR} unit="bpm" color="text-rose-400" delay={0.1} />
                        <StatCard icon={<MapPin className="w-5 h-5" />} label="Distancia Total" value={totalStats.totalKm} unit="km" color="text-cyan-400" delay={0.2} />
                        <StatCard icon={<Mountain className="w-5 h-5" />} label="Desnivel Total" value={totalStats.totalElevation} unit="m" color="text-purple-400" delay={0.3} />
                    </div>

                    {/* Last session details */}
                    {lastSession && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#1e293b]/40 border border-white/5 rounded-3xl p-6"
                        >
                            <h4 className="font-bold text-gray-300 mb-4 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-yellow-400" />
                                Última Sesión: <span className="text-white ml-1">{fitbitWorkouts[fitbitWorkouts.length - 1]?.title}</span>
                                {lastSession.activity_name && (
                                    <span className="text-xs px-2 py-0.5 bg-white/5 rounded-full text-gray-400">{lastSession.activity_name}</span>
                                )}
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                {lastSession.heart_rate_avg && (
                                    <div className="text-center">
                                        <p className="text-rose-400 font-black text-2xl">{lastSession.heart_rate_avg} <span className="text-sm font-normal text-gray-500">bpm</span></p>
                                        <p className="text-xs text-gray-500 mt-1">Media cardíaca</p>
                                    </div>
                                )}
                                {lastSession.calories && (
                                    <div className="text-center">
                                        <p className="text-orange-400 font-black text-2xl">{lastSession.calories} <span className="text-sm font-normal text-gray-500">kcal</span></p>
                                        <p className="text-xs text-gray-500 mt-1">Calorías</p>
                                    </div>
                                )}
                                {lastSession.distance_km && (
                                    <div className="text-center">
                                        <p className="text-cyan-400 font-black text-2xl">{lastSession.distance_km?.toFixed(2)} <span className="text-sm font-normal text-gray-500">km</span></p>
                                        <p className="text-xs text-gray-500 mt-1">Distancia</p>
                                    </div>
                                )}
                                {lastSession.duration_ms && (
                                    <div className="text-center">
                                        <p className="text-indigo-400 font-black text-2xl">{Math.round(lastSession.duration_ms / 60000)} <span className="text-sm font-normal text-gray-500">min</span></p>
                                        <p className="text-xs text-gray-500 mt-1">Duración</p>
                                    </div>
                                )}
                            </div>

                            {/* AZM Bars */}
                            {(lastSession.azm_fat_burn || lastSession.azm_cardio || lastSession.azm_peak) && (
                                <div className="space-y-2 pt-4 border-t border-white/5">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Minutos de Zona Activa</p>
                                    <AzmBar label="Fat Burn" minutes={lastSession.azm_fat_burn} color="bg-yellow-400" />
                                    <AzmBar label="Cardio" minutes={lastSession.azm_cardio} color="bg-orange-500" />
                                    <AzmBar label="Peak" minutes={lastSession.azm_peak} color="bg-rose-500" />
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Chart: HR + Calories over sessions */}
                    {chartData.length > 1 && (
                        <div className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-3xl p-6">
                            <h4 className="font-bold text-white mb-1 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                Evolución cardíaca y calórica
                            </h4>
                            <p className="text-gray-500 text-xs mb-6">Frecuencia cardíaca media vs Calorías por sesión</p>
                            <div className="h-[240px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="gHR" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#fb7185" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#fb7185" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="gCal" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#fb923c" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#fb923c" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                        <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{ fill: '#4b5563', fontSize: 10 }} />
                                        <YAxis hide yAxisId="left" />
                                        <YAxis hide yAxisId="right" orientation="right" />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area yAxisId="left" type="monotone" name="FC Media" dataKey="heartRate" stroke="#fb7185" strokeWidth={2.5} fillOpacity={1} fill="url(#gHR)" unit=" bpm" />
                                        <Area yAxisId="right" type="monotone" name="Calorías" dataKey="calories" stroke="#fb923c" strokeWidth={2.5} fillOpacity={1} fill="url(#gCal)" unit=" kcal" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default FitbitPanel;
