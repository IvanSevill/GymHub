import React from 'react';
import { Heart, Footprints, Moon, Flame, Battery, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const FitbitPanel = () => {
    // Mock data for display
    const metrics = [
        {
            label: 'Pasos Diarios',
            value: '12,482',
            goal: '10k',
            color: 'text-emerald-400',
            icon: <Footprints />,
            percent: 124
        },
        {
            label: 'Ritmo Cardíaco',
            value: '68',
            goal: 'BPM',
            color: 'text-rose-400',
            icon: <Heart />,
            percent: 0
        },
        {
            label: 'Sueño',
            value: '7h 24m',
            goal: '8h',
            color: 'text-indigo-400',
            icon: <Moon />,
            percent: 92
        },
        {
            label: 'Calorías Activas',
            value: '642',
            goal: '500',
            color: 'text-orange-400',
            icon: <Flame />,
            percent: 128
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-xl">
                        <ShieldCheck className="text-emerald-400 w-6 h-6" />
                    </div>
                    Dashboard de {userName || 'Salud'}
                </h3>
                <div className="flex items-center gap-2 px-4 py-1.5 bg-white/5 rounded-full border border-white/10">
                    <Battery className="text-emerald-400 w-4 h-4" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Sincronizado hace 5m</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map((m, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-[#1e293b]/40 border border-white/5 p-6 rounded-3xl relative overflow-hidden group hover:border-white/20 transition-all"
                    >
                        <div className={`absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity ${m.color}`}>
                            {React.cloneElement(m.icon, { size: 64 })}
                        </div>

                        <div className="relative z-10">
                            <div className={`p-3 bg-white/5 rounded-2xl inline-block mb-4 ${m.color}`}>
                                {m.icon}
                            </div>
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{m.label}</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black">{m.value}</span>
                                <span className="text-gray-500 text-sm font-medium">{m.goal}</span>
                            </div>

                            {m.percent > 0 && (
                                <div className="mt-4 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${m.color.replace('text-', 'bg-')}`}
                                        style={{ width: `${Math.min(m.percent, 100)}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default FitbitPanel;
