import React from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell
} from 'recharts';
import { TrendingUp, Activity, Target } from 'lucide-react';

const Analytics = ({ workouts }) => {
    // Parse workouts for charts
    const volumeData = workouts.map(w => ({
        date: new Date(w.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
        totalWeight: w.exercise_sets.reduce((acc, set) => acc + (set.weight_kg || 0), 0),
        sets: w.exercise_sets.length
    })).reverse();

    const muscleGroups = workouts.reduce((acc, w) => {
        // Basic categorization based on title
        const title = w.title.toLowerCase();
        let category = 'Otros';
        if (title.includes('pecho')) category = 'Empuje';
        else if (title.includes('espalda')) category = 'Tirón';
        else if (title.includes('pierna')) category = 'Pierna';
        else if (title.includes('brazo')) category = 'Brazos';

        acc[category] = (acc[category] || 0) + 1;
        return acc;
    }, {});

    const distributionData = Object.entries(muscleGroups).map(([name, value]) => ({ name, value }));

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-[#1e293b] border border-white/10 p-4 rounded-2xl shadow-2xl backdrop-blur-md">
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">{label}</p>
                    <p className="text-white font-black text-xl">{payload[0].value} <span className="text-sm font-normal text-gray-400">kg total</span></p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Volume Chart */}
            <div className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-3xl p-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <TrendingUp className="text-cyan-400 w-5 h-5" />
                            Volumen de Carga
                        </h3>
                        <p className="text-gray-500 text-xs">Peso total movido por sesión (kg)</p>
                    </div>
                </div>

                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={volumeData}>
                            <defs>
                                <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#4b5563', fontSize: 10 }}
                            />
                            <YAxis hide />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="totalWeight"
                                stroke="#06b6d4"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorWeight)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Frequency Distribution */}
            <div className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-3xl p-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <Activity className="text-purple-400 w-5 h-5" />
                            Frecuencia de Entrenamiento
                        </h3>
                        <p className="text-gray-500 text-xs">Distribución por grupo muscular</p>
                    </div>
                </div>

                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={distributionData}>
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#4b5563', fontSize: 12 }}
                            />
                            <Tooltip cursor={{ fill: '#ffffff05' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px' }} />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {distributionData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899'][index % 4]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
